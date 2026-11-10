// Tests for the orders API, customers, JWT/roles and order safety, against a real PostgreSQL
// database (primeh2o_test_api) with fake providers. Nothing is sent to Brevo or Meta.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { createAdminAuth, hashPassword } from '../adminAuth.js';
import { createApp } from '../app.js';
import { loadConfig, loadEnvFile } from '../config.js';
import { migrate } from '../db.js';
import { createEnquiryStore, makePublicId } from '../enquiries.js';
import { createNotifier } from '../notifications.js';
import { validateEnquiry } from '../validation.js';

loadEnvFile();
const baseUrl = process.env.DATABASE_URL;
const skip = !baseUrl && 'DATABASE_URL not set';
const silent = { info() {}, warn() {}, error() {} };
const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const OWNER = { email: 'owner@example.com', password: 'owner password 1234', name: 'Owner' };
const VIEWER = { email: 'viewer@example.com', password: 'viewer password 1234', name: 'Viewer' };

let pool, config, emailCalls, waCalls, main;

const fakeEmail = (behaviour = () => null) => ({
  name: 'brevo',
  configured: true,
  missing: [],
  async sendEmail(msg) {
    emailCalls.push(msg);
    const b = behaviour(msg);
    if (b instanceof Promise) return b;
    if (b) throw b;
    return { messageId: `<msg-${crypto.randomUUID()}@test>`, response: { sandbox: false } };
  },
  async events() {
    return { events: [] };
  },
});
const fakeWhatsApp = (behaviour = () => null) => ({
  name: 'meta_whatsapp',
  configured: true,
  missing: [],
  async sendTemplate(msg) {
    waCalls.push(msg);
    const b = behaviour(msg);
    if (b instanceof Promise) return b;
    if (b) throw b;
    return { messageId: `wamid.${crypto.randomUUID()}`, response: {} };
  },
});

/** Starts an app on a random port. Overrides let a test swap providers, the notifier or the store. */
async function startApp({ email = fakeEmail(), whatsapp = fakeWhatsApp(), wrapNotifier = (n) => n, storeOptions = {}, configOverrides = {} } = {}) {
  const cfg = { ...config, ...configOverrides };
  const realNotifier = createNotifier({ pool, config: cfg, email, whatsapp, log: silent });
  const notifier = wrapNotifier(realNotifier);
  const store = createEnquiryStore({ pool, notifier, log: silent, ...storeOptions });
  const auth = createAdminAuth({ pool, config: cfg, log: silent });
  const app = createApp({ config: cfg, store, notifier, log: silent, pool, auth });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(url + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
  };
  return { url, call, server, store, notifier: realNotifier, close: () => new Promise((r) => server.close(r)) };
}

const login = async (app, who) => {
  const r = await app.call('POST', '/api/admin/login', { email: who.email, password: who.password }, { 'x-prime-admin': '1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
};
const bearer = (token) => ({ authorization: `Bearer ${token}` });

const orderBody = (extra = {}) => ({
  clientRequestId: crypto.randomUUID(),
  name: 'Anita Rao',
  phone: '+91 90000 11111',
  email: 'anita@example.com',
  company: 'Rao Events',
  bottleSize: '500 mL',
  quantity: 300,
  deliveryDate: '2099-03-01',
  message: `Deliver to Gachibowli ${crypto.randomUUID()}`,
  whatsappOptIn: true,
  customization: { template: 'Corporate Branding', colour: 'Burgundy (#500D18)', labelName: 'Rao Events', tagline: 'Since 1999' },
  ...extra,
});
const count = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;
const notifications = async (publicId, event = null) =>
  (
    await pool.query(
      `SELECT n.* FROM notifications n JOIN enquiries e ON e.id = n.enquiry_id
        WHERE e.public_id = $1 AND ($2::text IS NULL OR n.event = $2) ORDER BY n.id`,
      [publicId, event],
    )
  ).rows;

before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: baseUrl });
  await admin.query('CREATE DATABASE primeh2o_test_api').catch((e) => {
    if (e.code !== '42P04') throw e;
  });
  await admin.end();
  const u = new URL(baseUrl);
  u.pathname = '/primeh2o_test_api';
  pool = new pg.Pool({ connectionString: u.toString() });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  for (const [who, role] of [
    [OWNER, 'admin'],
    [VIEWER, 'viewer'],
  ]) {
    await pool.query('INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)', [who.email, who.name, await hashPassword(who.password), role]);
  }
  config = loadConfig({
    DATABASE_URL: u.toString(),
    APP_ENV: 'test',
    BREVO_API_KEY: 'test',
    BREVO_SENDER_EMAIL: 'sender@example.com',
    BUSINESS_EMAIL: 'team@example.com',
    FRONTEND_URL: 'https://shop.example',
    JWT_SECRET_KEY: JWT_SECRET,
    ENQUIRY_RATE_LIMIT: '1000',
    WHATSAPP_ACCESS_TOKEN: 'x',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_OWNER_NUMBER: '+91 81434 89222',
    META_APP_SECRET: 'app-secret',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-me',
  });
  main = await startApp();
});

