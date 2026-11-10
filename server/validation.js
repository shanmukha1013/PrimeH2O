import crypto from 'node:crypto';

export class ValidationError extends Error {
  constructor(fields, message = 'Please correct the highlighted fields.') {
    super(message);
    this.fields = fields;
  }
}

export const BOTTLE_SIZES = ['250 mL', '500 mL', '1000 mL'];
const CONTACT_SIZES = [...BOTTLE_SIZES, 'All Sizes', 'Distribution'];
const LABEL_TEMPLATES = [
  'Corporate Branding',
  'Personal Branding',
  'Wedding & Celebrations',
  'Birthday Events',
  'Promotional & Marketing',
];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 6 * 1024 * 1024;

// Shown next to the opt-in checkbox on the website (src/components/LabelStudio.tsx) and stored
// with every order that opted in, as the record of what the customer agreed to.
export const WHATSAPP_CONSENT_TEXT =
  'Send me updates about this order on WhatsApp. I agree that PRIME H₂O may message me on WhatsApp about this order ' +
  '(received, confirmed or declined, processing, dispatch and delivery). I can reply STOP at any time to opt out.';

/** WhatsApp needs a mobile number: for India, 10 digits starting 6-9. */
export const isWhatsAppNumber = (e164) => !!e164 && (e164.startsWith('+91') ? /^\+91[6-9]\d{9}$/.test(e164) : /^\+[1-9]\d{7,14}$/.test(e164));

/** Normalises Indian / international numbers to E.164 (+91XXXXXXXXXX). Returns null when invalid. */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\+?[0-9\s\-().]{7,22}$/.test(s)) return null;
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) {
    if (digits.startsWith('91')) return digits.length === 12 && /^[1-9]/.test(digits[2]) ? `+${digits}` : null;
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? `+${digits}` : null;
  }
  if (digits.startsWith('0091')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('91') && /^[1-9]/.test(digits[2])) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0') && /^[1-9]/.test(digits[1])) return `+91${digits.slice(1)}`; // trunk prefix / STD code
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`; // mobile
  return null;
}

/** Returns a trimmed address with a lower-cased domain, or null when invalid. */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  const [local, domain] = [s.slice(0, s.lastIndexOf('@')), s.slice(s.lastIndexOf('@') + 1)];
  if (!local || local.length > 64 || local.includes('@') || /\.\./.test(s) || /^[.-]|[.-]$/.test(domain)) return null;
  if (!/^[a-z0-9.-]+$/i.test(domain)) return null;
  return `${local}@${domain.toLowerCase()}`;
}

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

function sniffImage(buf, type) {
  const hex = buf.subarray(0, 12).toString('hex');
  switch (type) {
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/gif':
      return hex.startsWith('47494638');
    case 'image/webp':
      return hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'image/svg+xml':
      return /<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8'));
    default:
      return false;
  }
}

function decodeFile(input, { kind, maxBytes, allowedTypes, errors }) {
  if (input == null) return null;
  if (typeof input !== 'object' || typeof input.data !== 'string') {
    errors[kind] = `The ${kind} upload is invalid.`;
    return null;
  }
  const contentType = String(input.contentType || '').toLowerCase();
  if (!allowedTypes.includes(contentType)) {
    errors[kind] = `The ${kind} must be a PNG, JPG, WEBP, GIF or SVG image.`;
    return null;
  }
  const b64 = input.data.replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) {
    errors[kind] = `The ${kind} upload is corrupted.`;
    return null;
  }
  const data = Buffer.from(b64, 'base64');
  if (!data.length || data.length > maxBytes) {
    errors[kind] = `The ${kind} must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
    return null;
  }
  if (!sniffImage(data, contentType)) {
    errors[kind] = `The ${kind} file does not look like a valid image.`;
    return null;
  }
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[contentType];
  const base = String(input.filename || kind)
    .replace(/\.[^.]*$/, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .slice(0, 60) || kind;
  return { kind, filename: `${base}.${ext}`, contentType, data };
}

/**
 * Validates and normalises a website enquiry.
 * Throws ValidationError({ field: message }) when anything is wrong.
 */
