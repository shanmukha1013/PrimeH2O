// Notification service. Every order event notifies the owner AND the customer by email AND
// WhatsApp. Each (enquiry, event, audience, channel) is exactly one row, so duplicates are
// impossible. Rows are claimed with row locks, sent through their provider, retried with
// backoff on temporary failures, and advanced only by provider-confirmed status events.
// Channels are independent: one failing never stops or cancels another.
import { EVENT_FOR_STATUS, POST_ACCEPTANCE, STATUS_FOR_EVENT, STATUS_LABEL } from './orderStatus.js';
import { ProviderError } from './providers.js';
import { buildEmail, buildWhatsApp, whatsappTemplateFor } from './templates.js';

const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200];
const ATTACHABLE = new Set(['image/png', 'image/jpeg', 'image/gif']); // types Brevo accepts as attachments
const MAX_ATTACH_BYTES = 7 * 1024 * 1024;
const POSITIVE_RANK = { accepted: 1, sent: 2, delivered: 3, read: 4 };

// Orders: owner + customer, each by email + WhatsApp. Contact-form enquiries are not orders and
// have no WhatsApp opt-in, so the customer gets the email acknowledgement only.
const ORDER_CHANNELS = [
  ['owner', 'email'],
  ['owner', 'whatsapp'],
  ['customer', 'email'],
  ['customer', 'whatsapp'],
];
const ENQUIRY_CHANNELS = [
  ['owner', 'email'],
  ['owner', 'whatsapp'],
  ['customer', 'email'],
];

// Brevo webhook ("hard_bounce") and events-API ("hardBounces") names → our status (null = record only)
const EMAIL_EVENT_STATUS = {
  delivered: 'delivered',
  opened: 'delivered',
  unique_opened: 'delivered',
  click: 'delivered',
  clicks: 'delivered',
  proxy_open: 'delivered',
  loadedByProxy: 'delivered',
  hard_bounce: 'bounced',
  hardBounces: 'bounced',
  invalid_email: 'bounced',
  invalid: 'bounced',
  blocked: 'bounced',
  error: 'failed',
};
const WHATSAPP_STATUS = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
const OPT_OUT_WORDS = new Set(['STOP', 'STOP ALL', 'UNSUBSCRIBE']);

const clip = (s, n = 500) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

export function shouldAdvance(current, next) {
  if (!next) return false;
  if (next === 'failed' || next === 'bounced') return current === 'accepted' || current === 'sent';
  return current in POSITIVE_RANK && POSITIVE_RANK[next] > POSITIVE_RANK[current];
}