after(async () => {
  await main?.close();
  await pool?.end();
});

beforeEach(() => {
  emailCalls = [];
  waCalls = [];
});

// ------------------------------------------------------------------ public API

test('GET /api/health reports database and provider status', { skip }, async () => {
  const r = await main.call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.database, 'ok');
  assert.equal(r.body.email, 'configured');
  assert.equal(r.body.whatsapp, 'configured');
  assert.equal(JSON.stringify(r.body).includes('test'), false, 'no secrets in the health response');
});

test('POST /api/orders saves a PENDING order with a unique order ID, its customer and its notifications', { skip }, async () => {
  const r = await main.call('POST', '/api/orders', orderBody({ source: 'contact' })); // source is forced to an order
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.orderId, /^PRM-\d{6}-[A-Z2-9]{6}$/);
  assert.equal(r.body.enquiryId, r.body.orderId);
  assert.equal(r.body.orderStatus, 'PENDING');
  const { rows: [o] } = await pool.query('SELECT * FROM enquiries WHERE public_id = $1', [r.body.orderId]);
  assert.equal(o.source, 'custom_bottle');
  assert.equal(o.order_status, 'PENDING');
  assert.equal(o.accepted_at, null);
  assert.equal(o.bottle_size, '500 mL');
  assert.equal(o.quantity, 300);
  assert.equal(o.delivery_date, '2099-03-01');
  assert.equal(o.customization.labelName, 'Rao Events');
  assert.equal(o.whatsapp_opt_in, true);
  assert.ok(o.created_at && o.updated_at);
  const { rows: [c] } = await pool.query('SELECT * FROM customers WHERE id = $1', [o.customer_id]);
  assert.deepEqual([c.full_name, c.company_name, c.phone, c.email], ['Anita Rao', 'Rao Events', '+919000011111', 'anita@example.com']);
  const n = await notifications(r.body.orderId);
  assert.deepEqual(n.map((x) => `${x.audience}:${x.channel}:${x.status}`).sort(), [
    'customer:email:accepted',
    'customer:whatsapp:accepted',
    'owner:email:accepted',
    'owner:whatsapp:accepted',
  ]);
  assert.ok(n.every((x) => x.event === 'order_received'));
});

