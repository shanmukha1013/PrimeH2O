// End-to-end tests against a real PostgreSQL database (primeh2o_test) with fake providers.
// Requires DATABASE_URL (server/.env). Nothing is sent to Brevo or Meta here.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import pg from 'pg';
import { createAdminAuth, hashPassword } from '../adminAuth.js';
import { createApp } from '../app.js';
import { loadConfig, loadEnvFile } from '../config.js';
import { migrate } from '../db.js';
import { createEnquiryStore } from '../enquiries.js';
import { createNotifier } from '../notifications.js';
import { ProviderError } from '../providers.js';
import { validateEnquiry } from '../validation.js';

loadEnvFile();
const baseUrl = process.env.DATABASE_URL;
const skip = !baseUrl && 'DATABASE_URL not set';

const silent = { info() {}, warn() {}, error() {} };
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ADMIN = { email: 'owner@example.com', password: 'correct horse battery staple', name: 'Owner' };

let pool, server, url, config, notifier, emailCalls, waCalls, emailBehaviour, waBehaviour, cookie;

const fakeEmail = {
  name: 'brevo',
  configured: true,
  missing: [],
  async sendEmail(msg) {
    emailCalls.push(msg);
    const b = emailBehaviour.shift();
    if (b) throw b;
    return { messageId: `<msg-${crypto.randomUUID()}@test>`, response: { sandbox: false } };
  },
  async events() {
    return { events: [] };
  },
};
const fakeWhatsApp = {
  name: 'meta_whatsapp',
  configured: true,
  missing: [],
  async sendTemplate(msg) {
    waCalls.push(msg);
    const b = waBehaviour.shift();
    if (b) throw b;
    return { messageId: `wamid.${crypto.randomUUID()}`, response: {} };
  },
};

