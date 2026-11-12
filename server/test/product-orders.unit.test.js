// Unit tests for online product orders: validation, prices, message content and Meta limits.
// No database or network needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { rupeesToPaise } from '../enquiries.js';
import { EVENTS, EVENT_FOR_STATUS } from '../orderStatus.js';
import {
  WHATSAPP_BODY_MAX,
  WHATSAPP_TEMPLATES,
  buildEmail,
  buildWhatsApp,
  formatRupees,
  renderWhatsAppBody,
  whatsappTemplateFor,
} from '../templates.js';
import {
  INDIAN_STATES,
  MAX_LINE_QUANTITY,
  PRODUCT_CODES,
  ValidationError,
  WHATSAPP_CONSENT_TEXT,
  validateProductOrder,
} from '../validation.js';

const STATUS_OF_EVENT = Object.fromEntries(Object.entries(EVENT_FOR_STATUS).map(([status, event]) => [event, status]));

const productOrder = (extra = {}) => ({
  clientRequestId: '6f1c2a4e-8b7d-4c3e-9a1f-2d3c4b5a6e7f',
  name: 'Lakshmi Devi',
  phone: '98765 43210',
  whatsapp: '',
  email: '',
  address: 'H.No 2-3-45, Street 4, Nagole',
  city: 'Hyderabad',
  state: 'Telangana',
  pinCode: '500 068',
  items: [{ product: 'prime-500', quantity: 24 }],
  instructions: 'Call before delivery',
  whatsappOptIn: true,
  ...extra,
});

const fieldsOf = (body) => {
  try {
    validateProductOrder(body);
  } catch (e) {
    assert.ok(e instanceof ValidationError);
    return e.fields;
  }
  return assert.fail('expected a ValidationError');
};

test('online orders: valid single- and multiple-size orders are normalised', () => {
  const v = validateProductOrder(productOrder());
  assert.equal(v.source, 'product_order');
  assert.equal(v.phone, '+919876543210');
  assert.equal(v.whatsapp, '+919876543210', 'a blank WhatsApp number means the mobile number');
  assert.equal(v.email, null, 'email is optional');
  assert.equal(v.pinCode, '500068');
  assert.deepEqual(v.items, [{ productCode: 'prime-500', quantity: 24 }]);
  assert.equal(v.whatsappOptIn, true);
  assert.equal(v.whatsappConsentText, WHATSAPP_CONSENT_TEXT);
  assert.equal(v.message, 'Call before delivery');

  const multi = validateProductOrder(
    productOrder({
      items: [
        { product: 'prime-1000', quantity: '12' },
        { product: 'prime-250', quantity: 48 },
      ],
      whatsapp: '+91 91234 56789',
      email: 'Lakshmi@Example.COM',
      state: 'telangana',
      whatsappOptIn: false,
    }),
  );
  assert.deepEqual(multi.items, [
    { productCode: 'prime-250', quantity: 48 },
    { productCode: 'prime-1000', quantity: 12 },
  ]);
  assert.equal(multi.whatsapp, '+919123456789');
  assert.equal(multi.email, 'Lakshmi@example.com');
  assert.equal(multi.state, 'Telangana');
  assert.equal(multi.whatsappConsentText, null, 'no consent recorded without opt-in');

  assert.equal(validateProductOrder(productOrder()).contentHash, v.contentHash, 'same order, same fingerprint');
  assert.notEqual(validateProductOrder(productOrder({ items: [{ product: 'prime-500', quantity: 25 }] })).contentHash, v.contentHash);
  assert.deepEqual([...PRODUCT_CODES], ['prime-250', 'prime-500', 'prime-1000']);
});

