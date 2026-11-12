// Shared constants and helpers for the online order form (src/components/ProductOrder.tsx).
// The server re-validates everything (server/validation.js validateProductOrder) and applies the
// configured prices itself; nothing here is trusted for pricing.

/** Largest number of bottles of one size per online order. Must match MAX_LINE_QUANTITY in server/validation.js. */
export const MAX_LINE_QUANTITY = 100_000;

/** States and union territories of India. Must match INDIAN_STATES in server/validation.js. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

/** PRIME H₂O is based in Hyderabad, Telangana, so the form starts there; customers can change it. */
export const DEFAULT_STATE = 'Telangana';

/** ₹1,234.50 with Indian digit grouping. */
export const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatBottles = (n: number) => `${n.toLocaleString('en-IN')} bottle${n === 1 ? '' : 's'}`;

/** +91 98765 43210 */
export const formatPhone = (e164: string | null | undefined) => {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164 ?? '');
  return m ? `+91 ${m[1]} ${m[2]}` : (e164 ?? '');
};

/**
 * Client-side check that mirrors the server: an Indian mobile number (10 digits starting 6-9,
 * optionally with +91 / 0 prefixes) or an international number with a + prefix.
 */
export function isMobileNumber(raw: string): boolean {
  const s = raw.trim();
  if (!/^\+?[0-9\s\-().]{7,22}$/.test(s)) return false;
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) {
    if (digits.startsWith('91')) return /^91[6-9]\d{9}$/.test(digits);
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0');
  }
  if (digits.startsWith('0091')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('91')) return /^91[6-9]\d{9}$/.test(digits);
  if (digits.length === 11 && digits.startsWith('0')) return /^0[6-9]\d{9}$/.test(digits);
  return /^[6-9]\d{9}$/.test(digits);
}

export const isPinCode = (raw: string) => /^[1-9][0-9]{5}$/.test(raw.replace(/\s/g, ''));
