// End-to-end tests for online product orders: the public API, the database records, WhatsApp and
// email notifications, prices and the admin dashboard API. Runs against a real PostgreSQL database
// (primeh2o_test_products) with fake providers: nothing is sent to Meta or Brevo.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import pg from 'pg';
import { createAdminAuth, hashPassword } from '../adminAuth.js';
import { createApp } from '../app.js';
import { loadConfig, loadEnvFile } from '../config.js';
import { migrate } from '../db.js';
import { createEnquiryStore } from '../enquiries.js';
import { createNotifier } from '../notifications.js';
import { ProviderError } from '../providers.js';

loadEnvFile();
const baseUrl = process.env.DATABASE_URL;
const skip = !baseUrl && 'DATABASE_URL not set';
const silent = { info() {}, warn() {}, error() {} };
const OWNER = { email: 'owner@example.com', password: 'owner password 1234', name: 'Owner' };
const VIEWER = { email: 'viewer@example.com', password: 'viewer password 1234', name: 'Viewer' };
const OWNER_WHATSAPP = '918143489222';

let pool, config, emailCalls, waCalls, main;

const fakeEmail = (behaviour = () => null) => ({
  name: 'brevo',
  configured: true,
  missing: [],
  async sendEmail(msg) {
    emailCalls.push(msg);
    const b = behaviour(msg);
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
    if (b) throw b;
    return { messageId: `wamid.${crypto.randomUUID()}`, response: {} };
  },
});

async function startApp({ email = fakeEmail(), whatsapp = fakeWhatsApp(), storePool = null, storeOptions = {}, configOverrides = {} } = {}) {
  const cfg = { ...config, ...configOverrides };
  const notifier = createNotifier({ pool, config: cfg, email, whatsapp, log: silent });
  const store = createEnquiryStore({ pool: storePool ?? pool, notifier, log: silent, ...storeOptions });
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
  return { call, close: () => new Promise((r) => server.close(r)) };
}

