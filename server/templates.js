// Message content for every notification. The enquiry templates below were supplied by PRIME H₂O.
// Email templates use light markdown: **bold**, "- " list items, blank line = new paragraph.
import { STATUS_LABEL } from './orderStatus.js';

export const CUSTOMER_EMAIL_TEMPLATE = `Dear {{customer_name}},

Thank you for choosing PRIME H₂O!

We are delighted to receive your enquiry. Your requirements have been successfully received by our team.

**YOUR ENQUIRY DETAILS**

- Enquiry ID: {{enquiry_id}}
- Bottle Size: {{bottle_size}}
- Quantity: {{quantity}}
- Customization: {{customization_details}}

Our team will review your requirements and contact you shortly to discuss availability, pricing and delivery.

For immediate assistance:

**WhatsApp:** +91 81434 89222

Thank you for trusting PRIME H₂O.

**I TRUST PRIME.**

PRIME H₂O
Packaged Drinking Water`;

export const BUSINESS_EMAIL_TEMPLATE = `A new customer enquiry has been submitted through the PRIME H₂O website.

**CUSTOMER DETAILS**
- Name: {{customer_name}}
- Phone: {{customer_phone}}
- Email: {{customer_email}}
- Company: {{company_name}}

**ORDER REQUIREMENTS**
- Enquiry ID: {{enquiry_id}}
- Bottle Size: {{bottle_size}}
- Quantity: {{quantity}}
- Customization: {{customization_details}}
- Preferred Delivery: {{delivery_date}}

**CUSTOMER MESSAGE**

{{customer_message}}

**ACTION REQUIRED:** Review this enquiry and contact the customer.

WhatsApp: +91 81434 89222

PRIME H₂O — I Trust PRIME.`;

// Body to register in Meta WhatsApp Manager (template "prime_new_enquiry", category UTILITY).
// Meta uses positional variables; WHATSAPP_TEMPLATE_PARAMS lists what fills {{1}}…{{7}}.
export const WHATSAPP_TEMPLATE_BODY = `🔔 *NEW PRIME H₂O WEBSITE ENQUIRY*

A new customer enquiry has arrived!

👤 Customer: {{1}}
📞 Phone: {{2}}
📧 Email: {{3}}

💧 Bottle Size: {{4}}
📦 Quantity: {{5}}

🎨 Customization:
{{6}}

🆔 Enquiry ID: {{7}}

Please review and contact the customer.

*PRIME H₂O — I TRUST PRIME.*`;

export const WHATSAPP_TEMPLATE_PARAMS = [
  'customer_name',
  'customer_phone',
  'customer_email',
  'bottle_size',
  'quantity',
  'customization_details',
  'enquiry_id',
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const formatPhone = (e164) => {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164 || '');
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
};

/** Values for every {{variable}} used by the templates. */

export const formatDateTime = (ts) =>
  ts
    ? `${new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} IST`
    : '—';

/**
 * Values for every {{variable}} used by the templates.
 * `history` is the order_status_history row of the status change being announced.
 */
