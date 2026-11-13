import crypto from 'node:crypto';
import {
  EVENT_FOR_STATUS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  REASON_REQUIRED,
  STATUS_LABEL,
  allowedTransitions,
  canTransition,
  isOrderSource,
} from './orderStatus.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const DUPLICATE_WINDOW = '15 minutes';
const NOTE_MAX = 1000;
const MAX_PRICE_PAISE = 10_000_000; // ₹1,00,000 per bottle: anything above is a typing mistake

/** BIGINT columns arrive as strings from pg; amounts in paise are well within Number's safe range. */
const num = (v) => (v == null ? null : Number(v));

/** Parses a price in rupees ("12", "12.5", 12.5) to paise without floating-point rounding. */
export function rupeesToPaise(value) {
  const s = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return NaN;
  const [rupees, fraction = ''] = s.split('.');
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
}

const publicProduct = (p) => ({
  code: p.code,
  name: p.name,
  size: p.bottle_size,
  unitPricePaise: num(p.unit_price_paise),
});

/** e.g. PRM-261107-7KQ3XA (date in IST + 6 random characters). */
export function makePublicId(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000).toISOString();
  const date = ist.slice(2, 4) + ist.slice(5, 7) + ist.slice(8, 10);
  const rand = [...crypto.randomBytes(6)].map((b) => ALPHABET[b % 32]).join('');
  return `PRM-${date}-${rand}`;
}