async function request(method, path, body, { auth = true, csrf = true, headers = {} } = {}) {
  const r = await fetch(url + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(auth && cookie ? { cookie } : {}),
      ...(csrf ? { 'x-prime-admin': '1' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}
const post = (path, body, opts) => request('POST', path, body, opts);
const get = (path, opts) => request('GET', path, undefined, opts);
const setStatus = (id, to, expectedFrom, note) => post(`/api/admin/enquiries/${id}/status`, { to, expectedFrom, note });

const contact = () => ({
  source: 'contact',
  clientRequestId: crypto.randomUUID(),
  name: 'Ravi Teja',
  phone: '98765 43210',
  email: 'ravi@example.com',
  bottleSize: 'All Sizes',
  message: `Need water for our office ${crypto.randomUUID()}`,
});

const order = (extra = {}) => ({
  source: 'custom_bottle',
  clientRequestId: crypto.randomUUID(),
  name: 'Priya Sharma',
  phone: '+91 91234 56789',
  email: 'priya@example.com',
  company: 'Sharma Events',
  bottleSize: '1000 mL',
  quantity: 250,
  deliveryDate: '2099-01-15',
  message: `Deliver to Banjara Hills ${crypto.randomUUID()}`,
  whatsappOptIn: true,
  customization: {
    template: 'Wedding & Celebrations',
    colour: 'Ivory (#F8EFE5)',
    labelName: 'Priya & Arjun',
    tagline: 'Forever',
    layout: 'Logo above text',
    font: 'Editorial serif',
    textSize: '100%',
    position: 'centred',
    details: 'Gold foil if possible',
  },
  logo: { filename: 'logo.png', contentType: 'image/png', data: PNG_1PX },
  preview: { filename: 'preview.png', contentType: 'image/png', data: PNG_1PX },
  ...extra,
});

const notificationsFor = async (publicId, event = null) =>
  (
    await pool.query(
      `SELECT n.* FROM notifications n JOIN enquiries e ON e.id = n.enquiry_id
        WHERE e.public_id = $1 AND ($2::text IS NULL OR n.event = $2) ORDER BY n.event, n.audience DESC, n.channel`,
      [publicId, event],
    )
  ).rows;
const route = (rows) => rows.map((r) => `${r.audience}:${r.channel}:${r.status}`);
const enquiryRow = async (publicId) => (await pool.query('SELECT * FROM enquiries WHERE public_id = $1', [publicId])).rows[0];

before(async () => {
  if (skip) return;
  const admin = new pg.Pool({ connectionString: baseUrl });
  for (const db of ['primeh2o_test', 'primeh2o_migrate_test']) {
    await admin.query(`CREATE DATABASE ${db}`).catch((e) => {
      if (e.code !== '42P04') throw e;
    });
  }
  await admin.end();
  const testUrl = new URL(baseUrl);
  testUrl.pathname = '/primeh2o_test';
  pool = new pg.Pool({ connectionString: testUrl.toString() });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  await migrate(pool); // second run is a no-op
  await pool.query('INSERT INTO admin_users (email, name, password_hash) VALUES ($1, $2, $3)', [ADMIN.email, ADMIN.name, await hashPassword(ADMIN.password)]);

  config = loadConfig({
    DATABASE_URL: testUrl.toString(),
    BREVO_API_KEY: 'test',
    BREVO_SENDER_EMAIL: 'sender@example.com',
    BREVO_WEBHOOK_TOKEN: 'brevo-token',
    BUSINESS_EMAIL: 'team@example.com',
    PUBLIC_SITE_URL: 'https://prime.example',
    ENQUIRY_RATE_LIMIT: '1000',
    WHATSAPP_ACCESS_TOKEN: 'x',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_APP_SECRET: 'app-secret',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-me',
  });
  notifier = createNotifier({ pool, config, email: fakeEmail, whatsapp: fakeWhatsApp, log: silent });
  const store = createEnquiryStore({ pool, notifier });
  const auth = createAdminAuth({ pool, config });
  const app = createApp({ config, store, notifier, log: silent, pool, auth });
  await new Promise((r) => {
    server = app.listen(0, '127.0.0.1', r);
  });
  url = `http://127.0.0.1:${server.address().port}`;
  const login = await post('/api/admin/login', { email: ADMIN.email, password: ADMIN.password }, { auth: false });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  server?.close();
  await pool?.end();
});

beforeEach(() => {
  emailCalls = [];
  waCalls = [];
  emailBehaviour = [];
  waBehaviour = [];
});

// ------------------------------------------------------------------ website submissions

test('contact enquiry: owner email + owner WhatsApp + customer email, each sent once', { skip }, async () => {
  const res = await post('/api/enquiries', contact(), { auth: false, csrf: false });
  assert.equal(res.status, 201);
  assert.match(res.body.enquiryId, /^PRM-\d{6}-[A-Z2-9]{6}$/);
  assert.equal(res.body.orderStatus, null);
  assert.deepEqual(res.body.customerEmail, { status: 'accepted', to: 'ravi@example.com' });
  assert.equal(res.body.customerWhatsApp, null);
  assert.equal(res.body.teamNotified, true);

  const rows = await notificationsFor(res.body.enquiryId);
  assert.deepEqual(route(rows), ['owner:email:accepted', 'owner:whatsapp:accepted', 'customer:email:accepted']);
  assert.ok(rows.every((r) => r.event === 'enquiry_received' && r.attempts === 1 && r.provider_message_id));
  const toCustomer = emailCalls.find((m) => m.to.email === 'ravi@example.com');
  const toTeam = emailCalls.find((m) => m.to.email === 'team@example.com');
  assert.ok(toCustomer.text.startsWith('Dear Ravi Teja,'));
  assert.ok(toCustomer.text.includes(`Enquiry ID: ${res.body.enquiryId}`));
  assert.equal(toTeam.replyTo.email, 'ravi@example.com');
  assert.equal(waCalls.length, 1);
  assert.equal(waCalls[0].template, 'prime_new_enquiry');
  assert.equal(waCalls[0].to, '918143489222');
  assert.equal(waCalls[0].params[6], res.body.enquiryId);
});

test('duplicate submissions never create duplicate orders or notifications', { skip }, async () => {
  const body = order();
  const first = await post('/api/enquiries', body, { auth: false });
  const again = await post('/api/enquiries', body, { auth: false }); // same request id (retry / double click)
  const sameContent = await post('/api/enquiries', { ...body, clientRequestId: crypto.randomUUID() }, { auth: false });
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.enquiryId, first.body.enquiryId);
  assert.equal(sameContent.body.enquiryId, first.body.enquiryId);
  assert.equal(emailCalls.length, 2);
  assert.equal(waCalls.length, 2);

  emailCalls = [];
  const racer = contact();
  const results = await Promise.all([1, 2, 3].map(() => post('/api/enquiries', racer, { auth: false })));
  assert.equal(new Set(results.map((r) => r.body.enquiryId)).size, 1);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(emailCalls.length, 2);
});

test('validation: per-field errors, email required for orders, WhatsApp must be a mobile number', { skip }, async () => {
  const count = async () => (await pool.query('SELECT count(*)::int AS n FROM enquiries')).rows[0].n;
  const before = await count();
  const bad = await post('/api/enquiries', { ...contact(), phone: '123', email: 'nope' }, { auth: false });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fields.phone && bad.body.fields.email);
  assert.ok((await post('/api/enquiries', order({ email: '' }), { auth: false })).body.fields.email);
  assert.ok((await post('/api/enquiries', order({ phone: '040 2345 6789' }), { auth: false })).body.fields.whatsapp, 'landline cannot get WhatsApp');
  assert.ok((await post('/api/enquiries', order({ whatsapp: '12345' }), { auth: false })).body.fields.whatsapp);
  assert.equal((await post('/api/enquiries', { ...contact(), website: 'spam' }, { auth: false })).status, 400);
  assert.equal(await count(), before);
});

test('new order: PENDING, owner + customer notified on both channels, and the customer is NOT told it is confirmed', { skip }, async () => {
  const res = await post('/api/enquiries', order({ whatsapp: '98480 22338' }), { auth: false });
  assert.equal(res.status, 201);
  assert.equal(res.body.orderStatus, 'PENDING');
  assert.deepEqual(res.body.customerWhatsApp, { status: 'accepted', to: '+919848022338' });

  const e = await enquiryRow(res.body.enquiryId);
  assert.equal(e.order_status, 'PENDING');
  assert.equal(e.accepted_at, null);
  assert.equal(e.whatsapp_opt_in, true);
  assert.match(e.whatsapp_opt_in_text, /reply STOP/);
  const history = (await pool.query('SELECT * FROM order_status_history WHERE enquiry_id = $1', [e.id])).rows;
  assert.deepEqual(history.map((h) => [h.from_status, h.to_status, h.actor_label]), [[null, 'PENDING', 'Customer (website)']]);

  const rows = await notificationsFor(res.body.enquiryId);
  assert.deepEqual(route(rows), ['owner:email:accepted', 'owner:whatsapp:accepted', 'customer:email:accepted', 'customer:whatsapp:accepted']);
  assert.ok(rows.every((r) => r.event === 'order_received'), 'no confirmation is queued before the owner decides');

  const toCustomer = emailCalls.find((m) => m.to.email === 'priya@example.com');
  assert.match(toCustomer.subject, /awaiting confirmation/);
  assert.doesNotMatch(toCustomer.subject, /confirmed/i);
  assert.ok(toCustomer.text.includes('It is now awaiting confirmation from our team.'));
  assert.ok(toCustomer.text.includes('it is not an order confirmation'));
  assert.ok(toCustomer.text.includes('separate email and a WhatsApp message'));
  const toOwner = emailCalls.find((m) => m.to.email === 'team@example.com');
  assert.match(toOwner.subject, /awaiting your approval/);
  assert.equal(toOwner.attachments.length, 2);
  assert.ok(toOwner.text.includes('https://prime.example/admin'));
  assert.ok(toOwner.text.includes('WhatsApp updates: Yes (+91 98480 22338)'));

  assert.deepEqual(waCalls.map((w) => [w.template, w.to]).sort(), [
    ['prime_new_order', '918143489222'],
    ['prime_order_received', '919848022338'],
  ]);
  assert.ok(waCalls.every((w) => w.params.every((p) => p && !/\n/.test(p))));
});

// ------------------------------------------------------------------ admin authentication

test('only signed-in administrators can see or change orders', { skip }, async () => {
  const res = await post('/api/enquiries', order(), { auth: false });
  const id = res.body.enquiryId;
  assert.equal((await get('/api/admin/enquiries', { auth: false })).status, 401);
  assert.equal((await get(`/api/admin/enquiries/${id}/files/logo`, { auth: false })).status, 401);

  const anon = await post(`/api/admin/enquiries/${id}/status`, { to: 'ACCEPTED', expectedFrom: 'PENDING' }, { auth: false });
  assert.equal(anon.status, 401);
  const noCsrf = await post(`/api/admin/enquiries/${id}/status`, { to: 'ACCEPTED', expectedFrom: 'PENDING' }, { csrf: false });
  assert.equal(noCsrf.status, 403, 'state changes need the CSRF header');
  assert.equal((await enquiryRow(id)).order_status, 'PENDING');

  const wrong = await post('/api/admin/login', { email: ADMIN.email, password: 'wrong password!' }, { auth: false });
  assert.equal(wrong.status, 401);
  const unknown = await post('/api/admin/login', { email: 'nobody@example.com', password: 'whatever12345' }, { auth: false });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, wrong.body.error, 'same answer for unknown accounts');

  const ok = await post('/api/admin/login', { email: 'OWNER@example.com', password: ADMIN.password }, { auth: false });
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api\/admin/);
  const second = setCookie.split(';')[0];
  assert.equal((await get('/api/admin/me', { auth: false, headers: { cookie: second } })).body.admin.email, ADMIN.email);
  await post('/api/admin/logout', {}, { auth: false, headers: { cookie: second } });
  assert.equal((await get('/api/admin/me', { auth: false, headers: { cookie: second } })).status, 401, 'logout ends the session');

  const stored = (await pool.query('SELECT token_hash FROM admin_sessions')).rows.map((r) => r.token_hash);
  assert.ok(!stored.includes(cookie.split('=')[1]), 'raw session tokens are never stored');

  const file = await fetch(`${url}/api/admin/enquiries/${id}/files/logo`, { headers: { cookie } });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  assert.equal(Buffer.from(await file.arrayBuffer()).toString('base64'), PNG_1PX);
});