test('online orders: bad phone, missing address, bad quantities and unknown or repeated sizes are refused field by field', () => {
  assert.match(fieldsOf(productOrder({ phone: '12345' })).phone, /mobile/);
  assert.match(fieldsOf(productOrder({ phone: '040 2345 6789' })).phone, /mobile/, 'landlines cannot receive WhatsApp');
  assert.match(fieldsOf(productOrder({ phone: '' })).phone, /mobile/);
  assert.match(fieldsOf(productOrder({ address: '' })).address, /delivery address/);
  assert.match(fieldsOf(productOrder({ address: 'Flat 1' })).address, /delivery address/);
  assert.ok(fieldsOf(productOrder({ city: '' })).city);
  assert.ok(fieldsOf(productOrder({ state: 'Atlantis' })).state);
  assert.ok(fieldsOf(productOrder({ pinCode: '012345' })).pinCode);
  assert.ok(fieldsOf(productOrder({ pinCode: '50006' })).pinCode);
  assert.ok(fieldsOf(productOrder({ items: [] })).items);
  assert.ok(fieldsOf(productOrder({ items: 'prime-500' })).items);
  for (const quantity of [0, -3, 2.5, 'ten', '', null, MAX_LINE_QUANTITY + 1]) {
    assert.ok(fieldsOf(productOrder({ items: [{ product: 'prime-500', quantity }] }))['items.prime-500'], `quantity ${quantity}`);
  }
  assert.ok(fieldsOf(productOrder({ items: [{ product: 'prime-2000', quantity: 1 }] }))['items.0']);
  assert.ok(
    fieldsOf(
      productOrder({
        items: [
          { product: 'prime-500', quantity: 1 },
          { product: 'prime-500', quantity: 2 },
        ],
      }),
    )['items.prime-500'],
  );
  assert.ok(fieldsOf(productOrder({ whatsapp: '12' })).whatsapp);
  assert.ok(fieldsOf(productOrder({ email: 'not-an-email' })).email);
  assert.ok(fieldsOf(productOrder({ whatsappOptIn: 'yes' })).whatsappOptIn);
  assert.ok(fieldsOf(productOrder({ name: 'A' })).name);
  assert.ok(fieldsOf(productOrder({ instructions: 'x'.repeat(1001) })).instructions);
  assert.ok(fieldsOf(productOrder({ clientRequestId: 'not-a-uuid' })).clientRequestId);
  assert.throws(() => validateProductOrder(null), ValidationError);
  assert.throws(() => validateProductOrder([]), ValidationError);
  // prices and totals are never taken from the browser
  const v = validateProductOrder(productOrder({ items: [{ product: 'prime-500', quantity: 2, unitPrice: 1 }], total: 1 }));
  assert.deepEqual(v.items, [{ productCode: 'prime-500', quantity: 2 }]);
  assert.equal('total' in v, false);
});

test('prices in rupees convert to paise exactly, and display in rupees', () => {
  assert.equal(rupeesToPaise('12'), 1200);
  assert.equal(rupeesToPaise('12.5'), 1250);
  assert.equal(rupeesToPaise('12.05'), 1205);
  assert.equal(rupeesToPaise(19.99), 1999);
  assert.equal(rupeesToPaise(0.1), 10);
  for (const bad of ['1,000', '-1', '1.234', '', 'abc', '1e3', null]) assert.ok(Number.isNaN(rupeesToPaise(bad)), String(bad));
  assert.equal(formatRupees(123450), '₹1,234.50');
  assert.equal(formatRupees('10000000'), '₹1,00,000.00');
});

const productEnquiry = {
  id: 7,
  public_id: 'PRM-261112-QWERTY',
  source: 'product_order',
  order_status: 'PENDING',
  customer_name: 'Lakshmi <b>Devi</b>',
  customer_phone: '+919876543210',
  customer_email: null,
  customer_whatsapp: '+919876543210',
  whatsapp_opt_in: true,
  delivery_address: 'H.No 2-3-45, Street 4\nNagole',
  delivery_city: 'Hyderabad',
  delivery_state: 'Telangana',
  delivery_pin_code: '500068',
  customer_message: 'Call before delivery',
  total_paise: '48000',
  created_at: '2026-11-12T06:00:00Z',
};
// test fixture prices only (pg returns BIGINT columns as strings)
const pricedItems = [
  { product_name: 'PRIME H₂O 500 mL', bottle_size: '500 mL', quantity: 24, unit_price_paise: '1000', line_total_paise: '24000' },
  { product_name: 'PRIME H₂O 1000 mL', bottle_size: '1000 mL', quantity: 12, unit_price_paise: '2000', line_total_paise: '24000' },
];
const unpricedItems = pricedItems.map((i) => ({ ...i, unit_price_paise: null, line_total_paise: null }));

