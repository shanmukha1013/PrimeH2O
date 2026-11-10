import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../adminAuth.js';
import { shouldAdvance } from '../notifications.js';
import { EVENTS, ORDER_STATUSES, TRANSITIONS, canTransition } from '../orderStatus.js';
import {
  BUSINESS_EMAIL_TEMPLATE,
  CUSTOMER_EMAIL_TEMPLATE,
  CUSTOMER_UPDATES,
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_PARAMS,
  buildEmail,
  buildWhatsApp,
  businessEmail,
  customerEmail,
  enquiryVariables,
  renderHtml,
  renderText,
  whatsappParams,
  whatsappTemplateExample,
  whatsappTemplateFor,
} from '../templates.js';
import { ValidationError, normalizeEmail, normalizePhone, validateEnquiry } from '../validation.js';

test('phone numbers normalise to E.164', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('+91 81434 89222'), '+918143489222');
  assert.equal(normalizePhone('918143489222'), '+918143489222');
  assert.equal(normalizePhone('08143489222'), '+918143489222');
  assert.equal(normalizePhone('040-2345 6789'), '+914023456789');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  for (const bad of ['12345', '5876543210', 'abc', '+91 12345', '', '++919876543210']) assert.equal(normalizePhone(bad), null, bad);
});

test('email addresses are validated', () => {
  assert.equal(normalizeEmail(' Ravi@Example.COM '), 'Ravi@example.com');
  for (const bad of ['ravi', 'ravi@', '@x.com', 'a@b', 'a b@c.com', 'a..b@c.com', 'a@-c.com']) assert.equal(normalizeEmail(bad), null, bad);
});

const contact = { source: 'contact', name: 'Ravi Teja', phone: '9876543210', email: 'ravi@example.com', bottleSize: 'All Sizes', message: 'Need 50 cases' };
const custom = {
  source: 'custom_bottle',
  name: 'Ravi Teja',
  phone: '9876543210',
  email: 'ravi@example.com',
  bottleSize: '500 mL',
  quantity: '500',
  customization: { template: 'Corporate Branding', colour: 'Burgundy (#500D18)', labelName: 'Acme' },
};

test('valid enquiries pass and are normalised', () => {
  const c = validateEnquiry(contact);
  assert.equal(c.phone, '+919876543210');
  assert.equal(c.quantity, null);
  const b = validateEnquiry(custom);
  assert.equal(b.quantity, 500);
  assert.equal(b.whatsappOptIn, false);
  assert.equal(b.whatsapp, null);
  const w = validateEnquiry({ ...custom, whatsappOptIn: true });
  assert.equal(w.whatsapp, '+919876543210', 'defaults to the phone number');
  assert.match(w.whatsappConsentText, /STOP/);
  assert.equal(validateEnquiry({ ...custom, whatsappOptIn: true, whatsapp: '+91 99887 76655' }).whatsapp, '+919988776655');
  assert.equal(validateEnquiry({ ...contact, whatsappOptIn: true }).whatsappOptIn, false, 'contact form has no WhatsApp opt-in');
  assert.match(b.contentHash, /^[0-9a-f]{64}$/);
});

test('invalid enquiries report field errors', () => {
  const fields = (body) => {
    try {
      validateEnquiry(body);
      return {};
    } catch (e) {
      assert.ok(e instanceof ValidationError);
      return e.fields;
    }
  };
  assert.ok(fields({ ...contact, email: '' }).email, 'contact needs email');
  assert.ok(fields({ ...custom, email: '' }).email, 'orders need email');
  assert.ok(fields({ ...custom, whatsappOptIn: true, whatsapp: '040 2345 6789' }).whatsapp, 'landline is not WhatsApp');
  assert.ok(fields({ ...custom, whatsappOptIn: 'yes' }).whatsappOptIn);
  assert.ok(fields({ ...contact, message: '' }).message);
  assert.ok(fields({ ...contact, phone: '12' }).phone);
  assert.ok(fields({ ...custom, quantity: '0' }).quantity);
  assert.ok(fields({ ...custom, quantity: '2.5' }).quantity);
  assert.ok(fields({ ...custom, quantity: undefined }).quantity);
  assert.ok(fields({ ...custom, deliveryDate: '2020-01-01' }).deliveryDate);
  assert.ok(fields({ ...custom, deliveryDate: '2026-02-30' }).deliveryDate);
  assert.ok(fields({ ...custom, bottleSize: '2 L' }).bottleSize);
  assert.ok(fields({ ...custom, customization: { labelName: '' } })['customization.labelName']);
  assert.ok(fields({ ...custom, logo: { contentType: 'image/png', filename: 'x.png', data: Buffer.from('not a png').toString('base64') } }).logo);
  assert.ok(fields({ ...custom, logo: { contentType: 'application/pdf', data: 'AAAA' } }).logo);
  assert.ok(fields({ ...contact, clientRequestId: 'nope' }).clientRequestId);
  assert.ok(fields({ ...contact, source: 'x' }).source);
});