test('customers: one record per email + phone, reused by later orders; orders keep their own snapshot', { skip }, async () => {
  const first = await main.call('POST', '/api/orders', orderBody({ name: 'Kiran Kumar', email: 'Kiran@Example.com', phone: '98480 12345', company: '' }));
  const second = await main.call('POST', '/api/orders', orderBody({ name: 'Kiran K.', email: 'kiran@example.com', phone: '+91 98480 12345', company: 'KK Caterers' }));
  const otherPhone = await main.call('POST', '/api/orders', orderBody({ name: 'Kiran Kumar', email: 'kiran@example.com', phone: '98480 99999' }));
  const enquiry = await main.call('POST', '/api/enquiries', { source: 'contact', name: 'Kiran K.', phone: '9848012345', email: 'kiran@example.com', message: `Hello ${crypto.randomUUID()}` });
  const ids = await pool.query(
    'SELECT public_id, customer_id, customer_name FROM enquiries WHERE public_id = ANY($1) ORDER BY created_at',
    [[first.body.orderId, second.body.orderId, otherPhone.body.orderId, enquiry.body.enquiryId]],
  );
  const [a, b, cc, d] = ids.rows;
  assert.equal(a.customer_id, b.customer_id, 'same email (any case) + same phone = same customer');
  assert.equal(a.customer_id, d.customer_id, 'contact enquiries are linked to the same customer');
  assert.notEqual(a.customer_id, cc.customer_id, 'a different phone is a different customer record');
  assert.equal(a.customer_name, 'Kiran Kumar', 'the first order keeps the name it was submitted with');
  const { rows: [c] } = await pool.query('SELECT full_name, company_name FROM customers WHERE id = $1', [a.customer_id]);
  assert.deepEqual([c.full_name, c.company_name], ['Kiran K.', 'KK Caterers']);
  const token = await login(main, OWNER);
  const detail = await main.call('GET', `/api/admin/orders/${first.body.orderId}`, undefined, bearer(token));
  assert.equal(String(detail.body.customer.id), String(a.customer_id));
  assert.equal(detail.body.customer.order_count, 2);
});

test('order IDs are unique: a colliding ID is replaced, never reused', { skip }, async () => {
  const ids = new Set(Array.from({ length: 200 }, () => makePublicId(new Date('2026-11-07T20:00:00Z'))));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^PRM-261108-[A-HJ-NP-Z2-9]{6}$/, 'date is in IST; no 0/O/1/I');

  const taken = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  let calls = 0;
  const colliding = await startApp({ storeOptions: { idGenerator: () => (calls++ === 0 ? taken : makePublicId()) } });
  try {
    const r = await colliding.call('POST', '/api/orders', orderBody());
    assert.equal(r.status, 201);
    assert.notEqual(r.body.orderId, taken);
    assert.equal(calls, 2);
    assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE public_id = $1', [taken]), 1);
  } finally {
    await colliding.close();
  }
});