test('online orders: every event has an email and a WhatsApp message with all products, the total and the address', () => {
  for (const event of EVENTS.filter((e) => e !== 'enquiry_received')) {
    const status = STATUS_OF_EVENT[event];
    const history = { to_status: status, from_status: 'PENDING', note: 'Note <b>', actor_label: 'Owner', created_at: '2026-11-12T10:00:00Z' };
    for (const audience of ['owner', 'customer']) {
      const e = { ...productEnquiry, order_status: status };
      const mail = buildEmail({ event, audience, enquiry: e, history, adminUrl: 'https://x/admin', items: pricedItems });
      assert.ok(mail.subject && !mail.text.includes('{{') && !mail.html.includes('{{'), `${audience} ${event} email`);
      for (const s of ['PRM-261112-QWERTY', 'PRIME H₂O 500 mL', '24 bottles × ₹10.00 = ₹240.00', 'PRIME H₂O 1000 mL', '₹480.00', 'Nagole', '500068']) {
        assert.ok(mail.text.includes(s), `${audience} ${event} email: ${s}`);
      }
      assert.ok(!mail.html.includes('<b>'), 'customer data is escaped');
      assert.doesNotMatch(mail.text, /label artwork|custom label/i, `${audience} ${event}: no custom-label wording for online orders`);
      const wa = buildWhatsApp({ event, audience, enquiry: e, history, items: pricedItems });
      assert.equal(wa.template, whatsappTemplateFor(event, audience, 'product_order'));
      assert.equal(wa.params.length, WHATSAPP_TEMPLATES[wa.template].params.length);
    }
  }

  const owner = buildWhatsApp({ event: 'order_received', audience: 'owner', enquiry: productEnquiry, items: pricedItems });
  assert.equal(owner.template, 'prime_product_order_new');
  const ownerText = renderWhatsAppBody(WHATSAPP_TEMPLATES[owner.template].body, owner.params);
  for (const s of [
    'Order ID: PRM-261112-QWERTY',
    'Placed: 12 Nov 2026',
    'Customer: Lakshmi <b>Devi</b>',
    'WhatsApp: +91 98765 43210 (agreed to WhatsApp updates)',
    'Email: Not provided',
    'PRIME H₂O 500 mL × 24 bottles × ₹10.00 = ₹240.00; PRIME H₂O 1000 mL × 12 bottles × ₹20.00 = ₹240.00',
    'Total: ₹480.00',
    'H.No 2-3-45, Street 4 | Nagole, Hyderabad, Telangana – 500068',
    'Instructions: Call before delivery',
  ]) {
    assert.ok(ownerText.includes(s), `owner WhatsApp: ${s}\n${ownerText}`);
  }

  const customer = buildWhatsApp({ event: 'order_received', audience: 'customer', enquiry: productEnquiry, items: pricedItems });
  assert.equal(customer.template, 'prime_product_order_received');
  const customerText = renderWhatsAppBody(WHATSAPP_TEMPLATES[customer.template].body, customer.params);
  for (const s of [
    'Thank you for choosing PRIME H₂O!',
    'Order ID: PRM-261112-QWERTY',
    'Customer: Lakshmi',
    '× ₹10.00',
    'Total: ₹480.00',
    'Delivery Address: H.No',
    'Status: Received — Awaiting Confirmation',
    '+91 81434 89222',
    'I Trust PRIME.',
  ]) {
    assert.ok(customerText.includes(s), `customer WhatsApp: ${s}`);
  }

  // no prices configured: nothing made up, the total is "to be confirmed"
  const unpriced = buildWhatsApp({ event: 'order_received', audience: 'customer', enquiry: { ...productEnquiry, total_paise: null }, items: unpricedItems });
  const unpricedText = renderWhatsAppBody(WHATSAPP_TEMPLATES[unpriced.template].body, unpriced.params);
  assert.ok(unpricedText.includes('24 bottles (price to be confirmed)'));
  assert.ok(unpricedText.includes('Total: To be confirmed by PRIME H₂O'));
  assert.ok(!unpricedText.includes('₹'));
  const unpricedMail = buildEmail({ event: 'order_received', audience: 'owner', enquiry: { ...productEnquiry, total_paise: null }, items: unpricedItems });
  assert.ok(unpricedMail.text.includes('To be confirmed by PRIME H₂O') && !unpricedMail.text.includes('₹'));

  // status updates use the shared approved templates, with the product summary and delivery-focused next steps
  const accepted = buildWhatsApp({
    event: 'order_accepted',
    audience: 'customer',
    enquiry: { ...productEnquiry, order_status: 'ACCEPTED' },
    history: { to_status: 'ACCEPTED', from_status: 'PENDING', note: '', created_at: new Date() },
    items: pricedItems,
  });
  assert.equal(accepted.template, 'prime_order_accepted');
  assert.equal(accepted.params[2], 'PRIME H₂O 500 mL × 24 bottles, PRIME H₂O 1000 mL × 12 bottles');
  assert.match(accepted.params[3], /delivery schedule and payment/);

  // the acknowledgement never calls the order confirmed
  const received = buildEmail({ event: 'order_received', audience: 'customer', enquiry: productEnquiry, items: pricedItems });
  assert.doesNotMatch(`${received.subject} ${received.text}`, /\bconfirmed\b/i);
  assert.doesNotMatch(customerText, /\bconfirmed\b/i);
  assert.match(received.text, /awaiting confirmation/);
});