/** A refused admin action, with the HTTP status to answer with. */
export class OrderError extends Error {
  constructor(status, message, fields = undefined) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const SILENT = { info() {}, warn() {}, error() {} };

export function createEnquiryStore({ pool, notifier, log = SILENT, idGenerator = makePublicId }) {
  /**
   * Queues notifications inside a savepoint: if queuing fails, the order (or status change) is
   * still saved and the notifier's sweep queues the missing notifications on its next run.
   */
  async function queueSafely(client, enquiry, event, historyId) {
    await client.query('SAVEPOINT queue_notifications');
    try {
      const ids = await notifier.queueEvent(client, enquiry, event, historyId);
      await client.query('RELEASE SAVEPOINT queue_notifications');
      return ids;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT queue_notifications');
      log.error('could not queue notifications; the order is saved and they will be queued by the background sweep', {
        order: enquiry.public_id,
        event,
        error: err.message,
      });
      return [];
    }
  }

  /** The customer directory: one row per email + phone; the latest name, company, WhatsApp and address are kept. */
  async function upsertCustomer(client, v) {
    const { rows: [c] } = await client.query(
      `INSERT INTO customers (full_name, company_name, phone, email, whatsapp, address, city, state, pin_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email_key, phone) DO UPDATE
         SET full_name = EXCLUDED.full_name, company_name = COALESCE(EXCLUDED.company_name, customers.company_name),
             email = EXCLUDED.email, whatsapp = COALESCE(EXCLUDED.whatsapp, customers.whatsapp),
             address = COALESCE(EXCLUDED.address, customers.address), city = COALESCE(EXCLUDED.city, customers.city),
             state = COALESCE(EXCLUDED.state, customers.state), pin_code = COALESCE(EXCLUDED.pin_code, customers.pin_code)
       RETURNING id`,
      [v.name, v.company, v.phone, v.email, v.whatsapp ?? null, v.address ?? null, v.city ?? null, v.state ?? null, v.pinCode ?? null],
    );
    return c.id;
  }

  /**
   * Order lines for a product order, priced from the products table at this moment. A line has a
   * price only when the owner has configured one; the order total exists only when every line has one.
   */
  async function priceLines(client, items) {
    const { rows } = await client.query(
      'SELECT code, name, bottle_size, unit_price_paise, active FROM products WHERE code = ANY($1::text[]) FOR SHARE',
      [items.map((i) => i.productCode)],
    );
    const lines = items.map((it, i) => {
      const p = rows.find((x) => x.code === it.productCode);
      if (!p || !p.active) {
        throw new OrderError(422, 'One of the selected bottle sizes is not available right now. Please review your order.', {
          [`items.${it.productCode}`]: 'This size is not available right now.',
        });
      }
      const unit = num(p.unit_price_paise);
      return { position: i + 1, code: p.code, name: p.name, size: p.bottle_size, quantity: it.quantity, unit, lineTotal: unit == null ? null : unit * it.quantity };
    });
    const total = lines.every((l) => l.lineTotal != null) ? lines.reduce((sum, l) => sum + l.lineTotal, 0) : null;
    return { lines, total };
  }

  /**
   * Saves a validated enquiry / order, its customer, its files and its notification rows in one
   * transaction. Orders always start PENDING: nothing here can confirm an order.
   * Returns the existing record instead when the same browser request (clientRequestId)
   * or the same content was already submitted recently.
   */
  async function create(v, meta = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // serialise concurrent submissions of the same content (double clicks, retries)
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [v.contentHash]);

      const existing = async () => {
        if (v.clientRequestId) {
          const r = await client.query('SELECT * FROM enquiries WHERE client_request_id = $1', [v.clientRequestId]);
          if (r.rows[0]) return r.rows[0];
        }
        const r = await client.query(
          `SELECT * FROM enquiries WHERE content_hash = $1 AND created_at > now() - interval '${DUPLICATE_WINDOW}'
           ORDER BY created_at DESC LIMIT 1`,
          [v.contentHash],
        );
        return r.rows[0] ?? null;
      };

      const dup = await existing();
      if (dup) {
        await client.query('COMMIT');
        return { enquiry: dup, duplicate: true, notificationIds: [] };
      }

      const isOrder = isOrderSource(v.source);
      const isProductOrder = v.source === 'product_order';
      const priced = isProductOrder ? await priceLines(client, v.items) : null;
      const customerId = await upsertCustomer(client, v);
      let enquiry = null;
      for (let i = 0; i < 5 && !enquiry; i++) {
        const r = await client.query(
          `INSERT INTO enquiries (public_id, source, client_request_id, content_hash, customer_name, customer_phone,
                                  customer_email, company_name, bottle_size, quantity, delivery_date, customization,
                                  customer_message, ip_address, user_agent, order_status, status_changed_at,
                                  customer_whatsapp, whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_text, customer_id,
                                  delivery_address, delivery_city, delivery_state, delivery_pin_code, total_paise)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16,
                   CASE WHEN $16::text IS NULL THEN NULL ELSE now() END,
                   $17, $18, CASE WHEN $18 THEN now() END, $19, $20, $21, $22, $23, $24, $25)
           ON CONFLICT DO NOTHING RETURNING *`,
          [
            idGenerator(),
            v.source,
            v.clientRequestId,
            v.contentHash,
            v.name,
            v.phone,
            v.email,
            v.company,
            v.bottleSize,
            v.quantity,
            v.deliveryDate,
            v.customization ? JSON.stringify(v.customization) : null,
            v.message,
            meta.ip ?? null,
            meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
            isOrder ? 'PENDING' : null,
            // online orders always keep the WhatsApp number given; custom orders only when opted in
            isProductOrder ? v.whatsapp : v.whatsappOptIn ? v.whatsapp : null,
            !!v.whatsappOptIn,
            v.whatsappOptIn ? v.whatsappConsentText : null,
            customerId,
            v.address ?? null,
            v.city ?? null,
            v.state ?? null,
            v.pinCode ?? null,
            priced?.total ?? null,
          ],
        );
        enquiry = r.rows[0] ?? null;
        if (!enquiry) {
          const again = await existing(); // conflict on client_request_id → it's a duplicate
          if (again) {
            await client.query('COMMIT');
            return { enquiry: again, duplicate: true, notificationIds: [] };
          }
          // otherwise the random public_id collided — loop and try a new one
        }
      }
      if (!enquiry) throw new Error('Could not allocate a unique enquiry ID');

      for (const f of v.files) {
        await client.query(
          `INSERT INTO enquiry_files (enquiry_id, kind, filename, content_type, size_bytes, data) VALUES ($1, $2, $3, $4, $5, $6)`,
          [enquiry.id, f.kind, f.filename, f.contentType, f.data.length, f.data],
        );
      }
      for (const l of priced?.lines ?? []) {
        await client.query(
          `INSERT INTO order_items (enquiry_id, position, product_code, product_name, bottle_size, quantity, unit_price_paise, line_total_paise)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [enquiry.id, l.position, l.code, l.name, l.size, l.quantity, l.unit, l.lineTotal],
        );
      }

      let notificationIds;
      if (isOrder) {
        const { rows: [h] } = await client.query(
          `INSERT INTO order_status_history (enquiry_id, from_status, to_status, actor_label) VALUES ($1, NULL, 'PENDING', 'Customer (website)') RETURNING id`,
          [enquiry.id],
        );
        notificationIds = await queueSafely(client, enquiry, 'order_received', h.id);
      } else {
        notificationIds = await queueSafely(client, enquiry, 'enquiry_received', null);
      }
      await client.query('COMMIT');
      return { enquiry, duplicate: false, notificationIds };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Owner action: moves an order to its next status. The row is locked; a status can be reached
   * only once; and when `expectedFrom` is given it must match the current status. So double
   * clicks, retried API calls or two administrators acting at once can never approve (or notify)
   * twice. Queues owner + customer email + WhatsApp for the new status.
   */
  async function transition({ publicId, to, expectedFrom = null, note, admin }) {
    if (!ORDER_STATUSES.includes(to)) {
      throw new OrderError(422, `Unknown order status. Use one of: ${ORDER_STATUSES.join(', ')}.`, { status: 'Unknown status' });
    }
    if (expectedFrom != null && !ORDER_STATUSES.includes(expectedFrom)) throw new OrderError(422, 'Unknown current status.');
    if (note != null && typeof note !== 'string') throw new OrderError(422, 'Invalid note.');
    const text = (note ?? '').replace(/\u0000/g, '').trim();
    if (text.length > NOTE_MAX) throw new OrderError(422, `Please keep the note under ${NOTE_MAX} characters.`, { note: 'Too long' });
    if (REASON_REQUIRED.has(to) && text.length < 3) {
      throw new OrderError(422, 'Please enter a reason. It is included in the message to the customer.', { note: 'Reason required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [order] } = await client.query('SELECT * FROM enquiries WHERE public_id = $1 FOR UPDATE', [publicId]);
      if (!order) throw new OrderError(404, 'Order not found.');
      if (!isOrderSource(order.source)) throw new OrderError(404, 'Order not found. (This is a general enquiry, not an order.)');
      if (order.order_status === to) {
        throw new OrderError(409, `This order is already ${STATUS_LABEL[to]}. Nothing was changed and no notifications were sent again.`);
      }
      if (expectedFrom != null && order.order_status !== expectedFrom) {
        throw new OrderError(409, `This order was changed to ${STATUS_LABEL[order.order_status]} in the meantime. Please review it again.`);
      }
      if (!canTransition(order.order_status, to)) {
        throw new OrderError(409, `An order that is ${STATUS_LABEL[order.order_status]} cannot be changed to ${STATUS_LABEL[to]}.`);
      }

      const { rows: [updated] } = await client.query(
        `UPDATE enquiries SET order_status = $2, status_changed_at = now(),
                accepted_at = CASE WHEN $2 = 'ACCEPTED' THEN now() ELSE accepted_at END,
                rejected_at = CASE WHEN $2 = 'REJECTED' THEN now() ELSE rejected_at END,
                rejection_reason = CASE WHEN $2 = 'REJECTED' THEN $3 ELSE rejection_reason END,
                cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() ELSE cancelled_at END,
                cancellation_reason = CASE WHEN $2 = 'CANCELLED' THEN $3 ELSE cancellation_reason END
          WHERE id = $1 RETURNING *`,
        [order.id, to, text || null],
      );
      const actor = `${admin.name} <${admin.email}>`;
      const { rows: [h] } = await client.query(
        `INSERT INTO order_status_history (enquiry_id, from_status, to_status, note, actor_admin_id, actor_label)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [order.id, order.order_status, to, text || null, admin.id, admin.name],
      );
      if (REASON_REQUIRED.has(to)) await notifier.supersede(client, order.id, to);
      const notificationIds = await queueSafely(client, updated, EVENT_FOR_STATUS[to], h.id);
      await client.query('COMMIT');
      return { order: updated, history: h, notificationIds, actor };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505') throw new OrderError(409, 'This status change was already recorded.'); // unique (enquiry, status)
      throw err;
    } finally {
      client.release();
    }
  }