export function enquiryVariables(e, files = [], { history = null, adminUrl = '' } = {}) {
  const c = e.customization;
  const logo = files.find((f) => f.kind === 'logo');
  let customization = 'Not applicable (general enquiry)';
  let customizationSummary = 'Not applicable';
  if (c) {
    const layout = [c.layout, c.font && `${c.font} font`, c.textSize && `text size ${c.textSize}`, c.position && `text ${c.position}`]
      .filter(Boolean)
      .join(' · ');
    customization = [
      c.template && `Template: ${c.template}`,
      c.colour && `Label colour: ${c.colour}`,
      `Name on label: ${c.labelName || '—'}`,
      `Message / tagline: ${c.tagline || '—'}`,
      layout && `Layout: ${layout}`,
      `Logo / image: ${logo ? `uploaded (${logo.filename})` : 'none'}`,
      c.details && `Notes: ${c.details}`,
    ]
      .filter(Boolean)
      .join('\n');
    customizationSummary = [
      c.template,
      c.colour,
      c.labelName && `"${c.labelName}"`,
      c.tagline && `tagline "${c.tagline}"`,
      logo ? 'with logo' : 'no logo',
    ]
      .filter(Boolean)
      .join(', ');
  }
  const status = history?.to_status ?? e.order_status;
  return {
    customer_name: e.customer_name,
    customer_phone: formatPhone(e.customer_phone),
    customer_email: e.customer_email || 'Not provided',
    company_name: e.company_name || 'Not provided',
    enquiry_id: e.public_id,
    order_id: e.public_id,
    bottle_size: e.bottle_size || 'Not specified',
    quantity: e.quantity ? `${e.quantity.toLocaleString('en-IN')} bottles` : 'Not specified',
    customization_details: customization,
    customization_summary: customizationSummary,
    product_summary:
      e.quantity && e.bottle_size
        ? `${e.quantity.toLocaleString('en-IN')} × ${e.bottle_size} bottles with a custom label`
        : 'your custom-label bottles',
    delivery_date: e.delivery_date ? formatDate(e.delivery_date) : 'Flexible / not specified',
    customer_message: e.customer_message || '—',
    status_label: STATUS_LABEL[status] ?? '—',
    previous_status_label: history?.from_status ? STATUS_LABEL[history.from_status] : 'New order',
    changed_at: formatDateTime(history?.created_at ?? e.status_changed_at ?? e.created_at),
    actor: history?.actor_label ?? '—',
    note: history?.note || '',
    note_label: status === 'REJECTED' || status === 'CANCELLED' ? 'Reason' : 'Note to customer',
    whatsapp_updates: e.whatsapp_opt_in
      ? `Yes (${formatPhone(e.customer_whatsapp)})`
      : e.whatsapp_opt_out_at
        ? 'Opted out (replied STOP)'
        : 'Not opted in',
    whatsapp_also: e.whatsapp_opt_in ? ' and a WhatsApp message' : '',
    whatsapp_also_short: e.whatsapp_opt_in ? ' and WhatsApp' : '',
    admin_url: adminUrl || 'the /admin page of the PRIME H₂O website',
  };
}

const fill = (tpl, vars, transform = (v) => v) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Template variable {{${k}}} has no value`);
    return transform(String(vars[k]));
  });

/** Plain-text version: variables substituted, markdown markers removed. */
export function renderText(tpl, vars) {
  return fill(tpl, vars).replace(/\*\*/g, '');
}

/** HTML version in the PRIME H₂O brand frame. All enquiry data is HTML-escaped. */
export function renderHtml(tpl, vars, { preheader = '' } = {}) {
  const blocks = tpl.split(/\n\s*\n/);
  const inline = (line) =>
    fill(esc(line).replace(/\*\*(.+?)\*\*/g, '<strong style="color:#500D18">$1</strong>'), vars, (v) => esc(v).replace(/\n/g, '<br>'));
  const body = blocks
    .map((block) => {
      const lines = block.split('\n');
      const out = [];
      let list = [];
      const flushList = () => {
        if (list.length) {
          out.push(
            `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 18px;border:1px solid #E7D5C2;background:#FAF5EE">${list
              .map((li) => {
                const m = /^(.*?):\s(.*)$/s.exec(li);
                return m
                  ? `<tr><td style="padding:9px 14px;border-bottom:1px solid #EFE2D4;font-size:13px;color:#7a5d55;width:38%;vertical-align:top">${inline(m[1])}</td><td style="padding:9px 14px;border-bottom:1px solid #EFE2D4;font-size:14px;color:#3B241F;font-weight:600;vertical-align:top">${inline(m[2])}</td></tr>`
                  : `<tr><td colspan="2" style="padding:9px 14px;font-size:14px">${inline(li)}</td></tr>`;
              })
              .join('')}</table>`,
          );
          list = [];
        }
      };
      const para = [];
      const flushPara = () => {
        if (para.length) {
          const only = para.length === 1 && /^\*\*[^*]+\*\*$/.test(para[0]);
          out.push(
            only
              ? `<p style="margin:22px 0 8px;font-size:12px;letter-spacing:2.5px;font-weight:700;color:#500D18">${inline(para[0])}</p>`
              : `<p style="margin:0 0 16px">${para.map(inline).join('<br>')}</p>`,
          );
          para.length = 0;
        }
      };
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^- /.test(line)) {
          flushPara();
          list.push(line.slice(2));
        } else {
          flushList();
          para.push(line);
        }
      }
      flushPara();
      flushList();
      return out.join('');
    })
    .join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRIME H₂O</title></head>
<body style="margin:0;padding:0;background:#F8EFE5">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8EFE5;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FBF7F2;border:1px solid #E7D5C2">
<tr><td style="background:#500D18;padding:28px 32px;text-align:center;font-family:Arial,Helvetica,sans-serif">
<div style="font-size:26px;font-weight:800;letter-spacing:6px;color:#FBF7F2">PRIME H₂O</div>
<div style="font-size:11px;letter-spacing:4px;color:#C69A70;margin-top:6px">PACKAGED DRINKING WATER</div></td></tr>
<tr><td style="padding:32px 32px 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#49302B">${body}</td></tr>
<tr><td style="background:#3E0912;padding:14px 32px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#D4B08C">I TRUST PRIME.</td></tr>
</table></td></tr></table></body></html>`;
}