test('invalid order data is rejected field by field and nothing is saved', { skip }, async () => {
  const before = [await count('SELECT count(*)::int AS n FROM enquiries'), await count('SELECT count(*)::int AS n FROM customers')];
  const r = await main.call('POST', '/api/orders', orderBody({ name: '', phone: '12', email: 'x@', bottleSize: '2 L', quantity: 0, deliveryDate: '2020-01-01', customization: { labelName: '' } }));
  assert.equal(r.status, 422);
  for (const f of ['name', 'phone', 'email', 'bottleSize', 'quantity', 'deliveryDate', 'customization.labelName']) assert.ok(r.body.fields[f], f);
  assert.equal((await main.call('POST', '/api/orders', [1, 2])).status, 422);
  assert.equal((await fetch(`${main.url}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json' })).status, 400);
  assert.deepEqual([await count('SELECT count(*)::int AS n FROM enquiries'), await count('SELECT count(*)::int AS n FROM customers')], before);
});

test('CORS: only FRONTEND_URL / ALLOWED_ORIGINS may call the public API from another origin', { skip }, async () => {
  const ok = await fetch(`${main.url}/api/orders`, { method: 'OPTIONS', headers: { origin: 'https://shop.example' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://shop.example');
  const evil = await fetch(`${main.url}/api/orders`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const admin = await fetch(`${main.url}/api/admin/orders`, { method: 'OPTIONS', headers: { origin: 'https://shop.example' } });
  assert.equal(admin.headers.get('access-control-allow-origin'), null, 'the admin API is never opened to other origins');
});

// ------------------------------------------------------------------ admin authentication

test('admin login returns a JWT; Bearer tokens work without the CSRF header; forged, expired or revoked tokens do not', { skip }, async () => {
  const noCsrf = await main.call('POST', '/api/admin/login', { email: OWNER.email, password: OWNER.password });
  assert.equal(noCsrf.status, 403);
  const r = await main.call('POST', '/api/admin/login', { email: OWNER.email, password: OWNER.password }, { 'x-prime-admin': '1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.tokenType, 'Bearer');
  assert.deepEqual(r.body.admin, { name: 'Owner', email: OWNER.email, role: 'admin' });
  assert.ok(!JSON.stringify(r.body).includes('password'));
  const token = r.body.token;
  const claims = jwt.decode(token);
  assert.equal(claims.iss, 'prime-h2o');
  assert.ok(claims.exp - claims.iat === config.adminSessionHours * 3600);

  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(token))).body.admin.role, 'admin');
  assert.equal((await main.call('GET', '/api/admin/orders')).status, 401);

  const forged = jwt.sign({ sid: claims.sid, role: 'admin' }, 'x'.repeat(40), { issuer: 'prime-h2o', audience: 'prime-h2o-admin', subject: claims.sub });
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(forged))).status, 401);
  const expired = jwt.sign({ sid: claims.sid, role: 'admin' }, JWT_SECRET, { issuer: 'prime-h2o', audience: 'prime-h2o-admin', subject: claims.sub, expiresIn: -10 });
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(expired))).status, 401);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims })}.`;
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(none))).status, 401);
  const otherSession = jwt.sign({ sid: '999999', role: 'admin' }, JWT_SECRET, { issuer: 'prime-h2o', audience: 'prime-h2o-admin', subject: claims.sub, expiresIn: 60 });
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(otherSession))).status, 401);

  await main.call('POST', '/api/admin/logout', undefined, bearer(token));
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(token))).status, 401, 'logout revokes the JWT');

  const t2 = await login(main, OWNER);
  await pool.query('UPDATE admin_users SET active = false WHERE email = $1', [OWNER.email]);
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(t2))).status, 401, 'disabled accounts lose access at once');
  await pool.query('UPDATE admin_users SET active = true WHERE email = $1', [OWNER.email]);
});

test('roles: viewers can read orders but cannot accept, reject, change status or retry', { skip }, async () => {
  const id = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  const t = await login(main, VIEWER);
  assert.equal((await main.call('GET', '/api/admin/orders', undefined, bearer(t))).status, 200);
  assert.equal((await main.call('GET', `/api/admin/orders/${id}`, undefined, bearer(t))).status, 200);
  assert.equal((await main.call('POST', `/api/admin/orders/${id}/accept`, {}, bearer(t))).status, 403);
  assert.equal((await main.call('POST', `/api/admin/orders/${id}/reject`, { reason: 'no' }, bearer(t))).status, 403);
  assert.equal((await main.call('PATCH', `/api/admin/orders/${id}/status`, { status: 'CANCELLED', reason: 'no' }, bearer(t))).status, 403);
  assert.equal((await main.call('POST', `/api/admin/enquiries/${id}/status`, { to: 'ACCEPTED', expectedFrom: 'PENDING' }, bearer(t))).status, 403);
  const n = (await notifications(id))[0];
  assert.equal((await main.call('POST', `/api/admin/notifications/${n.id}/retry`, {}, bearer(t))).status, 403);
  assert.equal((await pool.query('SELECT order_status FROM enquiries WHERE public_id = $1', [id])).rows[0].order_status, 'PENDING');
});