  /** What the customer may see right after submitting: acknowledgement status per channel. */
  async function publicSummary(enquiryId) {
    const { rows } = await pool.query(
      `SELECT audience, channel, status, test_mode, recipient FROM notifications
        WHERE enquiry_id = $1 AND event IN ('enquiry_received', 'order_received')`,
      [enquiryId],
    );
    const { rows: [e] } = await pool.query('SELECT order_status FROM enquiries WHERE id = $1', [enquiryId]);
    const toPublic = (r) => {
      if (r.test_mode && ['accepted', 'sent', 'delivered', 'read'].includes(r.status)) return 'test_mode';
      if (['pending', 'sending', 'retrying'].includes(r.status)) return 'sending';
      if (['failed', 'bounced'].includes(r.status)) return 'failed';
      return r.status === 'sent' || r.status === 'read' ? 'delivered' : r.status; // accepted | delivered
    };
    const pick = (audience, channel) => {
      const r = rows.find((x) => x.audience === audience && x.channel === channel);
      return r && r.status !== 'skipped' ? { status: toPublic(r), to: r.recipient } : null;
    };
    // the company's WhatsApp copy: lets the website offer click-to-chat when the Cloud API did not send it
    const ownerWhatsApp = rows.find((x) => x.audience === 'owner' && x.channel === 'whatsapp');
    return {
      orderStatus: e?.order_status ?? null,
      teamWhatsApp: !ownerWhatsApp ? null : ownerWhatsApp.status === 'skipped' ? 'not_sent' : toPublic(ownerWhatsApp),
      customerEmail: pick('customer', 'email'),
      customerWhatsApp: pick('customer', 'whatsapp'),
      teamNotified: rows.some(
        (r) => r.audience === 'owner' && !r.test_mode && ['accepted', 'sent', 'delivered', 'read'].includes(r.status),
      ),
    };
  }

