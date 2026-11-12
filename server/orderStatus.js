// Order lifecycle. Every order starts PENDING and only an authenticated administrator can
// move it on. A status is reached at most once (enforced again in the database), so an
// order can never be approved twice or notify anyone twice for the same event.

/** Record types that are orders (with a status lifecycle). 'contact' enquiries are not orders. */
export const ORDER_SOURCES = ['custom_bottle', 'product_order'];
export const isOrderSource = (source) => ORDER_SOURCES.includes(source);

export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'PROCESSING',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
];

export const STATUS_LABEL = {
  PENDING: 'Pending approval',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  PROCESSING: 'Processing',
  READY_FOR_DISPATCH: 'Ready for dispatch',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Allowed next statuses. Anything else is refused. */
export const TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_FOR_DISPATCH', 'CANCELLED'],
  READY_FOR_DISPATCH: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  REJECTED: [],
  DELIVERED: [],
  CANCELLED: [],
};

export const ACTION_LABEL = {
  ACCEPTED: 'Accept order',
  REJECTED: 'Reject order',
  PROCESSING: 'Start processing',
  READY_FOR_DISPATCH: 'Mark ready for dispatch',
  DISPATCHED: 'Mark dispatched',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel order',
};

/** These transitions must carry a reason, which is shown to the customer. */
export const REASON_REQUIRED = new Set(['REJECTED', 'CANCELLED']);

/** Statuses that exist only after the owner accepted the order. */
export const POST_ACCEPTANCE = new Set(['ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED']);

export const EVENT_FOR_STATUS = {
  PENDING: 'order_received',
  ACCEPTED: 'order_accepted',
  REJECTED: 'order_rejected',
  PROCESSING: 'order_processing',
  READY_FOR_DISPATCH: 'order_ready_for_dispatch',
  DISPATCHED: 'order_dispatched',
  DELIVERED: 'order_delivered',
  CANCELLED: 'order_cancelled',
};
export const STATUS_FOR_EVENT = Object.fromEntries(Object.entries(EVENT_FOR_STATUS).map(([s, e]) => [e, s]));

/** All notification events: website enquiries (Contact form) plus every order status. */
export const EVENTS = ['enquiry_received', ...Object.values(EVENT_FOR_STATUS)];

export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

export const allowedTransitions = (status) =>
  (TRANSITIONS[status] ?? []).map((to) => ({ to, label: ACTION_LABEL[to], reasonRequired: REASON_REQUIRED.has(to) }));