// ------------------------------------------------------------------ owner decisions

test('accepting: ACCEPTED + timestamp + history, confirmation to owner and customer on both channels, exactly once', { skip }, async () => {
  const id = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  emailCalls = [];
  waCalls = [];
  const res = await setStatus(id, 'ACCEPTED', 'PENDING', 'We will share the artwork proof tomorrow.');
  assert.equal(res.status, 200);
  assert.equal(res.body.order_status, 'ACCEPTED');
  assert.ok(res.body.accepted_at);
  assert.deepEqual(res.body.history.map((h) => [h.from_status, h.to_status, h.actor_label]), [
    [null, 'PENDING', 'Customer (website)'],
    ['PENDING', 'ACCEPTED', 'Owner'],
  ]);
  assert.deepEqual(res.body.allowedTransitions.map((t) => t.to), ['PROCESSING', 'CANCELLED']);
  assert.deepEqual(route(await notificationsFor(id, 'order_accepted')), [
    'owner:email:accepted',
    'owner:whatsapp:accepted',
    'customer:email:accepted',
    'customer:whatsapp:accepted',
  ]);
  const toCustomer = emailCalls.find((m) => m.to.email === 'priya@example.com');
  assert.match(toCustomer.subject, new RegExp(`Your PRIME H₂O order ${id} is confirmed`));
  assert.ok(toCustomer.text.includes(`Order ID: ${id}`));
  assert.ok(toCustomer.text.includes('NEXT STEPS'));
  assert.ok(toCustomer.text.includes('We will share the artwork proof tomorrow.'));
  assert.equal(toCustomer.replyTo.email, 'team@example.com');
  const toOwner = emailCalls.find((m) => m.to.email === 'team@example.com');
  assert.match(toOwner.subject, /is now Accepted/);
  const custWa = waCalls.find((w) => w.template === 'prime_order_accepted');
  assert.equal(custWa.params[3], 'We will share the artwork proof tomorrow.');
  assert.equal(waCalls.find((w) => w.template === 'prime_order_update_owner').params[2], 'Accepted');

  // the same click again (stale page / double click) changes nothing and sends nothing
  emailCalls = [];
  waCalls = [];
  const again = await setStatus(id, 'ACCEPTED', 'PENDING');
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already Accepted/);
  assert.equal(emailCalls.length + waCalls.length, 0);

  // two administrators approving at the same moment
  const id2 = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  emailCalls = [];
  waCalls = [];
  const racing = await Promise.all([1, 2, 3].map(() => setStatus(id2, 'ACCEPTED', 'PENDING')));
  assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal((await notificationsFor(id2, 'order_accepted')).length, 4);
  assert.equal(emailCalls.length, 2);
  assert.equal(waCalls.length, 2);
});