  /**
   * What the customer sees on the confirmation screen right after placing an online order: the
   * saved order exactly as stored (server-side prices, not what the browser computed).
   */
  async function orderConfirmation(enquiryId) {
    const { rows: [e] } = await pool.query('SELECT * FROM enquiries WHERE id = $1', [enquiryId]);
    if (!e || e.source !== 'product_order') return null;
    const { rows: items } = await pool.query(
      `SELECT product_code, product_name, bottle_size, quantity, unit_price_paise, line_total_paise
         FROM order_items WHERE enquiry_id = $1 ORDER BY position`,
      [enquiryId],
    );
    return {
      createdAt: e.created_at,
      items: items.map((i) => ({
        code: i.product_code,
        name: i.product_name,
        size: i.bottle_size,
        quantity: i.quantity,
        unitPricePaise: num(i.unit_price_paise),
        lineTotalPaise: num(i.line_total_paise),
      })),
      totalPaise: num(e.total_paise),
      customer: { name: e.customer_name, phone: e.customer_phone, whatsapp: e.customer_whatsapp, email: e.customer_email },
      delivery: { address: e.delivery_address, city: e.delivery_city, state: e.delivery_state, pinCode: e.delivery_pin_code },
      instructions: e.customer_message,
      whatsappOptIn: e.whatsapp_opt_in,
    };
  }