export function validateEnquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError({ form: 'Invalid request.' });
  const errors = {};
  const text = (key, label, { required = false, max = 200 } = {}) => {
    const raw = body[key];
    if (raw != null && typeof raw !== 'string') {
      errors[key] = `${label} is invalid.`;
      return null;
    }
    const v = (raw ?? '').replace(/\u0000/g, '').trim();
    if (required && !v) errors[key] = `Please enter ${label.toLowerCase()}.`;
    else if (v.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
    return v || null;
  };

  const source = body.source;
  if (source !== 'contact' && source !== 'custom_bottle') errors.source = 'Unknown enquiry type.';
  const isCustom = source === 'custom_bottle';

  let clientRequestId = null;
  if (body.clientRequestId != null) {
    if (typeof body.clientRequestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientRequestId)) {
      clientRequestId = body.clientRequestId.toLowerCase();
    } else errors.clientRequestId = 'Invalid request id.';
  }

  const name = text('name', 'Your name', { required: true, max: 100 });
  if (name && name.length < 2) errors.name = 'Please enter your full name.';

  const phoneRaw = text('phone', 'Phone number', { required: true, max: 25 });
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) errors.phone = 'Please enter a valid phone number (e.g. 98765 43210 or +91 98765 43210).';

  // orders need an email: the owner's decision and every status update is sent there
  const emailRaw = text('email', 'Email address', { required: true, max: 254 });
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (emailRaw && !email) errors.email = 'Please enter a valid email address.';

  const company = text('company', 'Company name', { max: 120 });

  // WhatsApp updates only with explicit opt-in (orders only); defaults to the phone number
  let whatsappOptIn = false;
  let whatsapp = null;
  if (body.whatsappOptIn != null && typeof body.whatsappOptIn !== 'boolean') errors.whatsappOptIn = 'Invalid WhatsApp preference.';
  else if (isCustom && body.whatsappOptIn === true) {
    whatsappOptIn = true;
    const waRaw = text('whatsapp', 'WhatsApp number', { max: 25 });
    if (waRaw) {
      whatsapp = normalizePhone(waRaw);
      if (!isWhatsAppNumber(whatsapp)) errors.whatsapp = 'Please enter a valid WhatsApp mobile number (e.g. 98765 43210).';
    } else if (phone) {
      whatsapp = phone;
      if (!isWhatsAppNumber(whatsapp)) errors.whatsapp = 'Your phone number is not a mobile number. Please enter your WhatsApp number.';
    }
  }

  const bottleSize = text('bottleSize', 'Bottle size', { required: isCustom, max: 40 });
  if (bottleSize && !(isCustom ? BOTTLE_SIZES : CONTACT_SIZES).includes(bottleSize)) errors.bottleSize = 'Please choose a valid bottle size.';

  let quantity = null;
  if (body.quantity != null && body.quantity !== '') {
    const q = typeof body.quantity === 'number' ? body.quantity : /^\s*\d+\s*$/.test(String(body.quantity)) ? Number(body.quantity) : NaN;
    if (!Number.isInteger(q) || q < 1 || q > 10_000_000) errors.quantity = 'Please enter a whole number of bottles (1 or more).';
    else quantity = q;
  } else if (isCustom) errors.quantity = 'Please enter the number of bottles you need.';

  let deliveryDate = null;
  if (body.deliveryDate) {
    const d = String(body.deliveryDate);
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
    if (!valid) errors.deliveryDate = 'Please choose a valid date.';
    else if (d < istToday()) errors.deliveryDate = 'Please choose a date from today onwards.';
    else deliveryDate = d;
  }

  const message = text('message', isCustom ? 'Additional instructions' : 'Enquiry message', { required: !isCustom, max: 2000 });

  let customization = null;
  if (isCustom) {
    const c = body.customization;
    if (!c || typeof c !== 'object' || Array.isArray(c)) errors.customization = 'Label customisation details are missing.';
    else {
      const field = (k, max, required = false) => {
        const v = typeof c[k] === 'string' ? c[k].replace(/\u0000/g, '').trim() : '';
        if (required && !v) errors[`customization.${k}`] = 'Please enter the name or brand to print on the label.';
        if (v.length > max) errors[`customization.${k}`] = `Must be ${max} characters or fewer.`;
        return v;
      };
      customization = {
        template: field('template', 60),
        colour: field('colour', 60),
        labelName: field('labelName', 40, true),
        tagline: field('tagline', 80),
        layout: field('layout', 60),
        font: field('font', 40),
        textSize: field('textSize', 10),
        position: field('position', 20),
        details: field('details', 2000),
      };
      if (customization.template && !LABEL_TEMPLATES.includes(customization.template)) errors['customization.template'] = 'Unknown label template.';
    }
  }

  const files = [];
  const logo = decodeFile(body.logo, { kind: 'logo', maxBytes: MAX_LOGO_BYTES, allowedTypes: IMAGE_TYPES, errors });
  if (logo) files.push(logo);
  const preview = decodeFile(body.preview, { kind: 'preview', maxBytes: MAX_PREVIEW_BYTES, allowedTypes: ['image/png'], errors });
  if (preview) files.push(preview);
  if (!isCustom && files.length) errors.logo = 'Files can only be attached to custom bottle enquiries.';

  if (Object.keys(errors).length) throw new ValidationError(errors);

  const value = {
    source,
    clientRequestId,
    name,
    phone,
    email,
    company,
    bottleSize,
    quantity,
    deliveryDate,
    message,
    customization,
    files,
    whatsappOptIn,
    whatsapp: whatsappOptIn ? whatsapp : null,
    whatsappConsentText: whatsappOptIn ? WHATSAPP_CONSENT_TEXT : null,
  };
  value.contentHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        source,
        name.toLowerCase(),
        phone,
        email?.toLowerCase() ?? null,
        company,
        bottleSize,
        quantity,
        deliveryDate,
        message,
        customization,
        whatsappOptIn ? whatsapp : null,
        files.map((f) => [f.kind, crypto.createHash('sha256').update(f.data).digest('hex')]),
      ]),
    )
    .digest('hex');
  return value;
}