// ------------------------------------------------------------------ emails

const ASSISTANCE = `For immediate assistance:

**WhatsApp:** +91 81434 89222`;

const SIGN_OFF = `Thank you for trusting PRIME H₂O.

**I TRUST PRIME.**

PRIME H₂O
Packaged Drinking Water`;

/** Customer acknowledgement for a new order. Deliberately NOT a confirmation: the owner has not decided yet. */
export const CUSTOMER_ORDER_RECEIVED_TEMPLATE = `Dear {{customer_name}},

Thank you for choosing PRIME H₂O!

We have received your order request. **It is now awaiting confirmation from our team.** This email is an acknowledgement only; it is not an order confirmation.

**YOUR ORDER REQUEST**

- Order ID: {{order_id}}
- Status: Pending approval
- Bottle Size: {{bottle_size}}
- Quantity: {{quantity}}
- Preferred Delivery: {{delivery_date}}
- Customization: {{customization_details}}

**WHAT HAPPENS NEXT**

Our team will review your order request. You will then receive a separate email{{whatsapp_also}} with our decision on your order. Pricing, artwork and delivery will be confirmed with you directly.

Please quote your Order ID {{order_id}} in all communication.

${ASSISTANCE}

${SIGN_OFF}`;

const ownerNewOrderTemplate = (attached) => `A new custom bottle order request has been submitted through the PRIME H₂O website. **It is waiting for your approval.** The customer has only been told that the request was received and is awaiting confirmation.

**CUSTOMER DETAILS**
- Name: {{customer_name}}
- Phone: {{customer_phone}}
- Email: {{customer_email}}
- Company: {{company_name}}
- WhatsApp updates: {{whatsapp_updates}}

**ORDER REQUIREMENTS**
- Order ID: {{order_id}}
- Status: Pending approval
- Bottle Size: {{bottle_size}}
- Quantity: {{quantity}}
- Customization: {{customization_details}}
- Preferred Delivery: {{delivery_date}}

**DELIVERY / ADDITIONAL INSTRUCTIONS**

{{customer_message}}

**ACTION REQUIRED:** Review this order, then accept or reject it in the admin dashboard: {{admin_url}}
${attached ? '\nThe uploaded logo and label preview are attached to this email.\n' : ''}
PRIME H₂O — I Trust PRIME.`;

const ownerStatusTemplate = (hasNote) => `Order {{order_id}} for {{customer_name}} is now **{{status_label}}**.

**ORDER UPDATE**
- Order ID: {{order_id}}
- New Status: {{status_label}}
- Previous Status: {{previous_status_label}}
- Changed By: {{actor}}
- Changed At: {{changed_at}}${hasNote ? '\n- {{note_label}}: {{note}}' : ''}

**ORDER SUMMARY**
- Customer: {{customer_name}}
- Phone: {{customer_phone}}
- Email: {{customer_email}}
- WhatsApp updates: {{whatsapp_updates}}
- Bottle Size: {{bottle_size}}
- Quantity: {{quantity}}
- Preferred Delivery: {{delivery_date}}

The customer's email{{whatsapp_also_short}} notification for this change has been queued. The delivery status of every notification is shown in the admin dashboard: {{admin_url}}

PRIME H₂O — I Trust PRIME.`;