test('rejecting needs a reason, records timestamp + reason, notifies both, and is final', { skip }, async () => {
  const id = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  const noReason = await setStatus(id, 'REJECTED', 'PENDING', '  ');
  assert.equal(noReason.status, 422);
  assert.equal((await enquiryRow(id)).order_status, 'PENDING');

  emailCalls = [];
  waCalls = [];
  const res = await setStatus(id, 'REJECTED', 'PENDING', 'We cannot meet the requested delivery date.');
  assert.equal(res.status, 200);
  const e = await enquiryRow(id);
  assert.equal(e.order_status, 'REJECTED');
  assert.ok(e.rejected_at);
  assert.equal(e.rejection_reason, 'We cannot meet the requested delivery date.');
  assert.equal(e.accepted_at, null);
  assert.deepEqual(route(await notificationsFor(id, 'order_rejected')), [
    'owner:email:accepted',
    'owner:whatsapp:accepted',
    'customer:email:accepted',
    'customer:whatsapp:accepted',
  ]);
  const toCustomer = emailCalls.find((m) => m.to.email === 'priya@example.com');
  assert.match(toCustomer.subject, /Update on your PRIME H₂O order request/);
  assert.ok(toCustomer.text.includes('we are unable to accept it'));
  assert.ok(toCustomer.text.includes('We cannot meet the requested delivery date.'));
  assert.equal(waCalls.find((w) => w.template === 'prime_order_rejected').params[2], 'We cannot meet the requested delivery date.');
  assert.equal((await setStatus(id, 'ACCEPTED', 'REJECTED')).status, 409);
  assert.equal((await notificationsFor(id, 'order_accepted')).length, 0, 'a rejected order can never be confirmed');
});