const enquiry = {
  public_id: 'PRM-261107-ABCDEF',
  source: 'custom_bottle',
  customer_name: 'Ravi <script>alert(1)</script>',
  customer_phone: '+919876543210',
  customer_email: null,
  company_name: 'Acme & Co',
  bottle_size: '500 mL',
  quantity: 1500,
  delivery_date: '2026-12-12',
  customer_message: 'Line one\nLine two',
  customization: { template: 'Corporate Branding', colour: 'Burgundy (#500D18)', labelName: 'Acme', tagline: '', details: 'Pantone 286' },
};

test('templates fill every variable', () => {
  const vars = enquiryVariables(enquiry, [{ kind: 'logo', filename: 'acme.png' }]);
  for (const tpl of [CUSTOMER_EMAIL_TEMPLATE, BUSINESS_EMAIL_TEMPLATE]) {
    const text = renderText(tpl, vars);
    assert.ok(!text.includes('{{'), 'no unreplaced variables');
    assert.ok(!text.includes('**'), 'markdown removed from text');
    assert.ok(text.includes('PRM-261107-ABCDEF'));
  }
  assert.equal(vars.quantity, '1,500 bottles');
  assert.equal(vars.customer_phone, '+91 98765 43210');
  assert.equal(vars.customer_email, 'Not provided');
  assert.equal(vars.delivery_date, '12 Dec 2026');
  assert.match(vars.customization_details, /Logo \/ image: uploaded \(acme\.png\)/);
});

test('HTML emails escape customer data', () => {
  const { html, subject } = businessEmail(enquiry, []);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Ravi &lt;script&gt;'));
  assert.ok(html.includes('Acme &amp; Co'));
  assert.ok(html.includes('Line one<br>Line two'));
  assert.match(subject, /Custom bottle order PRM-261107-ABCDEF/);
  assert.ok(customerEmail(enquiry, []).html.includes('YOUR ENQUIRY DETAILS'));
  assert.throws(() => renderHtml('Hi {{missing}}', {}), /no value/);
});

test('WhatsApp parameters satisfy Meta rules', () => {
  const params = whatsappParams(WHATSAPP_TEMPLATE_PARAMS, enquiryVariables({ ...enquiry, customer_name: '  ', customization: { ...enquiry.customization, details: 'a\n\tb' + ' '.repeat(10) + 'c'.repeat(400) } }, []));
  assert.equal(params.length, 7);
  for (const p of params) {
    assert.ok(p.length > 0 && p.length <= 300);
    assert.ok(!/[\n\t]/.test(p));
    assert.ok(!/ {5,}/.test(p));
  }
  assert.equal(params[0], '—');
  assert.equal(params[6], 'PRM-261107-ABCDEF');
});

test('delivery status only moves forward', () => {
  assert.ok(shouldAdvance('accepted', 'delivered'));
  assert.ok(shouldAdvance('sent', 'read'));
  assert.ok(!shouldAdvance('delivered', 'sent'));
  assert.ok(!shouldAdvance('read', 'delivered'));
  assert.ok(shouldAdvance('accepted', 'bounced'));
  assert.ok(!shouldAdvance('delivered', 'bounced'));
  assert.ok(!shouldAdvance('failed', 'delivered'));
  assert.ok(!shouldAdvance('accepted', null));
});

test('every WhatsApp template follows Meta rules and has example values', () => {
  for (const [name, t] of Object.entries(WHATSAPP_TEMPLATES)) {
    assert.match(name, /^[a-z0-9_]{1,512}$/, name);
    const vars = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(vars, t.params.map((_, i) => i + 1), `${name}: {{1}}..{{n}} in order, one per param`);
    assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*$/.test(t.body), `${name}: no variable at the start or end`);
    assert.ok(!/\}\}\s*\{\{/.test(t.body), `${name}: no adjacent variables`);
    assert.ok(t.body.length <= 1024, `${name}: body within 1024 characters`);
    assert.ok(!/\n{3,}/.test(t.body), `${name}: no more than one blank line`);
    const example = whatsappTemplateExample(name);
    assert.equal(example.length, t.params.length);
    assert.ok(example.every((v) => v && v !== '—' && !/[\n\t]/.test(v)), `${name}: example ${JSON.stringify(example)}`);
  }
});