/** Customer emails for each status change made by the owner. */
export const CUSTOMER_UPDATES = {
  order_accepted: {
    subject: 'Your PRIME H₂O order {{order_id}} is confirmed',
    preheader: 'Your order has been reviewed and confirmed by our team.',
    intro: 'Good news! Your PRIME H₂O order has been reviewed and **confirmed** by our team.',
    heading: 'CONFIRMED ORDER DETAILS',
    rows: ['- Status: Confirmed', '- Confirmed On: {{changed_at}}'],
    customization: true,
    noteHeading: 'NOTE FROM PRIME H₂O',
    next: `**NEXT STEPS**

- Artwork & pricing: Our team will contact you to finalise the label artwork, pricing and payment.
- Delivery: The delivery schedule will be agreed with you directly.
- Updates: You will receive email{{whatsapp_also_short}} updates when your order is being prepared, is ready for dispatch, is dispatched and is delivered.`,
  },
  order_rejected: {
    subject: 'Update on your PRIME H₂O order request {{order_id}}',
    preheader: 'We are unable to accept this order request.',
    intro: 'Thank you for your interest in PRIME H₂O. We have reviewed your order request and, unfortunately, **we are unable to accept it** at this time.',
    heading: 'YOUR ORDER REQUEST',
    rows: ['- Status: Not accepted'],
    noteHeading: 'REASON',
    next: 'If you would like to discuss alternatives or send us a revised request, simply reply to this email or message us on WhatsApp.',
    signOff: 'We hope to serve you in the future.',
  },
  order_processing: {
    subject: 'Your PRIME H₂O order {{order_id}} is being prepared',
    preheader: 'Your order is now being prepared.',
    intro: 'Your PRIME H₂O order is now **being prepared**.',
    rows: ['- Status: Processing'],
    noteHeading: 'UPDATE FROM PRIME H₂O',
    next: 'We will let you know as soon as your order is ready for dispatch.',
  },
  order_ready_for_dispatch: {
    subject: 'Your PRIME H₂O order {{order_id}} is ready for dispatch',
    preheader: 'Your order is ready for dispatch.',
    intro: 'Your PRIME H₂O order is **ready for dispatch**.',
    rows: ['- Status: Ready for dispatch'],
    noteHeading: 'UPDATE FROM PRIME H₂O',
    next: 'We will let you know once your order has been dispatched.',
  },
  order_dispatched: {
    subject: 'Your PRIME H₂O order {{order_id}} has been dispatched',
    preheader: 'Your order is on its way.',
    intro: 'Your PRIME H₂O order has been **dispatched**.',
    rows: ['- Status: Dispatched', '- Dispatched On: {{changed_at}}'],
    noteHeading: 'DISPATCH DETAILS',
    next: 'If you have any questions about the delivery, please message us on WhatsApp and quote your Order ID.',
  },
  order_delivered: {
    subject: 'Your PRIME H₂O order {{order_id}} has been delivered',
    preheader: 'Your order has been marked as delivered.',
    intro: 'Your PRIME H₂O order has been marked as **delivered**.',
    rows: ['- Status: Delivered', '- Delivered On: {{changed_at}}'],
    noteHeading: 'NOTE FROM PRIME H₂O',
    next: 'If anything is not right with your order, please message us on WhatsApp and quote your Order ID.',
  },
  order_cancelled: {
    subject: 'Your PRIME H₂O order {{order_id}} has been cancelled',
    preheader: 'Your order has been cancelled.',
    intro: 'Your PRIME H₂O order has been **cancelled**.',
    rows: ['- Status: Cancelled', '- Cancelled On: {{changed_at}}'],
    noteHeading: 'REASON',
    next: 'If you have any questions, simply reply to this email or message us on WhatsApp.',
  },
};

function customerUpdateTemplate(spec, hasNote) {
  const rows = [
    '- Order ID: {{order_id}}',
    ...spec.rows,
    '- Bottle Size: {{bottle_size}}',
    '- Quantity: {{quantity}}',
    '- Preferred Delivery: {{delivery_date}}',
    ...(spec.customization ? ['- Customization: {{customization_details}}'] : []),
  ];
  return [
    'Dear {{customer_name}},',
    spec.intro,
    `**${spec.heading ?? 'ORDER DETAILS'}**`,
    rows.join('\n'),
    ...(hasNote ? [`**${spec.noteHeading}**`, '{{note}}'] : []),
    spec.next,
    'Please quote your Order ID {{order_id}} in all communication.',
    ASSISTANCE,
    spec.signOff ? `${spec.signOff}\n\n**I TRUST PRIME.**\n\nPRIME H₂O\nPackaged Drinking Water` : SIGN_OFF,
  ].join('\n\n');
}

const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const message = (tpl, vars, subject, preheader) => ({
  subject: oneLine(subject),
  html: renderHtml(tpl, vars, { preheader }),
  text: renderText(tpl, vars),
});