const login = async (app, who) => {
  const r = await app.call('POST', '/api/admin/login', { email: who.email, password: who.password }, { 'x-prime-admin': '1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
};
const bearer = (token) => ({ authorization: `Bearer ${token}` });

/** A valid online order; every call is unique so the duplicate guard never merges two tests. */
const orderBody = (extra = {}) => ({
  clientRequestId: crypto.randomUUID(),
  name: 'Lakshmi Devi',
  phone: '98765 43210',
  whatsapp: '',
  email: 'lakshmi@example.com',
  address: `Flat 12, Sai Residency, Road No. 3, Nagole (${crypto.randomUUID().slice(0, 8)})`,
  city: 'Hyderabad',
  state: 'Telangana',
  pinCode: '500068',
  items: [{ product: 'prime-500', quantity: 24 }],
  instructions: 'Please call before delivery.',
  whatsappOptIn: true,
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
const statuses = (rows) => rows.map((x) => `${x.audience}:${x.channel}:${x.status}`).sort();
const setPrice = async (token, code, unitPrice) => main.call('PUT', `/api/admin/products/${code}/price`, { unitPrice }, bearer(token));

before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: baseUrl });
  await admin.query('CREATE DATABASE primeh2o_test_products').catch((e) => {
    if (e.code !== '42P04') throw e;
  });
  await admin.end();
  const u = new URL(baseUrl);
  u.pathname = '/primeh2o_test_products';
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
    JWT_SECRET_KEY: crypto.randomBytes(32).toString('hex'),
    ENQUIRY_RATE_LIMIT: '1000',
    WHATSAPP_ACCESS_TOKEN: 'x',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    PRIME_H2O_BUSINESS_WHATSAPP: '+91 81434 89222',
    WHATSAPP_API_VERSION: 'v23.0',
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

// ------------------------------------------------------------------ catalogue & configuration

test('GET /api/products lists the three sizes; prices stay empty until the owner sets them', { skip }, async () => {
  const r = await main.call('GET', '/api/products');
  assert.equal(r.status, 200);
  assert.equal(r.body.available, true);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(
    r.body.products.map((p) => [p.code, p.name, p.size, p.unitPricePaise]),
    [
      ['prime-250', 'PRIME H₂O 250 mL', '250 mL', null],
      ['prime-500', 'PRIME H₂O 500 mL', '500 mL', null],
      ['prime-1000', 'PRIME H₂O 1000 mL', '1000 mL', null],
    ],
  );
  assert.equal(r.body.unit, 'bottle');
  // the requested variable names are honoured
  assert.equal(config.whatsapp.notifyTo, OWNER_WHATSAPP);
  assert.equal(config.whatsapp.graphVersion, 'v23.0');
});

// ------------------------------------------------------------------ 1–6: placing orders

test('1. single-size order: saved PENDING with its line, customer and address; the total waits for prices', { skip }, async () => {
  const r = await main.call('POST', '/api/product-orders', orderBody());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.orderId, /^PRM-\d{6}-[A-Z2-9]{6}$/);
  assert.equal(r.body.orderStatus, 'PENDING');
  assert.deepEqual(r.body.order.items, [{ code: 'prime-500', name: 'PRIME H₂O 500 mL', size: '500 mL', quantity: 24, unitPricePaise: null, lineTotalPaise: null }]);
  assert.equal(r.body.order.totalPaise, null);
  assert.deepEqual(r.body.order.customer, { name: 'Lakshmi Devi', phone: '+919876543210', whatsapp: '+919876543210', email: 'lakshmi@example.com' });
  assert.equal(r.body.order.delivery.city, 'Hyderabad');
  assert.equal(r.body.order.delivery.pinCode, '500068');

  const { rows: [o] } = await pool.query('SELECT * FROM enquiries WHERE public_id = $1', [r.body.orderId]);
  assert.equal(o.source, 'product_order');
  assert.equal(o.order_status, 'PENDING');
  assert.match(o.delivery_address, /^Flat 12, Sai Residency/);
  assert.deepEqual([o.delivery_city, o.delivery_state, o.delivery_pin_code, o.total_paise], ['Hyderabad', 'Telangana', '500068', null]);
  assert.equal(o.customer_message, 'Please call before delivery.');
  assert.equal(o.whatsapp_opt_in, true);
  assert.ok(o.whatsapp_opt_in_text.startsWith('Send me updates about this order on WhatsApp.'));
  const { rows: items } = await pool.query('SELECT * FROM order_items WHERE enquiry_id = $1', [o.id]);
  assert.deepEqual(
    items.map((i) => [i.position, i.product_code, i.bottle_size, i.quantity, i.unit_price_paise]),
    [[1, 'prime-500', '500 mL', 24, null]],
  );
  const { rows: [c] } = await pool.query('SELECT * FROM customers WHERE id = $1', [o.customer_id]);
  assert.deepEqual([c.full_name, c.phone, c.whatsapp, c.email, c.city, c.state, c.pin_code], ['Lakshmi Devi', '+919876543210', '+919876543210', 'lakshmi@example.com', 'Hyderabad', 'Telangana', '500068']);
  assert.equal(await count(`SELECT count(*)::int AS n FROM order_status_history WHERE enquiry_id = $1 AND to_status = 'PENDING'`, [o.id]), 1);
  assert.deepEqual(statuses(await notifications(r.body.orderId)), ['customer:email:accepted', 'customer:whatsapp:accepted', 'owner:email:accepted', 'owner:whatsapp:accepted']);
  assert.deepEqual(r.body.customerWhatsApp, { status: 'accepted', to: '+919876543210' });
  assert.equal(r.body.teamNotified, true);
});

test('2. multiple sizes with configured prices: the server prices each line; later price changes never touch placed orders', { skip }, async () => {
  const t = await login(main, OWNER);
  assert.equal((await setPrice(t, 'prime-500', '10')).status, 200);
  assert.equal((await setPrice(t, 'prime-1000', 20.5)).status, 200);
  try {
    // prices sent by the browser are ignored
    const r = await main.call(
      'POST',
      '/api/product-orders',
      orderBody({
        items: [
          { product: 'prime-1000', quantity: 12, unitPrice: 0.01 },
          { product: 'prime-500', quantity: 24 },
        ],
        total: 1,
      }),
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(
      r.body.order.items.map((i) => [i.size, i.quantity, i.unitPricePaise, i.lineTotalPaise]),
      [
        ['500 mL', 24, 1000, 24000],
        ['1000 mL', 12, 2050, 24600],
      ],
    );
    assert.equal(r.body.order.totalPaise, 48600);

    // one unpriced size: priced lines keep their prices, but there is no total
    const mixed = await main.call(
      'POST',
      '/api/product-orders',
      orderBody({
        items: [
          { product: 'prime-500', quantity: 24 },
          { product: 'prime-250', quantity: 48 },
        ],
      }),
    );
    assert.equal(mixed.status, 201);
    assert.deepEqual(
      mixed.body.order.items.map((i) => [i.size, i.unitPricePaise, i.lineTotalPaise]),
      [
        ['250 mL', null, null],
        ['500 mL', 1000, 24000],
      ],
    );
    assert.equal(mixed.body.order.totalPaise, null);

    // the owner changes a price: placed orders keep what they were ordered at
    assert.equal((await setPrice(t, 'prime-500', '12.75')).body.product.unitPricePaise, 1275);
    const detail = await main.call('GET', `/api/admin/enquiries/${r.body.orderId}`, undefined, bearer(t));
    assert.equal(detail.body.items.find((i) => i.bottle_size === '500 mL').unit_price_paise, 1000);
    assert.equal(detail.body.total_paise, 48600);
    assert.equal((await main.call('GET', '/api/products')).body.products.find((p) => p.code === 'prime-500').unitPricePaise, 1275);
  } finally {
    for (const code of ['prime-500', 'prime-1000']) await setPrice(t, code, null);
  }
});

test('3. an invalid phone number is refused and nothing is saved', { skip }, async () => {
  const before = await count('SELECT count(*)::int AS n FROM enquiries');
  for (const phone of ['12345', '040 2345 6789', '']) {
    const r = await main.call('POST', '/api/product-orders', orderBody({ phone }));
    assert.equal(r.status, 422, phone);
    assert.match(r.body.fields.phone, /mobile number/);
  }
  const wa = await main.call('POST', '/api/product-orders', orderBody({ whatsapp: '99' }));
  assert.equal(wa.status, 422);
  assert.ok(wa.body.fields.whatsapp);
  assert.equal(await count('SELECT count(*)::int AS n FROM enquiries'), before);
  assert.equal(emailCalls.length + waCalls.length, 0);
});

test('4. a missing delivery address (or city, state or PIN) is refused field by field', { skip }, async () => {
  const r = await main.call('POST', '/api/product-orders', orderBody({ address: '', city: '', state: '', pinCode: '' }));
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.body.fields).sort(), ['address', 'city', 'pinCode', 'state']);
  assert.match(r.body.fields.address, /delivery address/);
  const pin = await main.call('POST', '/api/product-orders', orderBody({ pinCode: '5000' }));
  assert.equal(pin.status, 422);
  assert.match(pin.body.fields.pinCode, /6-digit PIN/);
});