test('full lifecycle: every status notifies owner and customer by email and WhatsApp; invalid jumps are refused', { skip }, async () => {
  const id = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  assert.equal((await setStatus(id, 'DISPATCHED', 'PENDING')).status, 409, 'cannot skip approval');
  const steps = [
    ['ACCEPTED', 'PENDING'],
    ['PROCESSING', 'ACCEPTED'],
    ['READY_FOR_DISPATCH', 'PROCESSING'],
    ['DISPATCHED', 'READY_FOR_DISPATCH', 'Vehicle TS09 AB 1234'],
    ['DELIVERED', 'DISPATCHED'],
  ];
  for (const [to, from, note] of steps) assert.equal((await setStatus(id, to, from, note)).status, 200, to);
  assert.equal((await setStatus(id, 'CANCELLED', 'DELIVERED', 'too late')).status, 409);

  const rows = await notificationsFor(id);
  assert.equal(rows.length, 6 * 4);
  assert.ok(rows.every((r) => r.status === 'accepted'), JSON.stringify(rows.filter((r) => r.status !== 'accepted').map((r) => [r.event, r.last_error])));
  const templates = new Set(rows.filter((r) => r.channel === 'whatsapp').map((r) => r.template_name));
  for (const t of ['prime_new_order', 'prime_order_update_owner', 'prime_order_received', 'prime_order_accepted', 'prime_order_processing', 'prime_order_ready', 'prime_order_dispatched', 'prime_order_delivered']) {
    assert.ok(templates.has(t), t);
  }
  const detail = (await get(`/api/admin/enquiries/${id}`)).body;
  assert.deepEqual(detail.history.map((h) => h.to_status), ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED']);
  assert.equal(detail.allowedTransitions.length, 0);
  assert.ok(emailCalls.some((m) => m.subject.includes('has been dispatched') && m.text.includes('Vehicle TS09 AB 1234')));
});

test('cancelling records the reason and drops messages still queued about earlier steps', { skip }, async () => {
  const id = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  emailBehaviour = [new ProviderError('Brevo 503', { retryable: true, status: 503 }), new ProviderError('Brevo 503', { retryable: true, status: 503 })];
  await setStatus(id, 'ACCEPTED', 'PENDING');
  const retrying = (await notificationsFor(id, 'order_accepted')).filter((r) => r.status === 'retrying');
  assert.equal(retrying.length, 2);
  const res = await setStatus(id, 'CANCELLED', 'ACCEPTED', 'Customer called to cancel.');
  assert.equal(res.status, 200);
  const e = await enquiryRow(id);
  assert.equal(e.cancellation_reason, 'Customer called to cancel.');
  assert.ok(e.cancelled_at);
  const superseded = (await notificationsFor(id, 'order_accepted')).filter((r) => r.channel === 'email');
  assert.ok(superseded.every((r) => r.status === 'skipped' && /Superseded/.test(r.last_error)));
  assert.ok((await notificationsFor(id, 'order_cancelled')).every((r) => r.status === 'accepted'));
});

// ------------------------------------------------------------------ channel independence & opt-in

test('one channel failing never stops the other', { skip }, async () => {
  emailBehaviour = Array.from({ length: 4 }, () => new ProviderError('Brevo 400: invalid sender', { retryable: false, status: 400 }));
  const id = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  const rows = await notificationsFor(id);
  assert.deepEqual(route(rows), ['owner:email:failed', 'owner:whatsapp:accepted', 'customer:email:failed', 'customer:whatsapp:accepted']);
});

test('customers who did not opt in get no WhatsApp; the owner still does', { skip }, async () => {
  const res = await post('/api/enquiries', order({ whatsappOptIn: false }), { auth: false });
  assert.equal(res.body.customerWhatsApp, null);
  const rows = await notificationsFor(res.body.enquiryId);
  const cust = rows.find((r) => r.audience === 'customer' && r.channel === 'whatsapp');
  assert.equal(cust.status, 'skipped');
  assert.equal(cust.last_error, 'Customer did not opt in to WhatsApp updates');
  assert.deepEqual(waCalls.map((w) => w.template), ['prime_new_order']);
  // retrying cannot force a message to someone who never opted in
  const retry = await post(`/api/admin/notifications/${cust.id}/retry`, {});
  assert.equal(retry.status, 409);
});

test('a customer who replies STOP gets no further WhatsApp messages', { skip }, async () => {
  const id = (await post('/api/enquiries', order({ whatsapp: '99887 76655' }), { auth: false })).body.enquiryId;
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '919988776655', type: 'text', text: { body: 'stop' } }] } }] }] });
  const sig = `sha256=${crypto.createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
  const hook = await fetch(`${url}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: raw });
  assert.equal(hook.status, 200);
  const e = await enquiryRow(id);
  assert.equal(e.whatsapp_opt_in, false);
  assert.ok(e.whatsapp_opt_out_at);
  waCalls = [];
  await setStatus(id, 'ACCEPTED', 'PENDING');
  const cust = (await notificationsFor(id, 'order_accepted')).find((r) => r.audience === 'customer' && r.channel === 'whatsapp');
  assert.equal(cust.status, 'skipped');
  assert.match(cust.last_error, /opted out/);
  assert.deepEqual(waCalls.map((w) => w.template), ['prime_order_update_owner']);
});