export function customerEmail(enquiry, files) {
  const vars = enquiryVariables(enquiry, files);
  return message(CUSTOMER_EMAIL_TEMPLATE, vars, `Your PRIME H₂O enquiry ${enquiry.public_id} has been received`, `Enquiry ID ${enquiry.public_id}`);
}

export function businessEmail(enquiry, files) {
  const vars = enquiryVariables(enquiry, files);
  const what = enquiry.source === 'custom_bottle' ? 'Custom bottle order' : 'Website enquiry';
  const qty = enquiry.quantity ? ` × ${enquiry.quantity.toLocaleString('en-IN')}` : '';
  return message(
    BUSINESS_EMAIL_TEMPLATE,
    vars,
    `${what} ${enquiry.public_id}: ${enquiry.customer_name}${enquiry.bottle_size ? ` (${enquiry.bottle_size}${qty})` : ''}`,
    `${enquiry.customer_name} · ${vars.customer_phone}`,
  );
}

/**
 * The email for one (event, audience).
 * `history` is the status change being announced; `attached` says whether files are attached.
 */
export function buildEmail({ event, audience, enquiry, files = [], history = null, adminUrl = '', attached = false }) {
  if (event === 'enquiry_received') return audience === 'customer' ? customerEmail(enquiry, files) : businessEmail(enquiry, files);
  const vars = enquiryVariables(enquiry, files, { history, adminUrl });
  const id = enquiry.public_id;
  if (event === 'order_received') {
    if (audience === 'customer') {
      return message(
        CUSTOMER_ORDER_RECEIVED_TEMPLATE,
        vars,
        `We've received your PRIME H₂O order request ${id} (awaiting confirmation)`,
        `Order ${id} is awaiting confirmation. This is not an order confirmation yet.`,
      );
    }
    return message(
      ownerNewOrderTemplate(attached),
      vars,
      `New order ${id} awaiting your approval: ${enquiry.customer_name} (${enquiry.bottle_size} × ${enquiry.quantity?.toLocaleString('en-IN')})`,
      `${enquiry.customer_name} · ${vars.customer_phone} · ${vars.quantity}`,
    );
  }
  if (audience === 'owner') {
    return message(ownerStatusTemplate(!!vars.note), vars, `Order ${id} is now ${vars.status_label}: ${enquiry.customer_name}`, `${vars.status_label} by ${vars.actor}`);
  }
  const spec = CUSTOMER_UPDATES[event];
  if (!spec) throw new Error(`No customer email defined for ${event}`);
  return message(customerUpdateTemplate(spec, !!vars.note), vars, renderText(spec.subject, vars), spec.preheader);
}

// ------------------------------------------------------------------ WhatsApp templates
// Business-initiated WhatsApp messages must use templates approved by Meta. Register each one
// in WhatsApp Manager (category UTILITY, language WHATSAPP_TEMPLATE_LANGUAGE) with exactly this
// body, or submit them all with `npm run whatsapp:templates -- --create`.
// {{1}}, {{2}}… are filled, in order, with the variables named in `params`.

const HELP = 'For help, WhatsApp us at +91 81434 89222.';