export function createNotifier({ pool, config, email, whatsapp, log }) {
  const adminUrl = config.publicSiteUrl ? `${config.publicSiteUrl}/admin` : '';

  /** Recipient of one (event, audience, channel), and the reason it cannot be sent, if any. */
  function route(enquiry, event, audience, channel) {
    const provider = channel === 'email' ? email : whatsapp;
    let recipient;
    let skip = null;
    if (audience === 'owner') {
      recipient = channel === 'email' ? config.business.email : `+${config.whatsapp.notifyTo}`;
    } else if (channel === 'email') {
      recipient = enquiry.customer_email || '(not provided)';
      if (!enquiry.customer_email) skip = 'Customer did not provide an email address';
    } else {
      recipient = enquiry.customer_whatsapp || '(not opted in)';
      if (!enquiry.whatsapp_opt_in) {
        skip = enquiry.whatsapp_opt_out_at
          ? 'Customer opted out of WhatsApp updates (replied STOP)'
          : 'Customer did not opt in to WhatsApp updates';
      }
    }
    if (!skip && !provider.configured) {
      skip =
        channel === 'email'
          ? `Email (Brevo) not configured: missing ${provider.missing.join(', ')}`
          : `WhatsApp Cloud API not configured: missing ${provider.missing.join(', ')}`;
    }
    return {
      provider: channel === 'email' ? 'brevo' : 'meta_whatsapp',
      recipient,
      skip,
      templateName: channel === 'whatsapp' ? whatsappTemplateFor(event, audience) : null,
    };
  }

  /** Inserts the notification rows for one event (inside the caller's transaction). Returns ids to send. */
  async function queueEvent(client, enquiry, event, historyId = null) {
    const ids = [];
    for (const [audience, channel] of event === 'enquiry_received' ? ENQUIRY_CHANNELS : ORDER_CHANNELS) {
      const r = route(enquiry, event, audience, channel);
      const res = await client.query(
        `INSERT INTO notifications (enquiry_id, event, audience, channel, provider, recipient, status, last_error, history_id, template_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (enquiry_id, event, audience, channel) DO NOTHING RETURNING id, status`,
        [enquiry.id, event, audience, channel, r.provider, r.recipient, r.skip ? 'skipped' : 'pending', r.skip, historyId, r.templateName],
      );
      if (res.rows[0]?.status === 'pending') ids.push(res.rows[0].id);
    }
    return ids;
  }

  /** When an order is rejected or cancelled, messages still waiting about earlier steps are dropped. */
  async function supersede(client, enquiryId, status) {
    await client.query(
      `UPDATE notifications SET status = 'skipped', locked_until = NULL, updated_at = now(),
              last_error = $2
        WHERE enquiry_id = $1 AND status IN ('pending', 'retrying')`,
      [enquiryId, `Superseded: the order was marked ${STATUS_LABEL[status]} before this could be sent`],
    );
  }

  async function claim({ ids = null, limit = 10 } = {}) {
    const params = ids ? [limit, ids] : [limit];
    const r = await pool.query(
      `UPDATE notifications SET status = 'sending', attempts = attempts + 1,
              locked_until = now() + interval '3 minutes', updated_at = now()
        WHERE id IN (SELECT id FROM notifications
                      WHERE status IN ('pending', 'retrying') AND next_attempt_at <= now()
                      ${ids ? 'AND id = ANY($2::bigint[])' : ''}
                      ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      params,
    );
    return r.rows;
  }

  async function send(n) {
    const provider = n.channel === 'email' ? email : whatsapp;
    if (!provider.configured) throw new ProviderError(`${n.channel} provider not configured (missing ${provider.missing.join(', ')})`);
    const { rows: [enquiry] } = await pool.query('SELECT * FROM enquiries WHERE id = $1', [n.enquiry_id]);
    if (!enquiry) throw new Error('Enquiry no longer exists');

    let history = null;
    if (n.event !== 'enquiry_received') {
      const status = STATUS_FOR_EVENT[n.event];
      ({ rows: [history] } = await pool.query('SELECT * FROM order_status_history WHERE enquiry_id = $1 AND to_status = $2', [
        enquiry.id,
        status,
      ]));
      // Safety net: never announce a status the order did not reach, and never confirm without owner approval.
      if (!history) throw new Error(`Refusing to send: order never reached ${status}`);
      if (POST_ACCEPTANCE.has(status) && !enquiry.accepted_at) throw new Error('Refusing to send: order has not been accepted by the owner');
    }
    if (n.audience === 'customer' && n.channel === 'whatsapp' && !enquiry.whatsapp_opt_in) {
      throw new Error('Customer is not opted in to WhatsApp updates');
    }

    const withFiles = n.audience === 'owner' && n.channel === 'email' && (n.event === 'enquiry_received' || n.event === 'order_received');
    const { rows: files } = await pool.query(
      `SELECT kind, filename, content_type, size_bytes${withFiles ? ', data' : ''} FROM enquiry_files WHERE enquiry_id = $1 ORDER BY kind`,
      [n.enquiry_id],
    );

    if (n.channel === 'email') {
      const attachments = [];
      if (withFiles) {
        let total = 0;
        for (const f of files) {
          if (!ATTACHABLE.has(f.content_type) || total + f.size_bytes > MAX_ATTACH_BYTES) continue;
          total += f.size_bytes;
          attachments.push({ name: `${enquiry.public_id}-${f.filename}`, content: f.data });
        }
      }
      const link = adminUrl ? `${adminUrl}#${enquiry.public_id}` : ''; // opens this order in the dashboard
      const msg = buildEmail({ event: n.event, audience: n.audience, enquiry, files, history, adminUrl: link, attached: attachments.length > 0 });
      const toOwner = n.audience === 'owner';
      return email.sendEmail({
        to: { email: n.recipient, name: toOwner ? 'PRIME H₂O' : enquiry.customer_name },
        ...msg,
        replyTo: toOwner
          ? enquiry.customer_email
            ? { email: enquiry.customer_email, name: enquiry.customer_name }
            : undefined
          : { email: config.business.email, name: 'PRIME H₂O' },
        attachments,
        tags: [n.event, `to-${n.audience}`],
      });
    }
    const { template, params } = buildWhatsApp({ event: n.event, audience: n.audience, enquiry, files, history });
    return whatsapp.sendTemplate({ to: n.recipient.replace(/\D/g, ''), template, params });
  }

  async function deliver(n) {
    const what = { notification: n.id, event: n.event, audience: n.audience, channel: n.channel };
    try {
      const result = await send(n);
      await pool.query(
        `UPDATE notifications SET status = 'accepted', test_mode = $2, provider_message_id = $3,
                provider_response = $4::jsonb, accepted_at = now(), last_error = NULL, locked_until = NULL, updated_at = now()
          WHERE id = $1 AND status = 'sending'`,
        [n.id, !!result.response?.sandbox, result.messageId, JSON.stringify(result.response ?? {})],
      );
      log.info('notification accepted by provider', { ...what, testMode: !!result.response?.sandbox });
    } catch (err) {
      const retry = !!err.retryable && n.attempts < config.worker.maxAttempts;
      const delay = BACKOFF_SECONDS[Math.min(n.attempts - 1, BACKOFF_SECONDS.length - 1)];
      await pool.query(
        `UPDATE notifications SET status = $2, last_error = $3, provider_response = COALESCE($4::jsonb, provider_response),
                next_attempt_at = now() + make_interval(secs => $5), locked_until = NULL, updated_at = now()
          WHERE id = $1 AND status = 'sending'`,
        [n.id, retry ? 'retrying' : 'failed', clip(err.message), err.body ? JSON.stringify(err.body) : null, delay],
      );
      log.warn(retry ? 'notification failed, will retry' : 'notification failed permanently', {
        ...what,
        attempt: n.attempts,
        error: clip(err.message, 300),
      });
    }
  }

  /** Sends specific notifications now (right after an order is saved or its status changes). */
  async function processIds(ids) {
    if (!ids.length) return;
    const claimed = await claim({ ids, limit: ids.length });
    await Promise.all(claimed.map(deliver));
  }

  /** A send that was interrupted mid-flight has an unknown outcome; do not resend it blindly. */
  async function releaseStale() {
    const r = await pool.query(
      `UPDATE notifications SET status = 'failed', locked_until = NULL, updated_at = now(),
              last_error = 'Sending was interrupted (server stopped mid-send). Not retried automatically to avoid a duplicate; check the provider log, then retry from the admin dashboard if needed.'
        WHERE status = 'sending' AND locked_until < now() RETURNING id`,
    );
    if (r.rowCount) log.warn('marked interrupted notifications as failed', { ids: r.rows.map((x) => x.id) });
  }

  /**
   * Safety net: recent orders, status changes and enquiries whose notifications were never
   * queued (e.g. a database error at that moment) get them queued now. Idempotent.
   */
  async function ensureQueued() {
    const { rows: changes } = await pool.query(
      `SELECT h.id AS history_id, h.to_status FROM order_status_history h
        WHERE h.created_at > now() - interval '2 days'
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.history_id = h.id)
        ORDER BY h.id LIMIT 50`,
    );
    const { rows: enquiries } = await pool.query(
      `SELECT e.id FROM enquiries e
        WHERE e.source = 'contact' AND e.created_at > now() - interval '2 days'
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.enquiry_id = e.id)
        ORDER BY e.id LIMIT 50`,
    );
    let queued = 0;
    for (const c of changes) {
      const { rows: [e] } = await pool.query(
        'SELECT e.* FROM enquiries e JOIN order_status_history h ON h.enquiry_id = e.id WHERE h.id = $1',
        [c.history_id],
      );
      queued += (await queueEvent(pool, e, EVENT_FOR_STATUS[c.to_status], c.history_id)).length;
    }
    for (const { id } of enquiries) {
      const { rows: [e] } = await pool.query('SELECT * FROM enquiries WHERE id = $1', [id]);
      queued += (await queueEvent(pool, e, 'enquiry_received', null)).length;
    }
    if (changes.length || enquiries.length) log.warn('queued notifications that were missing', { orders: changes.length, enquiries: enquiries.length, queued });
  }

  async function tick() {
    await releaseStale();
    await ensureQueued();
    const claimed = await claim({ limit: 20 });
    await Promise.all(claimed.map(deliver));
  }

  /**
   * Admin action: sends a failed or skipped notification again (e.g. after WhatsApp credentials were
   * added). Never re-sends one the provider already accepted.
   */
  async function requeue(notificationId, actorLabel) {
    const { rows: [n] } = await pool.query('SELECT * FROM notifications WHERE id = $1', [notificationId]);
    if (!n) return { status: 404, error: 'Notification not found.' };
    if (!['failed', 'skipped'].includes(n.status)) {
      return { status: 409, error: 'Only failed or skipped notifications can be retried. Accepted messages are never sent twice.' };
    }
    const { rows: [enquiry] } = await pool.query('SELECT * FROM enquiries WHERE id = $1', [n.enquiry_id]);
    const r = route(enquiry, n.event, n.audience, n.channel);
    if (r.skip) return { status: 409, error: `Cannot send this notification: ${r.skip}.` };
    const u = await pool.query(
      `UPDATE notifications SET status = 'pending', recipient = $2, template_name = $3, attempts = 0, next_attempt_at = now(),
              last_error = NULL, updated_at = now()
        WHERE id = $1 AND status IN ('failed', 'skipped') RETURNING id`,
      [n.id, r.recipient, r.templateName],
    );
    if (!u.rowCount) return { status: 409, error: 'This notification was already retried.' };
    await pool.query(
      `INSERT INTO notification_events (notification_id, provider, event, occurred_at, detail) VALUES ($1, 'admin', 'manual_retry', now(), $2)`,
      [n.id, clip(`Retried by ${actorLabel} (previous status: ${n.status}${n.last_error ? `; ${n.last_error}` : ''})`, 500)],
    );
    await processIds([n.id]);
    return { status: 200, id: n.id };
  }

  async function applyEvent({ provider, messageId, event, status, occurredAt, detail, payload }) {
    const { rows: [n] } = await pool.query('SELECT id, status FROM notifications WHERE provider = $1 AND provider_message_id = $2', [
      provider,
      messageId,
    ]);
    if (!n) return false;
    await pool.query(
      `INSERT INTO notification_events (notification_id, provider, event, provider_message_id, occurred_at, detail, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING`,
      [n.id, provider, event, messageId, occurredAt, clip(detail, 500) ?? null, JSON.stringify(payload ?? {})],
    );
    if (shouldAdvance(n.status, status)) {
      await pool.query(
        `UPDATE notifications SET status = $2,
                delivered_at = CASE WHEN $2 IN ('delivered', 'read') THEN COALESCE(delivered_at, $3::timestamptz, now()) ELSE delivered_at END,
                last_error = CASE WHEN $2 IN ('failed', 'bounced') THEN $4 ELSE last_error END,
                updated_at = now()
          WHERE id = $1`,
        [n.id, status, occurredAt, clip(detail) ?? `Provider reported ${event}`],
      );
    }
    return true;
  }

  const applyEmailEvent = ({ messageId, event, occurredAt, detail, payload }) =>
    applyEvent({ provider: 'brevo', messageId, event, status: EMAIL_EVENT_STATUS[event] ?? null, occurredAt, detail, payload });

  async function applyWhatsAppStatus(s) {
    const err = s.errors?.[0];
    return applyEvent({
      provider: 'meta_whatsapp',
      messageId: s.id,
      event: s.status,
      status: WHATSAPP_STATUS[s.status] ?? null,
      occurredAt: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
      detail: err ? `${err.code ?? ''} ${err.title ?? ''} ${err.error_data?.details ?? err.message ?? ''}`.trim() : null,
      payload: s,
    });
  }

  /** Incoming WhatsApp message: STOP opts the customer out of WhatsApp updates, START opts back in. */
  async function applyWhatsAppMessage(m) {
    const text = String(m.text?.body ?? m.button?.text ?? '').trim().toUpperCase();
    const digits = String(m.from ?? '').replace(/\D/g, '');
    if (digits.length < 8) return null;
    const from = `+${digits}`;
    if (OPT_OUT_WORDS.has(text)) {
      const r = await pool.query(
        `UPDATE enquiries SET whatsapp_opt_in = false, whatsapp_opt_out_at = now()
          WHERE customer_whatsapp = $1 AND whatsapp_opt_in RETURNING id, public_id`,
        [from],
      );
      if (r.rowCount) {
        await pool.query(
          `UPDATE notifications SET status = 'skipped', locked_until = NULL, updated_at = now(),
                  last_error = 'Customer opted out of WhatsApp updates (replied STOP)'
            WHERE enquiry_id = ANY($1::bigint[]) AND audience = 'customer' AND channel = 'whatsapp' AND status IN ('pending', 'retrying')`,
          [r.rows.map((x) => x.id)],
        );
        log.info('customer opted out of WhatsApp updates', { orders: r.rows.map((x) => x.public_id) });
      }
      return 'opted_out';
    }
    if (text === 'START') {
      const r = await pool.query(
        `UPDATE enquiries SET whatsapp_opt_in = true, whatsapp_opt_in_at = now(), whatsapp_opt_out_at = NULL,
                whatsapp_opt_in_text = COALESCE(whatsapp_opt_in_text || ' | ', '') || 'Re-subscribed by sending START on WhatsApp at ' || now()::text
          WHERE customer_whatsapp = $1 AND NOT whatsapp_opt_in AND whatsapp_opt_out_at IS NOT NULL RETURNING public_id`,
        [from],
      );
      if (r.rowCount) log.info('customer opted back in to WhatsApp updates', { orders: r.rows.map((x) => x.public_id) });
      return 'opted_in';
    }
    return null;
  }

  /** Pulls delivery events from Brevo for recently accepted emails (works without a public webhook URL). */
  async function pollEmailStatuses() {
    if (!email.configured) return;
    const { rows } = await pool.query(
      `SELECT id, provider_message_id FROM notifications
        WHERE provider = 'brevo' AND status = 'accepted' AND NOT test_mode AND provider_message_id IS NOT NULL
          AND accepted_at > now() - interval '3 days'
          AND (last_status_check_at IS NULL OR last_status_check_at < now() - interval '4 minutes')
        ORDER BY accepted_at LIMIT 25`,
    );
    for (const n of rows) {
      try {
        const data = await email.events(n.provider_message_id);
        for (const ev of data.events ?? []) {
          await applyEmailEvent({
            messageId: n.provider_message_id,
            event: ev.event,
            occurredAt: ev.date ? new Date(ev.date).toISOString() : null,
            detail: ev.reason ?? null,
            payload: { event: ev.event, date: ev.date, reason: ev.reason ?? null },
          });
        }
        await pool.query('UPDATE notifications SET last_status_check_at = now() WHERE id = $1', [n.id]);
      } catch (err) {
        log.warn('email status poll failed', { notification: n.id, error: clip(err.message, 200) });
      }
    }
  }

  let timers = [];
  function start() {
    // each job skips a tick while its previous run is still in progress
    const run = (fn, flag) => async () => {
      if (flag.v) return;
      flag.v = true;
      try {
        await fn();
      } catch (err) {
        log.error('background job failed', { error: clip(err.message, 300) });
      } finally {
        flag.v = false;
      }
    };
    const workFlag = { v: false };
    const pollFlag = { v: false };
    timers = [setInterval(run(tick, workFlag), config.worker.intervalMs), setInterval(run(pollEmailStatuses, pollFlag), config.worker.statusPollMs)];
    timers.forEach((t) => t.unref?.());
  }
  const stop = () => timers.forEach(clearInterval);

  return {
    route,
    queueEvent,
    supersede,
    processIds,
    tick,
    ensureQueued,
    releaseStale,
    requeue,
    applyEmailEvent,
    applyWhatsAppStatus,
    applyWhatsAppMessage,
    pollEmailStatuses,
    start,
    stop,
  };
}