test('5. invalid quantities and products are refused', { skip }, async () => {
  for (const quantity of [0, -1, 2.5, 'lots', 100001]) {
    const r = await main.call('POST', '/api/product-orders', orderBody({ items: [{ product: 'prime-500', quantity }] }));
    assert.equal(r.status, 422, String(quantity));
    assert.match(r.body.fields['items.prime-500'], /whole number of bottles/);
  }
  const none = await main.call('POST', '/api/product-orders', orderBody({ items: [] }));
  assert.equal(none.status, 422);
  assert.ok(none.body.fields.items);
  const unknown = await main.call('POST', '/api/product-orders', orderBody({ items: [{ product: 'prime-5000', quantity: 1 }] }));
  assert.equal(unknown.status, 422);

  // a size the owner has switched off cannot be ordered
  await pool.query(`UPDATE products SET active = false WHERE code = 'prime-250'`);
  try {
    const off = await main.call('POST', '/api/product-orders', orderBody({ items: [{ product: 'prime-250', quantity: 10 }] }));
    assert.equal(off.status, 422);
    assert.ok(off.body.fields['items.prime-250']);
    assert.ok(!(await main.call('GET', '/api/products')).body.products.some((p) => p.code === 'prime-250'));
  } finally {
    await pool.query(`UPDATE products SET active = true WHERE code = 'prime-250'`);
  }
});