export const WHATSAPP_TEMPLATES = {
  prime_new_enquiry: {
    audience: 'owner',
    purpose: 'Owner: new website enquiry (Contact form)',
    body: WHATSAPP_TEMPLATE_BODY,
    params: WHATSAPP_TEMPLATE_PARAMS,
  },
  prime_new_order: {
    audience: 'owner',
    purpose: 'Owner: new order awaiting approval',
    body: `🔔 *NEW PRIME H₂O ORDER REQUEST*

Order {{1}} is waiting for your approval.

👤 Customer: {{2}}
📞 Phone: {{3}}
📧 Email: {{4}}
💬 WhatsApp updates: {{5}}

💧 Bottle Size: {{6}}
📦 Quantity: {{7}}
🗓️ Delivery: {{8}}

🎨 Label: {{9}}

Please review the order and accept or reject it in the PRIME H₂O admin dashboard.

*PRIME H₂O — I TRUST PRIME.*`,
    params: ['order_id', 'customer_name', 'customer_phone', 'customer_email', 'whatsapp_updates', 'bottle_size', 'quantity', 'delivery_date', 'customization_summary'],
  },
  prime_order_update_owner: {
    audience: 'owner',
    purpose: 'Owner: order status changed (accepted, rejected, processing, ready, dispatched, delivered, cancelled)',
    body: `📋 *PRIME H₂O ORDER UPDATE*

Order {{1}} for {{2}} is now *{{3}}*.

Changed by: {{4}}
Note: {{5}}

The delivery status of the customer's notifications is shown in the admin dashboard.

*PRIME H₂O — I TRUST PRIME.*`,
    params: ['order_id', 'customer_name', 'status_label', 'actor', 'note_or_none'],
  },
  prime_order_received: {
    audience: 'customer',
    purpose: 'Customer: order request received, awaiting confirmation',
    body: `Hello {{1}}, thank you for choosing PRIME H₂O.

We have received your order request {{2}} for {{3}}.

Your order is *awaiting confirmation* from our team. This is not an order confirmation yet. We will message you again once your order has been reviewed.

${HELP}`,
    params: ['customer_name', 'order_id', 'product_summary'],
  },
  prime_order_accepted: {
    audience: 'customer',
    purpose: 'Customer: order confirmed by the owner',
    body: `Hello {{1}}, good news! Your PRIME H₂O order {{2}} has been *confirmed*.

Order: {{3}}
Next steps: {{4}}

Please quote your order ID in all communication. ${HELP}`,
    params: ['customer_name', 'order_id', 'product_summary', 'next_steps'],
  },
  prime_order_rejected: {
    audience: 'customer',
    purpose: 'Customer: order request declined',
    body: `Hello {{1}}, thank you for your interest in PRIME H₂O.

We are sorry, but we are unable to accept your order request {{2}} at this time.

Reason: {{3}}

If you would like to discuss alternatives, please WhatsApp us at +91 81434 89222.`,
    params: ['customer_name', 'order_id', 'note'],
  },
  prime_order_processing: {
    audience: 'customer',
    purpose: 'Customer: order is being prepared',
    body: `Hello {{1}}, your PRIME H₂O order {{2}} is now being prepared.

Update from our team: {{3}}

We will message you when your order is ready for dispatch. ${HELP}`,
    params: ['customer_name', 'order_id', 'update_note'],
  },
  prime_order_ready: {
    audience: 'customer',
    purpose: 'Customer: order ready for dispatch',
    body: `Hello {{1}}, your PRIME H₂O order {{2}} is ready for dispatch.

Update from our team: {{3}}

We will message you again once it has been dispatched. ${HELP}`,
    params: ['customer_name', 'order_id', 'update_note'],
  },
  prime_order_dispatched: {
    audience: 'customer',
    purpose: 'Customer: order dispatched',
    body: `Hello {{1}}, your PRIME H₂O order {{2}} has been dispatched.

Dispatch details: {{3}}

${HELP}`,
    params: ['customer_name', 'order_id', 'update_note'],
  },
  prime_order_delivered: {
    audience: 'customer',
    purpose: 'Customer: order delivered',
    body: `Hello {{1}}, your PRIME H₂O order {{2}} has been marked as delivered.

Thank you for choosing PRIME H₂O. If anything is not right with your order, please WhatsApp us at +91 81434 89222.`,
    params: ['customer_name', 'order_id'],
  },
  prime_order_cancelled: {
    audience: 'customer',
    purpose: 'Customer: order cancelled',
    body: `Hello {{1}}, your PRIME H₂O order {{2}} has been cancelled.

Reason: {{3}}

If you have any questions, please WhatsApp us at +91 81434 89222.`,
    params: ['customer_name', 'order_id', 'note'],
  },
};

const CUSTOMER_WHATSAPP = {
  order_received: 'prime_order_received',
  order_accepted: 'prime_order_accepted',
  order_rejected: 'prime_order_rejected',
  order_processing: 'prime_order_processing',
  order_ready_for_dispatch: 'prime_order_ready',
  order_dispatched: 'prime_order_dispatched',
  order_delivered: 'prime_order_delivered',
  order_cancelled: 'prime_order_cancelled',
};

const UPDATE_NOTE_DEFAULT = {
  order_processing: 'Production of your order has started.',
  order_ready_for_dispatch: 'Your order has been prepared and is ready to leave our facility.',
  order_dispatched: 'Our team will contact you if any delivery details are needed.',
};

