// Client for the admin API (server/app.js, /api/admin/*). Same origin only: the session is an
// HttpOnly SameSite=Strict cookie, and every request carries the X-Prime-Admin header (CSRF guard).

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'READY_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

export type NotificationStatus =
  | 'pending'
  | 'sending'
  | 'retrying'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'bounced'
  | 'skipped';

export interface Admin {
  name: string;
  email: string;
  /** admin: can change orders; viewer: read-only */
  role: 'admin' | 'viewer';
}

export interface ListItem {
  public_id: string;
  source: 'contact' | 'custom_bottle';
  order_status: OrderStatus | null;
  customer_name: string;
  company_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  bottle_size: string | null;
  quantity: number | null;
  delivery_date: string | null;
  created_at: string;
  status_changed_at: string | null;
  whatsapp_opt_in: boolean;
  failed_notifications: number;
  pending_notifications: number;
  skipped_notifications: number;
  sent_notifications: number;
}

export type Counts = Record<OrderStatus | 'ENQUIRY' | 'ALL_ORDERS', number>;

export interface Notification {
  id: number;
  event: string;
  audience: 'owner' | 'customer';
  channel: 'email' | 'whatsapp';
  provider: string;
  recipient: string;
  status: NotificationStatus;
  test_mode: boolean;
  attempts: number;
  next_attempt_at: string;
  provider_message_id: string | null;
  template_name: string | null;
  last_error: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  event_at: string | null;
}

export interface ProviderEvent {
  notification_id: number;
  provider: string;
  event: string;
  occurred_at: string | null;
  detail: string | null;
  received_at: string;
}

export interface HistoryEntry {
  id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  actor_label: string;
  actor_email: string | null;
  created_at: string;
}

export interface Detail {
  public_id: string;
  source: 'contact' | 'custom_bottle';
  order_status: OrderStatus | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  company_name: string | null;
  bottle_size: string | null;
  quantity: number | null;
  delivery_date: string | null;
  customer_message: string | null;
  customization: Record<string, string> | null;
  customer_whatsapp: string | null;
  whatsapp_opt_in: boolean;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_in_text: string | null;
  whatsapp_opt_out_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  status_changed_at: string | null;
  files: { kind: 'logo' | 'preview'; filename: string; content_type: string; size_bytes: number }[];
  notifications: Notification[];
  events: ProviderEvent[];
  history: HistoryEntry[];
  allowedTransitions: { to: OrderStatus; label: string; reasonRequired: boolean }[];
}

export interface SystemInfo {
  email: { configured: boolean; missing: string[]; sandbox: boolean; sender: string | null; ownerAddress: string };
  whatsapp: { configured: boolean; missing: string[]; ownerNumber: string; statusTracking: boolean };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Prime-Admin': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  me: () => call<{ admin: Admin }>('GET', '/api/admin/me'),
  login: (email: string, password: string) => call<{ admin: Admin }>('POST', '/api/admin/login', { email, password }),
  logout: () => call<{ ok: true }>('POST', '/api/admin/logout', {}),
  system: () => call<SystemInfo>('GET', '/api/admin/system'),
  list: (params: { type: 'order' | 'enquiry' | 'all'; status?: OrderStatus | null; q?: string }) => {
    const qs = new URLSearchParams({ type: params.type });
    if (params.status) qs.set('status', params.status);
    if (params.q) qs.set('q', params.q);
    return call<{ items: ListItem[]; counts: Counts }>('GET', `/api/admin/enquiries?${qs}`);
  },
  detail: (id: string) => call<Detail>('GET', `/api/admin/enquiries/${encodeURIComponent(id)}`),
  setStatus: (id: string, to: OrderStatus, expectedFrom: OrderStatus, note: string) =>
    call<Detail>('POST', `/api/admin/enquiries/${encodeURIComponent(id)}/status`, { to, expectedFrom, note }),
  retry: (notificationId: number) => call<{ requeued: number }>('POST', `/api/admin/notifications/${notificationId}/retry`, {}),
  fileUrl: (id: string, kind: string, download = false) =>
    `/api/admin/enquiries/${encodeURIComponent(id)}/files/${kind}${download ? '?download=1' : ''}`,
};