const STATUS_OF_EVENT = {
  order_received: 'PENDING',
  order_accepted: 'ACCEPTED',
  order_rejected: 'REJECTED',
  order_processing: 'PROCESSING',
  order_ready_for_dispatch: 'READY_FOR_DISPATCH',
  order_dispatched: 'DISPATCHED',
  order_delivered: 'DELIVERED',
  order_cancelled: 'CANCELLED',
};
const anOrder = { ...enquiry, customer_email: 'ravi@example.com', order_status: 'PENDING', whatsapp_opt_in: true, customer_whatsapp: '+919876543210' };

test('every order event has an email and a WhatsApp template for both owner and customer', () => {
  for (const event of EVENTS.filter((e) => e !== 'enquiry_received')) {
    const status = STATUS_OF_EVENT[event];
    const history = { to_status: status, from_status: 'PENDING', note: 'Note <b>', actor_label: 'Owner', created_at: '2026-11-07T10:00:00Z' };
    for (const audience of ['owner', 'customer']) {
      const e = { ...anOrder, order_status: status };
      const mail = buildEmail({ event, audience, enquiry: e, files: [], history, adminUrl: 'https://x/admin' });
      assert.ok(mail.subject && !mail.text.includes('{{') && !mail.html.includes('{{'), `${audience} ${event} email`);
      assert.ok(mail.text.includes('PRM-261107-ABCDEF'));
      assert.ok(!mail.html.includes('<b>'), 'notes are escaped');
      const wa = buildWhatsApp({ event, audience, enquiry: e, files: [], history });
      assert.equal(wa.template, whatsappTemplateFor(event, audience));
      assert.equal(wa.params.length, WHATSAPP_TEMPLATES[wa.template].params.length);
    }
  }
  assert.deepEqual(Object.keys(CUSTOMER_UPDATES).sort(), EVENTS.filter((e) => !['enquiry_received', 'order_received'].includes(e)).sort());
});

test('only an accepted order is ever called confirmed', () => {
  for (const event of EVENTS.filter((e) => e !== 'enquiry_received' && e !== 'order_accepted')) {
    const history = { to_status: STATUS_OF_EVENT[event], from_status: 'PENDING', created_at: new Date() };
    const mail = buildEmail({ event, audience: 'customer', enquiry: anOrder, history });
    assert.doesNotMatch(mail.subject, /confirmed/i, event);
    assert.doesNotMatch(mail.text, /has been (reviewed and )?\**confirmed/i, event);
  }
  const received = buildEmail({ event: 'order_received', audience: 'customer', enquiry: anOrder, history: { to_status: 'PENDING', created_at: new Date() } });
  assert.match(received.text, /not an order confirmation/);
  const accepted = buildEmail({ event: 'order_accepted', audience: 'customer', enquiry: anOrder, history: { to_status: 'ACCEPTED', from_status: 'PENDING', created_at: new Date() } });
  assert.match(accepted.subject, /is confirmed/);
});

test('order status machine: approval first, no going back, terminal states are final', () => {
  assert.ok(canTransition('PENDING', 'ACCEPTED'));
  assert.ok(canTransition('PENDING', 'REJECTED'));
  for (const s of ['PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED']) assert.ok(!canTransition('PENDING', s), `PENDING -> ${s}`);
  assert.ok(!canTransition('ACCEPTED', 'PENDING'));
  assert.ok(!canTransition('REJECTED', 'ACCEPTED'));
  assert.ok(!canTransition('DISPATCHED', 'CANCELLED'));
  for (const s of ['REJECTED', 'DELIVERED', 'CANCELLED']) assert.deepEqual(TRANSITIONS[s], []);
  for (const s of ORDER_STATUSES) for (const t of TRANSITIONS[s]) assert.ok(ORDER_STATUSES.includes(t));
});

test('admin passwords are salted scrypt hashes', async () => {
  const a = await hashPassword('correct horse battery staple');
  const b = await hashPassword('correct horse battery staple');
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$16384\$8\$1\$/);
  assert.ok(await verifyPassword('correct horse battery staple', a));
  assert.ok(!(await verifyPassword('correct horse battery stapl', a)));
  assert.ok(!(await verifyPassword('x', 'garbage')));
});