/** Which approved template carries a given (event, audience). */
export function whatsappTemplateFor(event, audience) {
  if (audience === 'owner') {
    if (event === 'enquiry_received') return 'prime_new_enquiry';
    return event === 'order_received' ? 'prime_new_order' : 'prime_order_update_owner';
  }
  return CUSTOMER_WHATSAPP[event] ?? null;
}

const PARAM_MAX = { customization_summary: 200 };

/** Meta template parameters: no newlines/tabs, no runs of >4 spaces, never empty, bounded length. */
export function whatsappParams(keys, vars) {
  return keys.map((k) => {
    const max = PARAM_MAX[k] ?? 300;
    let v = String(vars[k] ?? '')
      .replace(/\s*[\r\n]+\s*/g, ' | ')
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    if (v.length > max) v = `${v.slice(0, max - 3)}...`;
    return v || '—';
  });
}

/** Template name + parameters for one (event, audience). */
export function buildWhatsApp({ event, audience, enquiry, files = [], history = null }) {
  const template = whatsappTemplateFor(event, audience);
  const t = WHATSAPP_TEMPLATES[template];
  if (!t) throw new Error(`No WhatsApp template defined for ${audience} ${event}`);
  const vars = enquiryVariables(enquiry, files, { history });
  const extra = {
    note_or_none: vars.note || 'None',
    next_steps: vars.note || 'Our team will contact you to finalise the label artwork, pricing, payment and delivery schedule.',
    update_note: vars.note || UPDATE_NOTE_DEFAULT[event] || 'None',
  };
  return { template, params: whatsappParams(t.params, { ...vars, ...extra }) };
}

// Sample data used for template examples (Meta requires an example value for every variable).
const SAMPLE_ORDER = {
  public_id: 'PRM-261107-7KQ3XA',
  source: 'custom_bottle',
  order_status: 'PENDING',
  customer_name: 'Ravi Kumar',
  customer_phone: '+919876543210',
  customer_email: 'ravi@example.com',
  company_name: 'Acme Technologies',
  bottle_size: '500 mL',
  quantity: 500,
  delivery_date: '2026-12-12',
  customer_message: 'Deliver to the main gate.',
  customization: { template: 'Corporate Branding', colour: 'Burgundy (#500D18)', labelName: 'Acme', tagline: 'Annual Summit 2026' },
  whatsapp_opt_in: true,
  customer_whatsapp: '+919876543210',
  created_at: '2026-11-07T10:30:00Z',
};
const SAMPLE_FOR = {
  prime_new_enquiry: ['enquiry_received', 'owner', null, null],
  prime_new_order: ['order_received', 'owner', 'PENDING', null],
  prime_order_update_owner: ['order_accepted', 'owner', 'ACCEPTED', 'Artwork proof will be shared tomorrow.'],
  prime_order_received: ['order_received', 'customer', 'PENDING', null],
  prime_order_accepted: ['order_accepted', 'customer', 'ACCEPTED', 'We will share the artwork proof with you tomorrow.'],
  prime_order_rejected: ['order_rejected', 'customer', 'REJECTED', 'We cannot meet the requested delivery date.'],
  prime_order_processing: ['order_processing', 'customer', 'PROCESSING', null],
  prime_order_ready: ['order_ready_for_dispatch', 'customer', 'READY_FOR_DISPATCH', null],
  prime_order_dispatched: ['order_dispatched', 'customer', 'DISPATCHED', 'Vehicle TS09 AB 1234, driver Suresh (98765 00000).'],
  prime_order_delivered: ['order_delivered', 'customer', 'DELIVERED', null],
  prime_order_cancelled: ['order_cancelled', 'customer', 'CANCELLED', 'Cancelled at your request.'],
};

/** Example parameter values for a template (used when submitting it to Meta for approval). */
export function whatsappTemplateExample(name) {
  const [event, audience, status, note] = SAMPLE_FOR[name];
  const enquiry = event === 'enquiry_received' ? { ...SAMPLE_ORDER, source: 'contact', order_status: null, customization: null, bottle_size: 'All Sizes', quantity: null } : { ...SAMPLE_ORDER, order_status: status };
  const history = status ? { to_status: status, from_status: status === 'PENDING' ? null : 'PENDING', note, actor_label: 'Owner', created_at: SAMPLE_ORDER.created_at } : null;
  return buildWhatsApp({ event, audience, enquiry, files: [{ kind: 'logo', filename: 'acme-logo.png' }], history }).params;
}
