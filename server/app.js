import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { OrderError } from './enquiries.js';
import { ORDER_SOURCES, ORDER_STATUSES, isOrderSource } from './orderStatus.js';
import { ValidationError, validateEnquiry, validateProductOrder } from './validation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - recent[0])) / 1000)));
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
    next();
  };
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(r, ms).unref?.())]);

export function createApp({ config, store, notifier, log, pool, auth }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // CORS only for explicitly allowed origins (FRONTEND_URL / ALLOWED_ORIGINS; same-origin needs none)
  app.use(['/api/enquiries', '/api/orders', '/api/product-orders', '/api/products'], (req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ---- WhatsApp webhook needs the raw body to verify Meta's signature
  app.get('/api/webhooks/whatsapp', (req, res) => {
    if (!config.whatsapp.webhookVerifyToken) return res.sendStatus(503);
    if (req.query['hub.mode'] === 'subscribe' && safeEqual(req.query['hub.verify_token'], config.whatsapp.webhookVerifyToken)) {
      return res.type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    }
    res.sendStatus(403);
  });

  app.post('/api/webhooks/whatsapp', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!config.whatsapp.appSecret) return res.sendStatus(503);
    const expected = `sha256=${crypto.createHmac('sha256', config.whatsapp.appSecret).update(req.body).digest('hex')}`;
    if (!safeEqual(req.get('x-hub-signature-256'), expected)) return res.sendStatus(401);
    let body;
    try {
      body = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.sendStatus(400);
    }
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) await notifier.applyWhatsAppStatus(status);
        for (const message of change.value?.messages ?? []) await notifier.applyWhatsAppMessage(message); // STOP / START
      }
    }
    res.sendStatus(200);
  });

  app.use('/api', express.json({ limit: '24mb' })); // 8 MB logo + 6 MB preview, base64-encoded

  app.get('/api/health', async (req, res) => {
    let db = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch {
      db = 'unavailable';
    }
    res.status(db === 'ok' ? 200 : 503).json({
      status: db === 'ok' ? 'ok' : 'degraded',
      database: db,
      email: config.brevo.configured ? (config.brevo.sandbox ? 'configured (sandbox: emails are NOT delivered)' : 'configured') : 'not configured',
      whatsapp: config.whatsapp.configured ? 'configured' : 'not configured',
    });
  });

  // ---- public submissions: POST /api/orders (custom bottle orders), POST /api/enquiries (Contact form;
  // also still accepts { source: 'custom_bottle' } for backward compatibility). One shared rate limit.
  const submissionLimit = rateLimit({
    windowMs: 10 * 60_000,
    max: config.enquiryRateLimit,
    message: 'Too many enquiries from this connection. Please wait a few minutes, or contact us on WhatsApp.',
  });

  // First send attempt right away (bounded), so the customer sees their acknowledgement status.
  // The order is already committed at this point: a failing, slow or crashing provider can never
  // undo it. Failures are recorded on the notification and retried by the background worker.
  const sendNow = (ids) =>
    withTimeout(
      notifier.processIds(ids).catch((e) => log.error('immediate send failed; the worker will retry', { error: e.message })),
      config.immediateSendTimeoutMs,
    );

  const submit = (forceSource) => async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.website === 'string' && body.website.trim()) return res.status(400).json({ error: 'Submission rejected.' }); // honeypot
    const v = validateEnquiry(forceSource && body && typeof body === 'object' && !Array.isArray(body) ? { ...body, source: forceSource } : body);
    const { enquiry, duplicate, notificationIds } = await store.create(v, { ip: req.ip, userAgent: req.get('user-agent') });
    log.info(duplicate ? 'duplicate submission ignored' : enquiry.source === 'custom_bottle' ? 'order saved' : 'enquiry saved', {
      id: enquiry.public_id,
      source: enquiry.source,
    });
    if (!duplicate) await sendNow(notificationIds);
    const summary = await store.publicSummary(enquiry.id).catch((e) => {
      log.error('could not read notification status', { error: e.message });
      return { orderStatus: enquiry.order_status, customerEmail: null, customerWhatsApp: null, teamNotified: false };
    });
    res.status(duplicate ? 200 : 201).json({
      ...(enquiry.source === 'custom_bottle' ? { orderId: enquiry.public_id } : {}),
      enquiryId: enquiry.public_id,
      duplicate,
      ...summary,
    });
  };
  app.post('/api/enquiries', submissionLimit, submit(null));
  app.post('/api/orders', submissionLimit, submit('custom_bottle'));

  // ---- online product orders. Public catalogue (prices are null until the owner configures them)…
  app.get('/api/products', async (req, res) => {
    res.set('Cache-Control', 'no-store'); // the owner can change prices at any time
    res.json({ products: await store.products(), currency: 'INR', unit: 'bottle' });
  });

  // …and the order itself: saved first (with server-side prices), then the first notification
  // attempt, then the confirmation. The response only echoes the submitter's own order.
  app.post('/api/product-orders', submissionLimit, async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.website === 'string' && body.website.trim()) return res.status(400).json({ error: 'Submission rejected.' }); // honeypot
    const v = validateProductOrder(body);
    const { enquiry, duplicate, notificationIds } = await store.create(v, { ip: req.ip, userAgent: req.get('user-agent') });
    if (duplicate && enquiry.source !== 'product_order') {
      return res.status(409).json({ error: 'This request was already used for a different form. Please reload the page and place your order again.' });
    }
    log.info(duplicate ? 'duplicate submission ignored' : 'online order saved', { id: enquiry.public_id, source: enquiry.source });
    if (!duplicate) await sendNow(notificationIds);
    const summary = await store.publicSummary(enquiry.id).catch((e) => {
      log.error('could not read notification status', { error: e.message });
      return { orderStatus: enquiry.order_status, customerEmail: null, customerWhatsApp: null, teamNotified: false };
    });
    res.status(duplicate ? 200 : 201).json({
      orderId: enquiry.public_id,
      enquiryId: enquiry.public_id,
      duplicate,
      ...summary,
      order: await store.orderConfirmation(enquiry.id),
    });
  });

  // ---- Brevo delivery webhook: https://<your-domain>/api/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>
  app.post('/api/webhooks/brevo', async (req, res) => {
    if (!config.brevo.webhookToken) return res.sendStatus(503);
    if (!safeEqual(req.query.token, config.brevo.webhookToken)) return res.sendStatus(401);
    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const ev of events) {
      const messageId = ev?.['message-id'] ?? ev?.messageId;
      if (!messageId || !ev.event) continue;
      const ts = ev.ts_event ?? ev.ts;
      await notifier.applyEmailEvent({
        messageId,
        event: ev.event,
        occurredAt: ts ? new Date(Number(ts) * 1000).toISOString() : ev.date ? new Date(ev.date).toISOString() : null,
        detail: ev.reason ?? null,
        payload: { event: ev.event, date: ev.date ?? null, reason: ev.reason ?? null, tag: ev.tag ?? null },
      });
    }
    res.sendStatus(200);
  });

  // ---- admin dashboard API (session cookie; see adminAuth.js)
  app.use('/api/admin', (req, res, next) => {
    res.set('X-Frame-Options', 'DENY');
    next();
  });
  app.post(
    '/api/admin/login',
    rateLimit({ windowMs: 15 * 60_000, max: 30, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }),
    auth.loginRoute,
  );
  app.post('/api/admin/logout', auth.logoutRoute);
  app.use('/api/admin', auth.requireAdmin);
  const canChange = auth.requireRole('admin'); // viewers are read-only

  app.get('/api/admin/me', (req, res) => res.json({ admin: auth.publicAdmin(req.admin) }));

  // what is configured, so the dashboard can say plainly what cannot be sent yet
  app.get('/api/admin/system', (req, res) =>
    res.json({
      email: {
        configured: config.brevo.configured,
        missing: config.brevo.missing,
        sandbox: config.brevo.sandbox,
        sender: config.brevo.senderEmail || null,
        ownerAddress: config.business.email,
      },
      whatsapp: {
        configured: config.whatsapp.configured,
        missing: config.whatsapp.missing,
        ownerNumber: `+${config.whatsapp.notifyTo}`,
        statusTracking: !!(config.whatsapp.appSecret && config.whatsapp.webhookVerifyToken),
      },
    }),
  );

  app.get('/api/admin/enquiries', async (req, res) => {
    const type = ['order', 'enquiry', 'all', ...ORDER_SOURCES].includes(req.query.type) ? req.query.type : 'order';
    const [items, counts] = await Promise.all([
      store.list({ type, status: req.query.status || null, q: req.query.q, limit: req.query.limit, before: req.query.before || null }),
      store.counts(),
    ]);
    res.json({ items, counts });
  });
  app.get('/api/admin/enquiries/:publicId', async (req, res) => {
    const e = await store.detail(req.params.publicId);
    return e ? res.json(e) : res.status(404).json({ error: 'Not found' });
  });
  app.get('/api/admin/enquiries/:publicId/files/:kind', async (req, res) => {
    const f = await store.file(req.params.publicId, req.params.kind);
    if (!f) return res.status(404).json({ error: 'Not found' });
    res.set('Content-Type', f.content_type);
    res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${f.filename}"`);
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); // uploaded SVGs can't run scripts
    res.set('Cross-Origin-Resource-Policy', 'same-origin');
    res.send(f.data);
  });

  // ---- owner decisions. All of them lock the order, refuse repeats and invalid jumps, record the
  // history, and queue owner + customer notifications on both channels for the new status.
  async function changeStatus(req, res, { to, note, expectedFrom }) {
    const { order, notificationIds } = await store.transition({
      publicId: req.params.orderId,
      to,
      expectedFrom: expectedFrom ?? null,
      note,
      admin: req.admin,
    });
    log.info('order status changed', { order: order.public_id, status: order.order_status, by: req.admin.email });
    await sendNow(notificationIds);
    res.json(await store.detail(order.public_id));
  }

  // used by the dashboard. Body: { to, expectedFrom, note }
  app.post('/api/admin/enquiries/:orderId/status', canChange, (req, res) =>
    changeStatus(req, res, { to: req.body?.to, expectedFrom: req.body?.expectedFrom, note: req.body?.note }),
  );

  // ---- orders API
  app.get('/api/admin/orders', async (req, res) => {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(422).json({ error: `Unknown status. Use one of: ${ORDER_STATUSES.join(', ')}.` });
    }
    const [items, counts] = await Promise.all([
      store.list({ type: 'order', status, q: req.query.q, limit: req.query.limit, before: req.query.before || null }),
      store.counts(),
    ]);
    res.json({ items, counts });
  });
  app.get('/api/admin/orders/:orderId', async (req, res) => {
    const d = await store.detail(req.params.orderId);
    return d && isOrderSource(d.source) ? res.json(d) : res.status(404).json({ error: 'Order not found.' });
  });

  // ---- product prices (per bottle, in rupees). Viewers can see them; only admins can change them.
  app.get('/api/admin/products', async (req, res) => res.json({ products: await store.adminProducts() }));
  app.put('/api/admin/products/:code/price', canChange, async (req, res) => {
    const unitPrice = req.body?.unitPrice ?? null;
    if (unitPrice !== null && typeof unitPrice !== 'string' && typeof unitPrice !== 'number') {
      return res.status(422).json({ error: 'Invalid price.', fields: { unitPrice: 'Invalid price' } });
    }
    const product = await store.setProductPrice({ code: req.params.code, unitPrice, admin: req.admin });
    res.json({ product });
  });
  // Body: { note? } (shown to the customer as next steps)
  app.post('/api/admin/orders/:orderId/accept', canChange, (req, res) =>
    changeStatus(req, res, { to: 'ACCEPTED', note: req.body?.note, expectedFrom: req.body?.expectedFrom }),
  );
  // Body: { reason } (required; sent to the customer)
  app.post('/api/admin/orders/:orderId/reject', canChange, (req, res) =>
    changeStatus(req, res, { to: 'REJECTED', note: req.body?.reason ?? req.body?.note, expectedFrom: req.body?.expectedFrom }),
  );
  // Body: { status, note? | reason?, expectedFrom? }
  app.patch('/api/admin/orders/:orderId/status', canChange, (req, res) =>
    changeStatus(req, res, {
      to: String(req.body?.status ?? '').toUpperCase(),
      note: req.body?.reason ?? req.body?.note,
      expectedFrom: req.body?.expectedFrom,
    }),
  );

  app.post('/api/admin/notifications/:id/retry', canChange, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const r = await notifier.requeue(req.params.id, req.admin.name);
    if (r.error) return res.status(r.status).json({ error: r.error });
    log.info('notification retried by admin', { notification: r.id, by: req.admin.email });
    res.json({ requeued: r.id });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---- the built website (npm run build) when this server also hosts the frontend
  if (fs.existsSync(path.join(DIST, 'index.html'))) {
    const adminPage = (req, res) => {
      res.set('X-Frame-Options', 'DENY');
      res.set('Content-Security-Policy', "frame-ancestors 'none'");
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      res.sendFile(path.join(DIST, 'admin.html'));
    };
    app.get(['/admin', '/admin/', '/admin.html'], adminPage);
    app.use(express.static(DIST, { index: 'index.html', maxAge: '1h' }));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(DIST, 'index.html')) : next()));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(422).json({ error: err.message, fields: err.fields });
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message, fields: err.fields });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'The upload is too large. Please use a logo under 8 MB.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
    log.error('request failed', { path: req.path, error: err?.message });
    res.status(500).json({ error: 'Something went wrong on our side. Please try again, or contact us on WhatsApp at +91 81434 89222.' });
  });

  return app;
}