test('unconfigured WhatsApp is recorded as skipped with the reason, and can be retried once configured', { skip }, async () => {
  const offConfig = { ...config, whatsapp: { ...config.whatsapp, configured: false } };
  const offNotifier = createNotifier({
    pool,
    config: offConfig,
    email: fakeEmail,
    whatsapp: { ...fakeWhatsApp, configured: false, missing: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] },
    log: silent,
  });
  const store = createEnquiryStore({ pool, notifier: offNotifier });
  const { enquiry, notificationIds } = await store.create(validateEnquiry(order()));
  await offNotifier.processIds(notificationIds);
  const wa = (await notificationsFor(enquiry.public_id)).filter((r) => r.channel === 'whatsapp');
  assert.equal(wa.length, 2);
  for (const r of wa) {
    assert.equal(r.status, 'skipped');
    assert.match(r.last_error, /missing WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID/);
  }
  assert.equal(waCalls.length, 0);
  const summary = await store.publicSummary(enquiry.id);
  assert.equal(summary.customerWhatsApp, null, 'the customer is not told a WhatsApp message is coming');

  // the dashboard server (WhatsApp configured) can send them now
  for (const r of wa) assert.equal((await post(`/api/admin/notifications/${r.id}/retry`, {})).status, 200);
  assert.ok((await notificationsFor(enquiry.public_id)).filter((r) => r.channel === 'whatsapp').every((r) => r.status === 'accepted'));
  assert.equal((await post(`/api/admin/notifications/${wa[0].id}/retry`, {})).status, 409, 'accepted messages are never sent twice');
});

test('a confirmation can never be sent for an order the owner has not accepted', { skip }, async () => {
  const id = (await post('/api/enquiries', order(), { auth: false })).body.enquiryId;
  const e = await enquiryRow(id);
  emailCalls = [];
  // simulate a bug that queued a confirmation directly
  const { rows: [n] } = await pool.query(
    `INSERT INTO notifications (enquiry_id, event, audience, channel, provider, recipient) VALUES ($1, 'order_accepted', 'customer', 'email', 'brevo', $2) RETURNING id`,
    [e.id, e.customer_email],
  );
  await notifier.processIds([n.id]);
  const row = (await pool.query('SELECT status, last_error FROM notifications WHERE id = $1', [n.id])).rows[0];
  assert.equal(row.status, 'failed');
  assert.match(row.last_error, /Refusing to send/);
  assert.equal(emailCalls.length, 0);
  await assert.rejects(
    pool.query(`UPDATE enquiries SET order_status = 'PROCESSING' WHERE id = $1`, [e.id]),
    /enquiries_accepted_chk/,
    'the database refuses accepted-or-later statuses without an acceptance timestamp',
  );
});

// ------------------------------------------------------------------ delivery: retries & provider status

test('temporary failures are retried; permanent failures are not', { skip }, async () => {
  emailBehaviour = [
    new ProviderError('Brevo 503: unavailable', { retryable: true, status: 503 }),
    new ProviderError('Brevo 400: invalid sender', { retryable: false, status: 400 }),
  ];
  waBehaviour = [new ProviderError('WhatsApp request failed: timed out', { retryable: true })];
  const res = await post('/api/enquiries', contact(), { auth: false });
  let rows = await notificationsFor(res.body.enquiryId);
  assert.deepEqual(rows.map((r) => r.status).sort(), ['failed', 'retrying', 'retrying']);
  assert.ok(rows.find((r) => r.status === 'failed').last_error.includes('400'));

  await pool.query(`UPDATE notifications SET next_attempt_at = now() WHERE status = 'retrying'`);
  await notifier.tick();
  rows = await notificationsFor(res.body.enquiryId);
  const retried = rows.filter((r) => r.attempts === 2);
  assert.equal(retried.length, 2);
  assert.ok(retried.every((r) => r.status === 'accepted'));
  assert.equal(rows.find((r) => r.status === 'failed').attempts, 1, 'permanent failure not retried');
});

