/// <reference types="vite/client" />
// Client for the PRIME H₂O enquiry API (server/). Same origin by default;
// set VITE_API_BASE when the API is hosted on a different domain.

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export type EmailStatus = 'accepted' | 'delivered' | 'sending' | 'failed' | 'test_mode' | 'not_sent';

export interface EnquiryResult {
  enquiryId: string;
  /** Set for custom bottle orders (same value as enquiryId). */
  orderId?: string;
  duplicate: boolean;
  /** 'PENDING' for custom bottle orders: they always wait for the owner's approval. */
  orderStatus: string | null;
  customerEmail: { status: EmailStatus; to: string } | null;
  customerWhatsApp: { status: EmailStatus; to: string } | null;
  teamNotified: boolean;
}

/** Shown next to the WhatsApp opt-in checkbox. Must match WHATSAPP_CONSENT_TEXT in server/validation.js. */
export const WHATSAPP_CONSENT_TEXT =
  'Send me updates about this order on WhatsApp. I agree that PRIME H₂O may message me on WhatsApp about this order ' +
  '(received, confirmed or declined, processing, dispatch and delivery). I can reply STOP at any time to opt out.';

export class EnquiryError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.fields = fields;
  }
}

/** Idempotency key: retries of the same submission never create a second enquiry. */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Contact form → POST /api/enquiries. */
export function submitEnquiry(payload: Record<string, unknown>): Promise<EnquiryResult> {
  return post('/api/enquiries', payload);
}

/** Custom bottle order form → POST /api/orders. The order is saved as PENDING until the owner approves it. */
export function submitOrder(payload: Record<string, unknown>): Promise<EnquiryResult> {
  return post('/api/orders', payload);
}

// ------------------------------------------------------------------ online product orders

/** A size customers can order. unitPricePaise is null until PRIME H₂O configures a price. */
export interface CatalogueProduct {
  code: string;
  name: string;
  size: string;
  unitPricePaise: number | null;
}

/** GET /api/products: the sizes on sale and their configured prices (per bottle). */
export async function fetchProducts(): Promise<CatalogueProduct[]> {
  const res = await fetch(`${API_BASE}/api/products`, { headers: { accept: 'application/json' } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data?.products)) throw new Error('Online ordering is not available right now.');
  return data.products as CatalogueProduct[];
}

/** The saved order exactly as stored by the server (server-side prices). */
export interface PlacedOrder {
  createdAt: string;
  items: { code: string; name: string; size: string; quantity: number; unitPricePaise: number | null; lineTotalPaise: number | null }[];
  totalPaise: number | null;
  customer: { name: string; phone: string; whatsapp: string | null; email: string | null };
  delivery: { address: string; city: string; state: string; pinCode: string };
  instructions: string | null;
  whatsappOptIn: boolean;
}

export interface ProductOrderResult extends EnquiryResult {
  order: PlacedOrder | null;
}

/** Online order form → POST /api/product-orders. Saved as PENDING until PRIME H₂O confirms it. */
export function submitProductOrder(payload: Record<string, unknown>): Promise<ProductOrderResult> {
  return post<ProductOrderResult>('/api/product-orders', payload);
}

async function post<T extends EnquiryResult = EnquiryResult>(path: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new EnquiryError("We couldn't reach our server. Please check your connection and try again, or message us on WhatsApp.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.enquiryId) {
    throw new EnquiryError(data?.error ?? 'Something went wrong while sending your enquiry. Please try again.', data?.fields ?? {});
  }
  return data as T;
}

/**
 * Honest wording for the acknowledgement email. Never claims delivery the provider hasn't
 * confirmed, and never calls an order request "confirmed".
 */
export function emailStatusText(email: EnquiryResult['customerEmail'], kind: 'enquiry' | 'order' = 'enquiry'): string {
  if (!email) return '';
  const what = kind === 'order' ? 'An email acknowledging your order request' : 'A confirmation email';
  switch (email.status) {
    case 'accepted':
    case 'delivered':
      return `${what} is on its way to ${email.to}.`;
    case 'sending':
      return `We're sending an email to ${email.to}.`;
    case 'failed':
      return `We couldn't send an email to ${email.to}, but your ${kind === 'order' ? 'order request' : 'enquiry'} has been saved.`;
    case 'test_mode':
      return 'Test mode: no email was actually sent.';
    default:
      return '';
  }
}

/** Only mentions WhatsApp when Meta has actually accepted the message. */
export function whatsAppStatusText(wa: EnquiryResult['customerWhatsApp']): string {
  if (!wa) return '';
  if (wa.status === 'accepted' || wa.status === 'delivered') return `A WhatsApp message is on its way to ${wa.to}.`;
  if (wa.status === 'sending') return `We're sending a WhatsApp message to ${wa.to}.`;
  return '';
}