test('6. duplicate submissions (retries, double clicks, re-sends) create one order and notify once', { skip }, async () => {
  const body = orderBody();
  const [a, b] = await Promise.all([main.call('POST', '/api/product-orders', body), main.call('POST', '/api/product-orders', body)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.body.orderId, b.body.orderId);
  const retry = await main.call('POST', '/api/product-orders', body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.order.items[0].quantity, 24);
  const resent = await main.call('POST', '/api/product-orders', { ...body, clientRequestId: crypto.randomUUID() });
  assert.equal(resent.status, 200, 'same content within 15 minutes is the same order');
  assert.equal(resent.body.orderId, a.body.orderId);
  assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE public_id = $1', [a.body.orderId]), 1);
  assert.equal((await notifications(a.body.orderId)).length, 4);
  assert.equal(waCalls.length, 2, 'one WhatsApp message to the owner and one to the customer');

  // a request ID already used by another form is not turned into this order
  const used = await main.call('POST', '/api/orders', {
    clientRequestId: crypto.randomUUID(),
    name: 'Anita Rao',
    phone: '+91 90000 11111',
    email: 'anita@example.com',
    bottleSize: '500 mL',
    quantity: 300,
    customization: { labelName: 'Rao Events' },
  });
  assert.equal(used.status, 201);
  const { rows: [custom] } = await pool.query('SELECT client_request_id FROM enquiries WHERE public_id = $1', [used.body.orderId]);
  const clash = await main.call('POST', '/api/product-orders', orderBody({ clientRequestId: custom.client_request_id }));
  assert.equal(clash.status, 409);
  assert.equal(clash.body.order, undefined, 'nothing about the other record is returned');
});

// ------------------------------------------------------------------ 7–8: failures

test('7. database failure: the customer gets a clear error and nothing is half-saved', { skip }, async () => {
  // the database fails in the middle of the transaction (after the customer row was written)
  const midway = await startApp({
    storeOptions: {
      idGenerator: () => {
        throw new Error('connection terminated unexpectedly');
      },
    },
  });
  const unreachable = new pg.Pool({ connectionString: 'postgres://nobody:nothing@127.0.0.1:1/none', connectionTimeoutMillis: 2000 });
  const down = await startApp({ storePool: unreachable });
  try {
    const name = `Ghost Customer ${crypto.randomUUID().slice(0, 6)}`;
    const r = await midway.call('POST', '/api/product-orders', orderBody({ name }));
    assert.equal(r.status, 500);
    assert.match(r.body.error, /Something went wrong on our side.*WhatsApp at \+91 81434 89222/);
    assert.ok(!JSON.stringify(r.body).includes('connection terminated'), 'internal errors are not shown to customers');
    assert.equal(await count('SELECT count(*)::int AS n FROM customers WHERE full_name = $1', [name]), 0, 'the transaction was rolled back');
    assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE customer_name = $1', [name]), 0);

    const r2 = await down.call('POST', '/api/product-orders', orderBody());
    assert.equal(r2.status, 500);
    assert.match(r2.body.error, /Something went wrong on our side/);
    const catalogue = await down.call('GET', '/api/products');
    assert.equal(catalogue.status, 200, 'the product list degrades gracefully instead of erroring on every page view');
    assert.deepEqual([catalogue.body.available, catalogue.body.products], [false, []]);
    assert.equal((await down.call('GET', '/api/health')).status, 200, 'health uses the main pool here');
    assert.equal(emailCalls.length + waCalls.length, 0);
  } finally {
    await midway.close();
    await down.close();
    await unreachable.end();
  }
});

test('8. WhatsApp API failure: the order is saved, the failure is recorded and retried, and never shown as sent', { skip }, async () => {
  const failing = await startApp({
    whatsapp: fakeWhatsApp((msg) =>
      msg.to === OWNER_WHATSAPP
        ? new ProviderError('WhatsApp 400: Template name does not exist in the translation (code 132001)', { retryable: false, status: 400 })
        : new ProviderError('WhatsApp 503: Service temporarily unavailable', { retryable: true, status: 503 }),
    ),
  });
  try {
    const r = await failing.call('POST', '/api/product-orders', orderBody());
    assert.equal(r.status, 201, 'the order is saved even though WhatsApp failed');
    assert.equal(await count('SELECT count(*)::int AS n FROM enquiries WHERE public_id = $1', [r.body.orderId]), 1);
    assert.deepEqual(r.body.customerWhatsApp, { status: 'sending', to: '+919876543210' }, 'retrying, not claimed as sent');
    const n = await notifications(r.body.orderId);
    assert.deepEqual(statuses(n), ['customer:email:accepted', 'customer:whatsapp:retrying', 'owner:email:accepted', 'owner:whatsapp:failed']);
    const ownerWa = n.find((x) => x.audience === 'owner' && x.channel === 'whatsapp');
    assert.match(ownerWa.last_error, /132001/);
    assert.equal(ownerWa.delivered_at, null);
    assert.equal(r.body.teamNotified, true, 'the owner email still went out');

    // the admin retries once WhatsApp works again: sent exactly once, never twice
    const t = await login(main, OWNER);
    waCalls = [];
    const retry = await main.call('POST', `/api/admin/notifications/${ownerWa.id}/retry`, {}, bearer(t));
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(waCalls.length, 1);
    assert.equal(waCalls[0].template, 'prime_product_order_new');
    const again = await main.call('POST', `/api/admin/notifications/${ownerWa.id}/retry`, {}, bearer(t));
    assert.equal(again.status, 409);
  } finally {
    await failing.close();
  }
});

// ------------------------------------------------------------------ 9–10: notifications

test('9. customer notification: the order-received template with every product, the total and the address', { skip }, async () => {
  const t = await login(main, OWNER);
  await setPrice(t, 'prime-500', '10');
  try {
    waCalls = [];
    const r = await main.call('POST', '/api/product-orders', orderBody({ whatsapp: '+91 91234 56789' }));
    assert.equal(r.status, 201);
    const msg = waCalls.find((w) => w.to === '919123456789');
    assert.ok(msg, 'sent to the WhatsApp number given, not the mobile number');
    assert.equal(msg.template, 'prime_product_order_received');
    const [id, name, products, total, address] = msg.params;
    assert.equal(id, r.body.orderId);
    assert.equal(name, 'Lakshmi Devi');
    assert.equal(products, 'PRIME H₂O 500 mL × 24 bottles × ₹10.00 = ₹240.00');
    assert.equal(total, '₹240.00');
    assert.match(address, /^Flat 12, Sai Residency, Road No. 3, Nagole .*, Hyderabad, Telangana – 500068$/);
    const mail = emailCalls.find((m) => m.to.email === 'lakshmi@example.com');
    assert.match(mail.subject, new RegExp(`${r.body.orderId} has been received`));
    assert.ok(mail.text.includes('24 bottles × ₹10.00 = ₹240.00') && mail.text.includes('Total: ₹240.00'));
    assert.deepEqual(r.body.customerEmail, { status: 'accepted', to: 'lakshmi@example.com' });
  } finally {
    await setPrice(t, 'prime-500', null);
  }

  // without WhatsApp consent: nothing is sent to the customer on WhatsApp, and the reason is recorded
  waCalls = [];
  const noConsent = await main.call('POST', '/api/product-orders', orderBody({ whatsappOptIn: false, email: '' }));
  assert.equal(noConsent.status, 201);
  assert.equal(noConsent.body.customerWhatsApp, null);
  assert.equal(noConsent.body.customerEmail, null);
  assert.deepEqual(waCalls.map((w) => w.to), [OWNER_WHATSAPP]);
  const skipped = (await notifications(noConsent.body.orderId)).find((x) => x.audience === 'customer' && x.channel === 'whatsapp');
  assert.equal(skipped.status, 'skipped');
  assert.match(skipped.last_error, /did not opt in/);
  const { rows: [o] } = await pool.query('SELECT customer_whatsapp, whatsapp_opt_in FROM enquiries WHERE public_id = $1', [noConsent.body.orderId]);
  assert.deepEqual([o.customer_whatsapp, o.whatsapp_opt_in], ['+919876543210', false], 'the number is kept for the order, without consent');
});

test('10. business notification: the owner gets every detail by WhatsApp and email', { skip }, async () => {
  const r = await main.call(
    'POST',
    '/api/product-orders',
    orderBody({
      items: [
        { product: 'prime-250', quantity: 48 },
        { product: 'prime-1000', quantity: 12 },
      ],
      instructions: 'Gate 2, call 30 minutes before.',
    }),
  );
  assert.equal(r.status, 201);
  const wa = waCalls.find((w) => w.to === OWNER_WHATSAPP);
  assert.equal(wa.template, 'prime_product_order_new');
  const [id, placed, name, mobile, whatsapp, email, products, total, address, instructions] = wa.params;
  assert.equal(id, r.body.orderId);
  assert.match(placed, /\d{4}, .* IST$/);
  assert.deepEqual([name, mobile, whatsapp, email], ['Lakshmi Devi', '+91 98765 43210', '+91 98765 43210 (agreed to WhatsApp updates)', 'lakshmi@example.com']);
  assert.equal(products, 'PRIME H₂O 250 mL × 48 bottles (price to be confirmed); PRIME H₂O 1000 mL × 12 bottles (price to be confirmed)');
  assert.equal(total, 'To be confirmed by PRIME H₂O');
  assert.match(address, /Nagole .*, Hyderabad, Telangana – 500068$/);
  assert.equal(instructions, 'Gate 2, call 30 minutes before.');

  const mail = emailCalls.find((m) => m.to.email === 'team@example.com');
  assert.match(mail.subject, new RegExp(`New order ${r.body.orderId}: Lakshmi Devi \\(250 mL × 48, 1000 mL × 12\\)`));
  for (const s of ['Mobile: +91 98765 43210', 'PRIME H₂O 250 mL: 48 bottles (price to be confirmed)', 'Telangana – 500068', 'Gate 2, call 30 minutes before.', `https://shop.example/admin#${r.body.orderId}`]) {
    assert.ok(mail.text.includes(s), s);
  }
  assert.deepEqual(mail.replyTo, { email: 'lakshmi@example.com', name: 'Lakshmi Devi' }, 'replying reaches the customer');
});

// ------------------------------------------------------------------ 11–12: admin

test('11. admin views the order: complete details for signed-in admins only; search by ID, name, phone or WhatsApp', { skip }, async () => {
  const r = await main.call('POST', '/api/product-orders', orderBody({ name: 'Venkat Reddy', phone: '+91 99887 76655', whatsapp: '91234 50000' }));
  const id = r.body.orderId;
  assert.equal((await main.call('GET', `/api/admin/enquiries/${id}`)).status, 401, 'no access without signing in');
  assert.equal((await main.call('GET', `/api/admin/enquiries?q=${id}`)).status, 401);

  const t = await login(main, VIEWER); // read-only accounts can view
  const d = await main.call('GET', `/api/admin/orders/${id}`, undefined, bearer(t));
  assert.equal(d.status, 200);
  assert.equal(d.body.source, 'product_order');
  assert.deepEqual([d.body.customer_name, d.body.customer_phone, d.body.customer_whatsapp, d.body.delivery_city, d.body.delivery_pin_code], ['Venkat Reddy', '+919988776655', '+919123450000', 'Hyderabad', '500068']);
  assert.deepEqual(d.body.items.map((i) => [i.product_name, i.quantity]), [['PRIME H₂O 500 mL', 24]]);
  assert.equal(d.body.customer.whatsapp, '+919123450000');
  assert.equal(d.body.customer.order_count, 1);
  assert.equal(d.body.notifications.length, 4);
  assert.deepEqual(d.body.allowedTransitions.map((x) => x.to), ['ACCEPTED', 'REJECTED', 'CANCELLED']);
  assert.equal('content_hash' in d.body, false);

  for (const q of [id, 'venkat', '99887 76655', '9988776655', '+91 91234 50000']) {
    const s = await main.call('GET', `/api/admin/enquiries?type=all&q=${encodeURIComponent(q)}`, undefined, bearer(t));
    assert.ok(s.body.items.some((x) => x.public_id === id), `search "${q}"`);
  }
  const listed = (await main.call('GET', '/api/admin/enquiries?type=product_order', undefined, bearer(t))).body.items;
  assert.ok(listed.length > 0 && listed.every((x) => x.source === 'product_order'));
  const row = listed.find((x) => x.public_id === id);
  assert.deepEqual(row.items, [{ size: '500 mL', quantity: 24 }]);
  assert.equal(row.delivery_city, 'Hyderabad');
  assert.ok((await main.call('GET', '/api/admin/enquiries?type=order', undefined, bearer(t))).body.items.some((x) => x.public_id === id), 'online orders appear with all orders');

  // the public API never exposes customer records
  const pub = await main.call('GET', '/api/products');
  assert.ok(!JSON.stringify(pub.body).includes('Venkat'));
});

test('12. admin updates the status: confirmed → processing → dispatched → delivered, each notifying the customer', { skip }, async () => {
  const id = (await main.call('POST', '/api/product-orders', orderBody())).body.orderId;
  const viewer = await login(main, VIEWER);
  assert.equal((await main.call('POST', `/api/admin/orders/${id}/accept`, {}, bearer(viewer))).status, 403, 'viewers cannot change orders');

  const t = await login(main, OWNER);
  waCalls = [];
  emailCalls = [];
  const accepted = await main.call('POST', `/api/admin/orders/${id}/accept`, { note: 'Delivery on Saturday morning.' }, bearer(t));
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.order_status, 'ACCEPTED');
  assert.deepEqual(statuses(await notifications(id, 'order_accepted')), ['customer:email:accepted', 'customer:whatsapp:accepted', 'owner:email:accepted', 'owner:whatsapp:accepted']);
  const confirmation = waCalls.find((w) => w.template === 'prime_order_accepted');
  assert.deepEqual(confirmation.params, ['Lakshmi Devi', id, 'PRIME H₂O 500 mL × 24 bottles', 'Delivery on Saturday morning.']);
  const mail = emailCalls.find((m) => m.to.email === 'lakshmi@example.com');
  assert.match(mail.subject, /is confirmed/);
  assert.ok(mail.text.includes('PRIME H₂O 500 mL: 24 bottles') && mail.text.includes('Delivery Address:'));
  assert.ok(!/label artwork/i.test(mail.text));

  for (const [to, template] of [
    ['PROCESSING', 'prime_order_processing'],
    ['READY_FOR_DISPATCH', 'prime_order_ready'],
    ['DISPATCHED', 'prime_order_dispatched'],
    ['DELIVERED', 'prime_order_delivered'],
  ]) {
    waCalls = [];
    const r = await main.call('PATCH', `/api/admin/orders/${id}/status`, { status: to }, bearer(t));
    assert.equal(r.status, 200, `${to}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.order_status, to);
    assert.ok(waCalls.some((w) => w.template === template && w.to === '919876543210'), `${to} → ${template}`);
  }
  assert.equal((await main.call('PATCH', `/api/admin/orders/${id}/status`, { status: 'CANCELLED', reason: 'Customer changed their mind.' }, bearer(t))).status, 409, 'delivered is final');

  const id2 = (await main.call('POST', '/api/product-orders', orderBody())).body.orderId;
  const cancel = await main.call('PATCH', `/api/admin/orders/${id2}/status`, { status: 'CANCELLED', reason: 'Customer asked to cancel.' }, bearer(t));
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.cancellation_reason, 'Customer asked to cancel.');
});

// ------------------------------------------------------------------ Contact enquiries → company WhatsApp

test('enquiries report truthfully whether the company WhatsApp copy was handed to WhatsApp', { skip }, async () => {
  const enquiry = () => ({
    source: 'contact',
    clientRequestId: crypto.randomUUID(),
    name: 'Ravi Teja',
    phone: '98765 43210',
    email: 'ravi@example.com',
    bottleSize: '500 mL',
    message: `Need 50 cases for our office every month ${crypto.randomUUID().slice(0, 6)}`,
  });

  // Cloud API configured and working: the owner gets the enquiry template with every detail
  const ok = await main.call('POST', '/api/enquiries', enquiry());
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.teamWhatsApp, 'accepted');
  const wa = waCalls.find((w) => w.to === OWNER_WHATSAPP);
  assert.equal(wa.template, 'prime_new_enquiry');
  assert.deepEqual(wa.params.slice(0, 5), ['Ravi Teja', '+91 98765 43210', 'ravi@example.com', '500 mL', 'Not specified']);
  assert.equal(wa.params[6], ok.body.enquiryId);
  assert.equal(JSON.stringify(ok.body).includes(OWNER_WHATSAPP), false, 'the response does not echo the company number');

  // Cloud API not configured: saved, nothing sent, and the website is told so (it then offers click-to-chat)
  const off = await startApp({ whatsapp: { name: 'meta_whatsapp', configured: false, missing: ['WHATSAPP_ACCESS_TOKEN'], sendTemplate: () => assert.fail('must not send') } });
  // Cloud API configured but refusing (e.g. an expired access token)
  const refusing = await startApp({
    whatsapp: fakeWhatsApp(() => new ProviderError('WhatsApp 401: Error validating access token: Session has expired (code 190)', { retryable: false, status: 401 })),
  });
  try {
    const r1 = await off.call('POST', '/api/enquiries', enquiry());
    assert.equal(r1.status, 201);
    assert.equal(r1.body.teamWhatsApp, 'not_sent');
    const r2 = await refusing.call('POST', '/api/enquiries', enquiry());
    assert.equal(r2.status, 201);
    assert.equal(r2.body.teamWhatsApp, 'failed');
    assert.equal(r2.body.teamNotified, true, 'the owner email still went out');
  } finally {
    await off.close();
    await refusing.close();
  }
});

// ------------------------------------------------------------------ prices, rate limits, spam

test('prices: only admins can change them, invalid prices are refused, and clearing one removes it', { skip }, async () => {
  const viewer = await login(main, VIEWER);
  assert.equal((await main.call('GET', '/api/admin/products', undefined, bearer(viewer))).status, 200);
  assert.equal((await main.call('PUT', '/api/admin/products/prime-500/price', { unitPrice: '10' }, bearer(viewer))).status, 403);
  assert.equal((await main.call('PUT', '/api/admin/products/prime-500/price', { unitPrice: '10' })).status, 403, 'CSRF guard');
  assert.equal((await main.call('PUT', '/api/admin/products/prime-500/price', { unitPrice: '10' }, { 'x-prime-admin': '1' })).status, 401, 'not signed in');

  const t = await login(main, OWNER);
  for (const bad of ['0', '-5', '12.345', 'free', '100001', '1,000', true]) {
    const r = await setPrice(t, 'prime-500', bad);
    assert.equal(r.status, 422, String(bad));
  }
  assert.equal((await setPrice(t, 'prime-9999', '10')).status, 404);
  const set = await setPrice(t, 'prime-250', '6.5');
  assert.equal(set.body.product.unitPricePaise, 650);
  assert.equal(set.body.product.priceUpdatedBy, 'Owner <owner@example.com>');
  assert.ok(set.body.product.priceUpdatedAt);
  const cleared = await setPrice(t, 'prime-250', null);
  assert.equal(cleared.body.product.unitPricePaise, null);
  assert.equal((await main.call('GET', '/api/products')).body.products.find((p) => p.code === 'prime-250').unitPricePaise, null);
});

test('rate limiting and the spam trap protect the order endpoint', { skip }, async () => {
  const limited = await startApp({ configOverrides: { enquiryRateLimit: 2 } });
  try {
    assert.equal((await limited.call('POST', '/api/product-orders', orderBody())).status, 201);
    assert.equal((await limited.call('POST', '/api/product-orders', orderBody())).status, 201);
    const third = await limited.call('POST', '/api/product-orders', orderBody());
    assert.equal(third.status, 429);
    assert.match(third.body.error, /Too many/);
  } finally {
    await limited.close();
  }
  const bot = await main.call('POST', '/api/product-orders', orderBody({ website: 'https://spam.example' }));
  assert.equal(bot.status, 400);
});