test('retries stop after the maximum number of attempts', { skip }, async () => {
  emailBehaviour = Array.from({ length: 20 }, () => new ProviderError('Brevo 500', { retryable: true, status: 500 }));
  const res = await post('/api/enquiries', { ...contact(), email: 'retry@example.com' }, { auth: false });
  for (let i = 0; i < config.worker.maxAttempts + 2; i++) {
    await pool.query(`UPDATE notifications SET next_attempt_at = now() WHERE status = 'retrying'`);
    await notifier.tick();
  }
  const emails = (await notificationsFor(res.body.enquiryId)).filter((r) => r.channel === 'email');
  assert.ok(emails.every((r) => r.status === 'failed' && r.attempts === config.worker.maxAttempts));
});

test('an interrupted send is not resent automatically', { skip }, async () => {
  const res = await post('/api/enquiries', contact(), { auth: false });
  const [n] = await notificationsFor(res.body.enquiryId);
  await pool.query(`UPDATE notifications SET status = 'sending', locked_until = now() - interval '1 minute' WHERE id = $1`, [n.id]);
  emailCalls = [];
  await notifier.tick();
  const row = (await pool.query('SELECT status, last_error FROM notifications WHERE id = $1', [n.id])).rows[0];
  assert.equal(row.status, 'failed');
  assert.match(row.last_error, /interrupted/);
  assert.equal(emailCalls.length, 0);
});

test('Brevo webhook updates delivery status (authenticated, forward-only)', { skip }, async () => {
  const res = await post('/api/enquiries', contact(), { auth: false });
  const n = (await notificationsFor(res.body.enquiryId)).find((r) => r.audience === 'customer');
  const event = (e, ts) => ({ event: e, email: 'ravi@example.com', 'message-id': n.provider_message_id, ts_event: ts });
  assert.equal((await post('/api/webhooks/brevo?token=wrong', event('delivered', 1), { auth: false })).status, 401);
  assert.equal((await post('/api/webhooks/brevo?token=brevo-token', event('delivered', 1_800_000_000), { auth: false })).status, 200);
  await post('/api/webhooks/brevo?token=brevo-token', event('delivered', 1_800_000_000), { auth: false }); // duplicate event
  await post('/api/webhooks/brevo?token=brevo-token', event('hard_bounce', 1_800_000_100), { auth: false }); // cannot undo delivery
  const row = (await pool.query('SELECT status, delivered_at FROM notifications WHERE id = $1', [n.id])).rows[0];
  assert.equal(row.status, 'delivered');
  assert.ok(row.delivered_at);
  const events = (await pool.query('SELECT event FROM notification_events WHERE notification_id = $1 ORDER BY id', [n.id])).rows;
  assert.deepEqual(events.map((e) => e.event), ['delivered', 'hard_bounce']);

  const res2 = await post('/api/enquiries', contact(), { auth: false });
  const n2 = (await notificationsFor(res2.body.enquiryId)).find((r) => r.audience === 'customer');
  await post('/api/webhooks/brevo?token=brevo-token', { event: 'hard_bounce', 'message-id': n2.provider_message_id, ts_event: 1_800_000_000, reason: 'mailbox does not exist' }, { auth: false });
  const row2 = (await pool.query('SELECT status, last_error FROM notifications WHERE id = $1', [n2.id])).rows[0];
  assert.equal(row2.status, 'bounced');
  assert.equal(row2.last_error, 'mailbox does not exist');
});