test('ADMIN_EMAIL + ADMIN_PASSWORD_HASH create the owner account at startup; a new hash signs out old sessions', { skip }, async () => {
  const email = 'boot-owner@example.com';
  const make = async (password) => {
    const cfg = loadConfig({ ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD_HASH: await hashPassword(password), JWT_SECRET_KEY: JWT_SECRET });
    return createAdminAuth({ pool, config: { ...config, admin: cfg.admin }, log: silent });
  };
  await (await make('first bootstrap password')).bootstrapFromEnv();
  const t = await login(main, { email, password: 'first bootstrap password' });
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(t))).body.admin.role, 'admin');
  await (await make('second bootstrap password')).bootstrapFromEnv();
  assert.equal((await main.call('GET', '/api/admin/me', undefined, bearer(t))).status, 401);
  await login(main, { email, password: 'second bootstrap password' });
  const bad = createAdminAuth({ pool, config: { ...config, admin: { ...config.admin, bootstrapEmail: 'x@example.com', bootstrapPasswordHash: 'plaintext-password' } }, log: silent });
  assert.equal(await bad.bootstrapFromEnv(), null, 'a plain password is never accepted as a hash');
  assert.equal(await count(`SELECT count(*)::int AS n FROM admin_users WHERE email = 'x@example.com'`), 0);
});

// ------------------------------------------------------------------ order endpoints

test('GET /api/admin/orders lists orders only, filters by status; GET /api/admin/orders/:id 404s for enquiries', { skip }, async () => {
  const t = await login(main, OWNER);
  const id = (await main.call('POST', '/api/orders', orderBody({ name: 'Filter Test' }))).body.orderId;
  const contact = await main.call('POST', '/api/enquiries', { source: 'contact', name: 'Only Enquiry', phone: '9876543210', email: 'e@example.com', message: `Hi ${crypto.randomUUID()}` });
  const list = (await main.call('GET', '/api/admin/orders?status=pending', undefined, bearer(t))).body;
  assert.ok(list.items.some((i) => i.public_id === id));
  assert.ok(list.items.every((i) => i.source === 'custom_bottle' && i.order_status === 'PENDING'));
  assert.ok(list.counts.PENDING >= 1);
  assert.equal((await main.call('GET', '/api/admin/orders?status=SHIPPED', undefined, bearer(t))).status, 422);
  assert.equal((await main.call('GET', `/api/admin/orders/${contact.body.enquiryId}`, undefined, bearer(t))).status, 404);
  assert.equal((await main.call('GET', '/api/admin/orders/PRM-000000-NOPE00', undefined, bearer(t))).status, 404);
  const d = (await main.call('GET', `/api/admin/orders/${id}`, undefined, bearer(t))).body;
  assert.equal(d.order_status, 'PENDING');
  assert.deepEqual(d.allowedTransitions.map((x) => x.to), ['ACCEPTED', 'REJECTED', 'CANCELLED']);
});

test('POST /accept confirms once: ACCEPTED, timestamp, history, confirmation to both by both channels; repeats change nothing', { skip }, async () => {
  const t = await login(main, OWNER);
  const id = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  emailCalls = [];
  waCalls = [];
  const r = await main.call('POST', `/api/admin/orders/${id}/accept`, { note: 'Artwork proof by Friday.' }, bearer(t));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order_status, 'ACCEPTED');
  assert.ok(r.body.accepted_at);
  assert.equal(r.body.history.at(-1).actor_label, 'Owner');
  assert.equal(r.body.history.at(-1).note, 'Artwork proof by Friday.');
  const n = await notifications(id, 'order_accepted');
  assert.deepEqual(n.map((x) => `${x.audience}:${x.channel}:${x.status}`).sort(), ['customer:email:accepted', 'customer:whatsapp:accepted', 'owner:email:accepted', 'owner:whatsapp:accepted']);
  assert.match(emailCalls.find((m) => m.to.email === 'anita@example.com').subject, /is confirmed/);
  assert.ok(waCalls.some((w) => w.template === 'prime_order_accepted' && w.params[3] === 'Artwork proof by Friday.'));

  emailCalls = [];
  waCalls = [];
  const racing = await Promise.all([1, 2, 3].map(() => main.call('POST', `/api/admin/orders/${id}/accept`, {}, bearer(t))));
  assert.deepEqual(racing.map((x) => x.status), [409, 409, 409]);
  assert.match(racing[0].body.error, /already Accepted/);
  assert.equal(emailCalls.length + waCalls.length, 0);
  assert.equal((await notifications(id, 'order_accepted')).length, 4);

  const id2 = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  emailCalls = [];
  const both = await Promise.all([1, 2, 3].map(() => main.call('POST', `/api/admin/orders/${id2}/accept`, {}, bearer(t))));
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 409, 409]);
  assert.equal(emailCalls.length, 2);
});