test('WhatsApp messages stay within the 1024-character limit, however long the customer’s text', () => {
  const long = 'x'.repeat(2000);
  const e = {
    ...productEnquiry,
    customer_name: 'N'.repeat(100),
    customer_email: `${'a'.repeat(60)}@example.com`,
    delivery_address: long,
    delivery_city: 'C'.repeat(60),
    customer_message: `${long} ${'😀'.repeat(200)}`,
    total_paise: '1000000000000',
  };
  const items = [
    { product_name: 'PRIME H₂O 250 mL', bottle_size: '250 mL', quantity: 100000, unit_price_paise: '9999999', line_total_paise: '999999900000' },
    ...pricedItems,
  ];
  for (const audience of ['owner', 'customer']) {
    const { template, params } = buildWhatsApp({ event: 'order_received', audience, enquiry: e, items });
    const body = renderWhatsAppBody(WHATSAPP_TEMPLATES[template].body, params);
    assert.ok(body.length <= WHATSAPP_BODY_MAX, `${template}: ${body.length} characters`);
    assert.ok(body.includes('PRM-261112-QWERTY'), 'the order ID is never shortened');
    for (const p of params) {
      assert.ok(p.length > 0 && !/[\n\t]/.test(p) && !/ {5,}/.test(p), JSON.stringify(p).slice(0, 80));
      assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(p), 'never cuts an emoji in half');
    }
  }
});

test('the website order form and the server agree on products, states, limits and consent wording', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const literals = (src, startMarker) => {
    const start = src.indexOf(startMarker);
    assert.ok(start >= 0, startMarker);
    const block = src.slice(start, src.indexOf(';', start));
    return [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  };
  const orderForm = read('../../src/lib/orderForm.ts');
  assert.deepEqual(literals(orderForm, 'export const INDIAN_STATES'), INDIAN_STATES);
  assert.equal(literals(read('../../src/lib/enquiryApi.ts'), 'export const WHATSAPP_CONSENT_TEXT').join(''), WHATSAPP_CONSENT_TEXT);
  assert.ok(orderForm.includes(`MAX_LINE_QUANTITY = ${String(MAX_LINE_QUANTITY).replace(/\B(?=(\d{3})+$)/g, '_')};`));
  const catalogue = read('../../src/components/ProductCollection.tsx');
  for (const code of PRODUCT_CODES) assert.ok(catalogue.includes(`id: '${code}'`), code);
  const migration = read('../migrations/004_product_orders.sql');
  for (const code of PRODUCT_CODES) assert.ok(migration.includes(`('${code}'`), code);
});