test('WhatsApp webhook: verification handshake, signature check and status updates', { skip }, async () => {
  const verify = await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42`);
  assert.equal(await verify.text(), '42');
  assert.equal((await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=42`)).status, 403);

  const res = await post('/api/enquiries', order(), { auth: false });
  const n = (await notificationsFor(res.body.enquiryId)).find((r) => r.audience === 'customer' && r.channel === 'whatsapp');
  const send = (status, ts, secret = 'app-secret') => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: n.provider_message_id, status, timestamp: String(ts) }] } }] }] });
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
    return fetch(`${url}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: raw });
  };
  assert.equal((await send('delivered', 1_800_000_000, 'forged')).status, 401);
  assert.equal((await send('read', 1_800_000_050)).status, 200);
  assert.equal((await send('delivered', 1_800_000_000)).status, 200); // late, out of order
  const row = (await pool.query('SELECT status, delivered_at FROM notifications WHERE id = $1', [n.id])).rows[0];
  assert.equal(row.status, 'read');
  const detail = (await get(`/api/admin/enquiries/${res.body.enquiryId}`)).body;
  assert.equal(detail.notifications.find((x) => x.id === n.id).status, 'read', 'delivery status is visible in the dashboard');
});

test('sandbox (test mode) emails are never reported as sent', { skip }, async () => {
  const sandboxEmail = { ...fakeEmail, sendEmail: async (m) => ({ ...(await fakeEmail.sendEmail(m)), response: { sandbox: true } }) };
  const n2 = createNotifier({ pool, config, email: sandboxEmail, whatsapp: { ...fakeWhatsApp, configured: false, missing: ['X'] }, log: silent });
  const store = createEnquiryStore({ pool, notifier: n2 });
  const { enquiry, notificationIds } = await store.create(validateEnquiry(contact()));
  await n2.processIds(notificationIds);
  const summary = await store.publicSummary(enquiry.id);
  assert.equal(summary.customerEmail.status, 'test_mode');
  assert.equal(summary.teamNotified, false);
});

test('admin list filters by status and search; counts per status', { skip }, async () => {
  const id = (await post('/api/enquiries', order({ name: 'Zubair Unique' }), { auth: false })).body.enquiryId;
  const pending = (await get('/api/admin/enquiries?type=order&status=PENDING')).body;
  assert.ok(pending.items.some((i) => i.public_id === id));
  assert.ok(pending.items.every((i) => i.order_status === 'PENDING'));
  assert.ok(pending.counts.PENDING >= 1 && pending.counts.ENQUIRY >= 1);
  const found = (await get('/api/admin/enquiries?type=all&q=zubair')).body.items;
  assert.deepEqual(found.map((i) => i.public_id), [id]);
  const sys = (await get('/api/admin/system')).body;
  assert.equal(sys.whatsapp.configured, true);
  assert.equal(sys.email.ownerAddress, 'team@example.com');
});

// ------------------------------------------------------------------ migrations

test('migration 002 upgrades an existing database without losing enquiries or notifications', { skip }, async () => {
  const u = new URL(baseUrl);
  u.pathname = '/primeh2o_migrate_test';
  const db = new pg.Pool({ connectionString: u.toString() });
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    // a database created by the previous version: original schema + data
    await db.query(await fs.readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
    await db.query(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
                    INSERT INTO schema_migrations (version) VALUES ('001_initial.sql')`);
    const ins = await db.query(
      `INSERT INTO enquiries (public_id, source, content_hash, customer_name, customer_phone, customer_email, bottle_size, quantity)
       VALUES ('PRM-260101-AAAAAA', 'custom_bottle', 'h1', 'Old Order', '+919876543210', 'old@example.com', '500 mL', 100),
              ('PRM-260101-BBBBBB', 'contact', 'h2', 'Old Enquiry', '+919876543210', 'old@example.com', NULL, NULL)
       RETURNING id`,
    );
    const [orderId, enquiryId] = ins.rows.map((r) => r.id);
    await db.query(
      `INSERT INTO notifications (enquiry_id, kind, channel, provider, recipient, status) VALUES
         ($1, 'customer_email', 'email', 'brevo', 'old@example.com', 'delivered'),
         ($1, 'business_whatsapp', 'whatsapp', 'meta_whatsapp', '+918143489222', 'skipped'),
         ($2, 'business_email', 'email', 'brevo', 'team@example.com', 'accepted')`,
      [orderId, enquiryId],
    );
    await migrate(db);
    const e = (await db.query('SELECT public_id, order_status FROM enquiries ORDER BY public_id')).rows;
    assert.deepEqual(e.map((r) => [r.public_id, r.order_status]), [['PRM-260101-AAAAAA', 'PENDING'], ['PRM-260101-BBBBBB', null]]);
    const n = (await db.query('SELECT enquiry_id, event, audience, channel, status, history_id IS NOT NULL AS linked FROM notifications ORDER BY id')).rows;
    assert.deepEqual(n.map((r) => [r.event, r.audience, r.channel, r.status, r.linked]), [
      ['order_received', 'customer', 'email', 'delivered', true],
      ['order_received', 'owner', 'whatsapp', 'skipped', true],
      ['enquiry_received', 'owner', 'email', 'accepted', false],
    ]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM order_status_history')).rows[0].n, 1);
    // 003: both old records belong to the same person (email + phone) → one customer, both linked
    const customers = (await db.query('SELECT id, full_name FROM customers')).rows;
    assert.equal(customers.length, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM enquiries WHERE customer_id = $1', [customers[0].id])).rows[0].n, 2);
    assert.equal((await db.query(`SELECT role FROM admin_users LIMIT 1`)).rows.length, 0);
  } finally {
    await db.end();
  }
});