test('POST /reject requires a reason, stores it with a timestamp and tells the customer by both channels', { skip }, async () => {
  const t = await login(main, OWNER);
  const id = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  assert.equal((await main.call('POST', `/api/admin/orders/${id}/reject`, {}, bearer(t))).status, 422);
  emailCalls = [];
  waCalls = [];
  const r = await main.call('POST', `/api/admin/orders/${id}/reject`, { reason: 'Label artwork cannot be printed at this size.' }, bearer(t));
  assert.equal(r.status, 200);
  assert.equal(r.body.order_status, 'REJECTED');
  assert.ok(r.body.rejected_at);
  assert.equal(r.body.rejection_reason, 'Label artwork cannot be printed at this size.');
  assert.ok(emailCalls.find((m) => m.to.email === 'anita@example.com').text.includes('Label artwork cannot be printed at this size.'));
  assert.equal(waCalls.find((w) => w.template === 'prime_order_rejected').params[2], 'Label artwork cannot be printed at this size.');
  assert.equal((await main.call('POST', `/api/admin/orders/${id}/accept`, {}, bearer(t))).status, 409, 'rejected is final');
});

test('PATCH /status runs the full lifecycle and refuses repeats, skips, unknown statuses and stale expectations', { skip }, async () => {
  const t = await login(main, OWNER);
  const id = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  const patch = (body) => main.call('PATCH', `/api/admin/orders/${id}/status`, body, bearer(t));
  assert.equal((await patch({ status: 'SHIPPED' })).status, 422);
  assert.equal((await patch({ status: 'PROCESSING' })).status, 409, 'cannot skip approval');
  assert.equal((await patch({ status: 'ACCEPTED', expectedFrom: 'PROCESSING' })).status, 409, 'stale expectation');
  for (const s of ['ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED']) {
    const r = await patch({ status: s.toLowerCase(), note: s === 'DISPATCHED' ? 'Vehicle TS09 AB 1234' : undefined });
    assert.equal(r.status, 200, `${s}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.order_status, s);
  }
  assert.equal((await patch({ status: 'DELIVERED' })).status, 409);
  assert.equal((await patch({ status: 'CANCELLED', reason: 'late' })).status, 409, 'delivered is final');
  const n = await notifications(id);
  assert.equal(n.length, 6 * 4, 'received + 5 changes, each to owner and customer by email and WhatsApp');
  assert.equal(new Set(n.map((x) => `${x.event}:${x.audience}:${x.channel}`)).size, 24, 'no duplicates');
  const { rows: [o] } = await pool.query('SELECT created_at, updated_at FROM enquiries WHERE public_id = $1', [id]);
  assert.ok(o.updated_at > o.created_at, 'updated_at moves with every change');

  const cancelId = (await main.call('POST', '/api/orders', orderBody())).body.orderId;
  const noReason = await main.call('PATCH', `/api/admin/orders/${cancelId}/status`, { status: 'CANCELLED' }, bearer(t));
  assert.equal(noReason.status, 422);
  const c = await main.call('PATCH', `/api/admin/orders/${cancelId}/status`, { status: 'CANCELLED', reason: 'Customer asked to cancel.' }, bearer(t));
  assert.equal(c.body.cancellation_reason, 'Customer asked to cancel.');
});

// ------------------------------------------------------------------ notification failures never lose an order

test('crashing providers: the order is saved and answered 201; failures are recorded, nothing is lost', { skip }, async () => {
  const crashing = await startApp({
    email: fakeEmail(() => new TypeError('Cannot read properties of undefined')),
    whatsapp: fakeWhatsApp(() => new Error('socket hang up')),
  });
  try {
    const r = await crashing.call('POST', '/api/orders', orderBody());
    assert.equal(r.status, 201);
    assert.equal(r.body.orderStatus, 'PENDING');
    assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE public_id = $1', [r.body.orderId]), 1);
    const n = await notifications(r.body.orderId);
    assert.equal(n.length, 4);
    assert.ok(n.every((x) => x.status === 'failed' && x.last_error), JSON.stringify(n.map((x) => x.status)));
  } finally {
    await crashing.close();
  }
});

test('a provider that hangs does not hold the customer up or lose the order', { skip }, async () => {
  const hanging = await startApp({
    email: fakeEmail(() => new Promise(() => {})),
    whatsapp: fakeWhatsApp(() => new Promise(() => {})),
    configOverrides: { immediateSendTimeoutMs: 300 },
  });
  try {
    const started = Date.now();
    const r = await hanging.call('POST', '/api/orders', orderBody());
    assert.equal(r.status, 201);
    assert.ok(Date.now() - started < 5000);
    assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE public_id = $1', [r.body.orderId]), 1);
  } finally {
    await hanging.close();
  }
});

test('if queuing notifications fails, the order and status change are still saved and the sweep queues them later', { skip }, async () => {
  const broken = await startApp({
    wrapNotifier: (n) => ({ ...n, queueEvent: async (client) => client.query('SELECT 1/0') }), // a real SQL error inside the transaction
  });
  try {
    const r = await broken.call('POST', '/api/orders', orderBody());
    assert.equal(r.status, 201);
    assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE public_id = $1', [r.body.orderId]), 1);
    assert.equal((await notifications(r.body.orderId)).length, 0);
    const t = await login(broken, OWNER);
    const acc = await broken.call('POST', `/api/admin/orders/${r.body.orderId}/accept`, {}, bearer(t));
    assert.equal(acc.status, 200);
    assert.equal(acc.body.order_status, 'ACCEPTED', 'the owner decision is kept');

    emailCalls = [];
    waCalls = [];
    await main.notifier.tick(); // background worker with a healthy database path
    const n = await notifications(r.body.orderId);
    assert.deepEqual(n.map((x) => `${x.event}:${x.audience}:${x.channel}:${x.status}`).sort(), [
      'order_accepted:customer:email:accepted',
      'order_accepted:customer:whatsapp:accepted',
      'order_accepted:owner:email:accepted',
      'order_accepted:owner:whatsapp:accepted',
      'order_received:customer:email:accepted',
      'order_received:customer:whatsapp:accepted',
      'order_received:owner:email:accepted',
      'order_received:owner:whatsapp:accepted',
    ]);
    await main.notifier.tick();
    assert.equal((await notifications(r.body.orderId)).length, 8, 'the sweep never duplicates');
    assert.equal(emailCalls.length, 4);
  } finally {
    await broken.close();
  }
});

test('the store saves an order even when validation-to-notification happens outside HTTP', { skip }, async () => {
  const store = createEnquiryStore({ pool, notifier: { queueEvent: async () => { throw new Error('boom'); } }, log: silent });
  const { enquiry, notificationIds } = await store.create(validateEnquiry({ ...orderBody(), source: 'custom_bottle' }));
  assert.equal(enquiry.order_status, 'PENDING');
  assert.deepEqual(notificationIds, []);
  assert.equal(await count('SELECT count(*)::int AS n FROM order_status_history WHERE enquiry_id = $1', [enquiry.id]), 1);
});