  /**
   * Admin list. type: order (both order types) | product_order | custom_bottle | enquiry | all;
   * status: an order status; q: order ID, name, phone or WhatsApp (any formatting), email, company.
   */
  async function list({ type = 'order', status = null, q = '', limit = 100, before = null } = {}) {
    const where = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (type === 'order') where.push(`e.source IN ('custom_bottle', 'product_order')`);
    else if (ORDER_SOURCES.includes(type)) add('e.source = ?', type);
    else if (type === 'enquiry') where.push(`e.source = 'contact'`);
    if (status && ORDER_STATUSES.includes(status)) add('e.order_status = ?', status);
    const term = String(q ?? '').trim().slice(0, 100);
    if (term) {
      params.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const p = `$${params.length}`;
      // phone numbers are stored as +91XXXXXXXXXX: also match the digits however they were typed
      const digits = term.replace(/\D/g, '');
      let phoneDigits = '';
      if (digits.length >= 4) {
        params.push(`%${digits}%`);
        const d = `$${params.length}`;
        phoneDigits = ` OR regexp_replace(e.customer_phone, '\\D', '', 'g') LIKE ${d} OR regexp_replace(COALESCE(e.customer_whatsapp, ''), '\\D', '', 'g') LIKE ${d}`;
      }
      where.push(
        `(e.public_id ILIKE ${p} OR e.customer_name ILIKE ${p} OR e.customer_phone ILIKE ${p} OR e.customer_email ILIKE ${p} OR e.company_name ILIKE ${p}${phoneDigits})`,
      );
    }
    if (before && !Number.isNaN(Date.parse(before))) add('e.created_at < ?', before);
    params.push(Math.min(Math.max(Number(limit) || 100, 1), 200));
    const { rows } = await pool.query(
      `SELECT e.public_id, e.source, e.order_status, e.customer_name, e.company_name, e.customer_phone, e.customer_email,
              e.bottle_size, e.quantity, e.delivery_date, e.created_at, e.updated_at, e.status_changed_at, e.whatsapp_opt_in, e.customer_id,
              e.delivery_city, e.total_paise,
              (SELECT json_agg(json_build_object('size', oi.bottle_size, 'quantity', oi.quantity) ORDER BY oi.position)
                 FROM order_items oi WHERE oi.enquiry_id = e.id) AS items,
              count(n.id) FILTER (WHERE n.status IN ('failed', 'bounced'))::int AS failed_notifications,
              count(n.id) FILTER (WHERE n.status IN ('pending', 'sending', 'retrying'))::int AS pending_notifications,
              count(n.id) FILTER (WHERE n.status = 'skipped')::int AS skipped_notifications,
              count(n.id) FILTER (WHERE n.status IN ('accepted', 'sent', 'delivered', 'read'))::int AS sent_notifications
         FROM enquiries e LEFT JOIN notifications n ON n.enquiry_id = e.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY e.id ORDER BY e.created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => ({ ...r, total_paise: num(r.total_paise) }));
  }

  async function counts() {
    const { rows } = await pool.query(
      `SELECT COALESCE(order_status, 'ENQUIRY') AS key, count(*)::int AS n FROM enquiries GROUP BY 1`,
    );
    const out = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    out.ENQUIRY = 0;
    for (const r of rows) out[r.key] = r.n;
    out.ALL_ORDERS = ORDER_STATUSES.reduce((sum, s) => sum + out[s], 0);
    return out;
  }

  async function detail(publicId) {
    const { rows: [e] } = await pool.query('SELECT * FROM enquiries WHERE public_id = $1', [publicId]);
    if (!e) return null;
    const [{ rows: notifications }, { rows: files }, { rows: events }, { rows: history }] = await Promise.all([
      pool.query(
        `SELECT n.id, n.event, n.audience, n.channel, n.provider, n.recipient, n.status, n.test_mode, n.attempts, n.next_attempt_at,
                n.provider_message_id, n.template_name, n.last_error, n.accepted_at, n.delivered_at, n.created_at, n.updated_at,
                h.created_at AS event_at
           FROM notifications n LEFT JOIN order_status_history h ON h.id = n.history_id
          WHERE n.enquiry_id = $1
          ORDER BY COALESCE(h.created_at, n.created_at), n.audience DESC, n.channel`,
        [e.id],
      ),
      pool.query('SELECT kind, filename, content_type, size_bytes, created_at FROM enquiry_files WHERE enquiry_id = $1 ORDER BY kind', [e.id]),
      pool.query(
        `SELECT ev.notification_id, ev.provider, ev.event, ev.occurred_at, ev.detail, ev.received_at FROM notification_events ev
           JOIN notifications n ON n.id = ev.notification_id WHERE n.enquiry_id = $1 ORDER BY ev.received_at`,
        [e.id],
      ),
      pool.query(
        `SELECT h.id, h.from_status, h.to_status, h.note, h.actor_label, a.email AS actor_email, h.created_at
           FROM order_status_history h LEFT JOIN admin_users a ON a.id = h.actor_admin_id
          WHERE h.enquiry_id = $1 ORDER BY h.created_at, h.id`,
        [e.id],
      ),
    ]);
    const { rows: [customer] } = await pool.query(
      `SELECT c.id, c.full_name, c.company_name, c.phone, c.email, c.whatsapp, c.address, c.city, c.state, c.pin_code, c.created_at,
              (SELECT count(*)::int FROM enquiries x WHERE x.customer_id = c.id AND x.source IN ('custom_bottle', 'product_order')) AS order_count
         FROM customers c WHERE c.id = $1`,
      [e.customer_id],
    );
    const { rows: items } = await pool.query(
      `SELECT position, product_code, product_name, bottle_size, quantity, unit_price_paise, line_total_paise
         FROM order_items WHERE enquiry_id = $1 ORDER BY position`,
      [e.id],
    );
    const { content_hash: _hash, ...rest } = e;
    return {
      ...rest,
      total_paise: num(e.total_paise),
      items: items.map((i) => ({ ...i, unit_price_paise: num(i.unit_price_paise), line_total_paise: num(i.line_total_paise) })),
      customer: customer ?? null,
      notifications,
      files,
      events,
      history,
      allowedTransitions: e.order_status ? allowedTransitions(e.order_status) : [],
    };
  }

  /** The products customers can order, with the configured price per bottle (null = not configured). */
  async function products() {
    const { rows } = await pool.query('SELECT * FROM products WHERE active ORDER BY sort_order, code');
    return rows.map(publicProduct);
  }

  /** All products with who last changed each price (admin). */
  async function adminProducts() {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY sort_order, code');
    return rows.map((p) => ({ ...publicProduct(p), active: p.active, priceUpdatedAt: p.price_updated_at, priceUpdatedBy: p.price_updated_by }));
  }

  /**
   * Owner action: sets (or clears, with null) the price per bottle of one product, in rupees.
   * Applies to new orders only; existing orders keep the price they were placed with.
   */
  async function setProductPrice({ code, unitPrice, admin }) {
    let paise = null;
    if (unitPrice !== null && unitPrice !== '') {
      paise = rupeesToPaise(unitPrice);
      if (!Number.isInteger(paise) || paise < 1 || paise > MAX_PRICE_PAISE) {
        throw new OrderError(422, 'Enter the price per bottle in rupees, from ₹0.01 to ₹1,00,000 (e.g. 12 or 12.50).', { unitPrice: 'Invalid price' });
      }
    }
    const { rows: [p] } = await pool.query(
      `UPDATE products SET unit_price_paise = $2, price_updated_at = now(), price_updated_by = $3 WHERE code = $1 RETURNING *`,
      [code, paise, `${admin.name} <${admin.email}>`],
    );
    if (!p) throw new OrderError(404, 'Product not found.');
    log.info('product price updated', { product: p.code, configured: paise != null, by: admin.email });
    return { ...publicProduct(p), active: p.active, priceUpdatedAt: p.price_updated_at, priceUpdatedBy: p.price_updated_by };
  }

  async function file(publicId, kind) {
    const { rows: [f] } = await pool.query(
      `SELECT f.filename, f.content_type, f.data FROM enquiry_files f JOIN enquiries e ON e.id = f.enquiry_id
        WHERE e.public_id = $1 AND f.kind = $2`,
      [publicId, kind],
    );
    return f ?? null;
  }

  return { create, transition, publicSummary, orderConfirmation, list, counts, detail, file, products, adminProducts, setProductPrice };
}
