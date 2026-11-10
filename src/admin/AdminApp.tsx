import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Ban,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleAlert,
  Clock,
  Download,
  ExternalLink,
  History,
  Inbox,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import {
  Admin,
  ApiError,
  Counts,
  Detail,
  HistoryEntry,
  ListItem,
  Notification,
  OrderStatus,
  ProviderEvent,
  SystemInfo,
  api,
} from './api';

// ------------------------------------------------------------------ labels & formatting

const STATUS_META: Record<OrderStatus, { label: string; badge: string; dot: string }> = {
  PENDING: { label: 'Pending approval', badge: 'bg-amber-100 text-amber-900 ring-amber-300', dot: 'bg-amber-500' },
  ACCEPTED: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-900 ring-emerald-300', dot: 'bg-emerald-600' },
  REJECTED: { label: 'Rejected', badge: 'bg-red-100 text-red-900 ring-red-300', dot: 'bg-red-600' },
  PROCESSING: { label: 'Processing', badge: 'bg-sky-100 text-sky-900 ring-sky-300', dot: 'bg-sky-600' },
  READY_FOR_DISPATCH: { label: 'Ready for dispatch', badge: 'bg-indigo-100 text-indigo-900 ring-indigo-300', dot: 'bg-indigo-600' },
  DISPATCHED: { label: 'Dispatched', badge: 'bg-violet-100 text-violet-900 ring-violet-300', dot: 'bg-violet-600' },
  DELIVERED: { label: 'Delivered', badge: 'bg-green-100 text-green-900 ring-green-400', dot: 'bg-green-700' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-stone-200 text-stone-800 ring-stone-300', dot: 'bg-stone-500' },
};

const EVENT_LABEL: Record<string, string> = {
  enquiry_received: 'New enquiry',
  order_received: 'New order request',
  order_accepted: 'Order accepted',
  order_rejected: 'Order rejected',
  order_processing: 'Processing started',
  order_ready_for_dispatch: 'Ready for dispatch',
  order_dispatched: 'Dispatched',
  order_delivered: 'Delivered',
  order_cancelled: 'Cancelled',
};

const ACTION_COPY: Record<OrderStatus, { effect: string; noteLabel: string; placeholder: string; danger?: boolean }> = {
  PENDING: { effect: '', noteLabel: '', placeholder: '' },
  ACCEPTED: {
    effect:
      'The order becomes Accepted and the acceptance time is recorded. The customer receives the official order confirmation with the order details and next steps.',
    noteLabel: 'Next steps / note for the customer (optional)',
    placeholder: 'e.g. We will share the artwork proof with you by tomorrow evening.',
  },
  REJECTED: {
    effect: 'The order becomes Rejected. This is final. The customer is told the request was not accepted, with your reason.',
    noteLabel: 'Reason (required, sent to the customer)',
    placeholder: 'e.g. We cannot meet the requested delivery date.',
    danger: true,
  },
  PROCESSING: {
    effect: 'The customer is told that their order is now being prepared.',
    noteLabel: 'Update for the customer (optional)',
    placeholder: 'e.g. Labels are being printed today.',
  },
  READY_FOR_DISPATCH: {
    effect: 'The customer is told that their order is ready for dispatch.',
    noteLabel: 'Update for the customer (optional)',
    placeholder: 'e.g. Your order will leave our facility tomorrow morning.',
  },
  DISPATCHED: {
    effect: 'The customer is told that their order has been dispatched.',
    noteLabel: 'Dispatch details for the customer (optional)',
    placeholder: 'e.g. Vehicle TS09 AB 1234, driver Suresh (98765 00000).',
  },
  DELIVERED: {
    effect: 'The customer is told that their order has been delivered. This completes the order.',
    noteLabel: 'Note for the customer (optional)',
    placeholder: 'e.g. Thank you for your order!',
  },
  CANCELLED: {
    effect:
      'The order becomes Cancelled. This is final. Messages still waiting to be sent about earlier steps are dropped. The customer is told the order was cancelled, with your reason.',
    noteLabel: 'Reason (required, sent to the customer)',
    placeholder: 'e.g. Cancelled at the customer’s request.',
    danger: true,
  },
};

interface Tab {
  key: string;
  label: string;
  type: 'order' | 'enquiry';
  status: OrderStatus | null;
  count: (c: Counts) => number;
}
const TABS: Tab[] = [
  ...(['PENDING', 'ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED', 'REJECTED', 'CANCELLED'] as OrderStatus[]).map(
    (s): Tab => ({
      key: s,
      label: s === 'PENDING' ? 'Pending' : s === 'READY_FOR_DISPATCH' ? 'Ready' : STATUS_META[s].label,
      type: 'order',
      status: s,
      count: (c) => c[s],
    }),
  ),
  { key: 'ALL', label: 'All orders', type: 'order', status: null, count: (c) => c.ALL_ORDERS },
  { key: 'ENQUIRY', label: 'Enquiries', type: 'enquiry', status: null, count: (c) => c.ENQUIRY },
];

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';
const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Flexible';
const fmtPhone = (e164: string | null) => {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164 ?? '');
  return m ? `+91 ${m[1]} ${m[2]}` : (e164 ?? '');
};
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const card = 'bg-brand-cream-pure border border-brand-cream-dark rounded-sm shadow-[0_1px_0_rgba(80,13,24,0.04)]';
const sectionTitle = 'text-[11px] uppercase tracking-[0.22em] font-bold text-brand-maroon';

const StatusBadge: React.FC<{ status: OrderStatus | null; large?: boolean }> = ({ status, large }) =>
  status ? (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 font-semibold whitespace-nowrap ${STATUS_META[status].badge} ${
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
      {STATUS_META[status].label}
    </span>
  ) : (
    <span className={`inline-flex items-center rounded-full ring-1 ring-brand-bronze/50 bg-brand-cream text-brand-brown font-semibold ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'}`}>
      Enquiry
    </span>
  );

// ------------------------------------------------------------------ app shell

export const AdminApp: React.FC = () => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center text-brand-maroon">
        <LoaderCircle className="w-7 h-7 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  return admin ? <Dashboard admin={admin} onSignedOut={() => setAdmin(null)} /> : <Login onLogin={setAdmin} />;
};

const Login: React.FC<{ onLogin: (a: Admin) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin((await api.login(email.trim(), password)).admin);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-cream-gradient">
      <form onSubmit={submit} className={`${card} w-full max-w-sm overflow-hidden`}>
        <div className="bg-maroon-gradient px-6 py-6 text-center">
          <div className="text-xl font-extrabold tracking-[0.35em] text-brand-cream">PRIME H₂O</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.3em] text-brand-bronze-light">Order administration</div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-bold uppercase tracking-[0.14em] text-brand-maroon">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-brand-cream-dark bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-bronze"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-xs font-bold uppercase tracking-[0.14em] text-brand-maroon">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-sm border border-brand-cream-dark bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-bronze"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-brand-maroon px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-brand-cream hover:bg-brand-maroon-rich disabled:opacity-70"
          >
            {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 text-brand-bronze" />}
            Sign in
          </button>
          <p className="text-xs text-brand-brown/60 text-center">Only PRIME H₂O administrators can sign in.</p>
        </div>
      </form>
    </div>
  );
};

const SystemBanner: React.FC<{ system: SystemInfo | null }> = ({ system }) => {
  if (!system) return null;
  const notes: { tone: 'warn' | 'bad'; text: string }[] = [];
  if (!system.email.configured) notes.push({ tone: 'bad', text: `Email is not configured (missing ${system.email.missing.join(', ')}). Emails are recorded as not sent.` });
  else if (system.email.sandbox)
    notes.push({ tone: 'warn', text: 'Email test mode (BREVO_SANDBOX=true): Brevo checks each email but does not deliver it. Customers receive nothing until test mode is turned off.' });
  if (!system.whatsapp.configured)
    notes.push({
      tone: 'bad',
      text: `WhatsApp is not connected (missing ${system.whatsapp.missing.join(', ')}). WhatsApp messages to you and to customers are recorded as not sent; you can retry them once it is connected.`,
    });
  else if (!system.whatsapp.statusTracking) notes.push({ tone: 'warn', text: 'WhatsApp delivery tracking is not set up (webhook), so WhatsApp messages stay at "Accepted by provider".' });
  if (!notes.length) return null;
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-4 space-y-2">
      {notes.map((n) => (
        <div
          key={n.text}
          className={`flex items-start gap-2.5 rounded-sm border px-3.5 py-2.5 text-sm ${
            n.tone === 'bad' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ dashboard

const Dashboard: React.FC<{ admin: Admin; onSignedOut: () => void }> = ({ admin, onSignedOut }) => {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ListItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [listError, setListError] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<string | null>(() => decodeURIComponent(window.location.hash.slice(1)) || null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState('');
  const pausedRef = useRef(false); // a confirmation panel is open: don't refresh underneath it

  const handleAuth = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
        return true;
      }
      return false;
    },
    [onSignedOut],
  );

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadList = useCallback(async () => {
    try {
      const r = await api.list(search ? { type: 'all', q: search } : { type: tab.type, status: tab.status });
      setItems(r.items);
      setCounts(r.counts);
      setListError('');
    } catch (err) {
      if (!handleAuth(err)) setListError(errorText(err));
    } finally {
      setLoadingList(false);
    }
  }, [tab, search, handleAuth]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const d = await api.detail(id);
        setDetail(d);
        setDetailError('');
      } catch (err) {
        if (!handleAuth(err)) setDetailError(errorText(err));
      }
    },
    [handleAuth],
  );

  useEffect(() => {
    setLoadingList(true);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    api.system().then(setSystem).catch(handleAuth);
  }, [handleAuth]);

  useEffect(() => {
    if (selected) {
      setDetail((d) => (d?.public_id === selected ? d : null));
      setDetailError('');
      void loadDetail(selected);
      window.history.replaceState(null, '', `#${selected}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [selected, loadDetail]);

  // new orders and delivery statuses appear without reloading the page
  useEffect(() => {
    const refresh = () => {
      if (document.hidden || pausedRef.current) return;
      void loadList();
      if (selected) void loadDetail(selected);
    };
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [loadList, loadDetail, selected]);

  const signOut = async () => {
    await api.logout().catch(() => {});
    onSignedOut();
  };

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="bg-maroon-gradient text-brand-cream">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/admin" className="flex items-baseline gap-3 min-w-0">
            <span className="font-extrabold tracking-[0.3em] text-base sm:text-lg">PRIME H₂O</span>
            <span className="hidden sm:inline text-[11px] uppercase tracking-[0.28em] text-brand-bronze-light">Orders</span>
          </a>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-brand-cream/80 truncate max-w-[220px]" title={admin.email}>
              {admin.name}
              {admin.role === 'viewer' && <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-brand-bronze-light">read-only</span>}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-sm border border-brand-bronze/50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] hover:bg-white/10"
            >
              <LogOut className="w-3.5 h-3.5 text-brand-bronze" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <SystemBanner system={system} />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:gap-6 lg:items-start">
        {/* ---- list */}
        <section className={selected ? 'hidden lg:block' : ''} aria-label="Orders">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-brown/50" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order ID, name, phone, email"
              aria-label="Search orders"
              className="w-full rounded-sm border border-brand-cream-dark bg-brand-cream-pure pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-bronze"
            />
          </div>

          {!search && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
              {TABS.map((t) => {
                const active = t.key === tab.key;
                const n = counts ? t.count(counts) : null;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active ? 'bg-brand-maroon text-brand-cream' : 'bg-brand-cream-pure text-brand-brown border border-brand-cream-dark hover:border-brand-bronze'
                    }`}
                  >
                    {t.label}
                    {n !== null && (
                      <span
                        className={`min-w-[1.25rem] rounded-full px-1.5 text-[10px] leading-4 ${
                          active ? 'bg-white/20' : t.key === 'PENDING' && n > 0 ? 'bg-amber-400 text-amber-950' : 'bg-brand-cream-tint'
                        }`}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {search && <p className="mt-3 text-xs text-brand-brown/70">Results for “{search}” across all orders and enquiries</p>}

          <div className="mt-4 space-y-2">
            {listError && (
              <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
                {listError}
              </p>
            )}
            {loadingList && !items.length && (
              <div className="py-10 grid place-items-center text-brand-maroon">
                <LoaderCircle className="w-6 h-6 animate-spin" />
              </div>
            )}
            {!loadingList && !items.length && !listError && (
              <div className={`${card} px-4 py-10 text-center text-sm text-brand-brown/70`}>
                <Inbox className="w-6 h-6 mx-auto mb-2 text-brand-bronze" />
                {search ? 'Nothing matches your search.' : tab.key === 'PENDING' ? 'No orders are waiting for approval.' : 'Nothing here yet.'}
              </div>
            )}
            {items.map((it) => (
              <ListRow key={it.public_id} item={it} active={it.public_id === selected} onSelect={() => setSelected(it.public_id)} />
            ))}
          </div>
        </section>

        {/* ---- detail */}
        <section className={selected ? '' : 'hidden lg:block'} aria-label="Order details">
          {!selected && (
            <div className={`${card} px-6 py-16 text-center text-brand-brown/70`}>
              <Package className="w-8 h-8 mx-auto mb-3 text-brand-bronze" />
              <p className="font-editorial text-2xl text-brand-maroon">Select an order to review it</p>
              {counts && counts.PENDING > 0 && (
                <p className="mt-2 text-sm">
                  {counts.PENDING} order{counts.PENDING === 1 ? ' is' : 's are'} waiting for your approval.
                </p>
              )}
            </div>
          )}
          {selected && detailError && !detail && (
            <div className={`${card} p-6`}>
              <BackButton onClick={() => setSelected(null)} />
              <p role="alert" className="mt-3 text-sm text-red-800">
                {detailError}
              </p>
            </div>
          )}
          {selected && !detail && !detailError && (
            <div className="py-16 grid place-items-center text-brand-maroon">
              <LoaderCircle className="w-6 h-6 animate-spin" />
            </div>
          )}
          {detail && detail.public_id === selected && (
            <OrderDetail
              detail={detail}
              system={system}
              canEdit={admin.role === 'admin'}
              onBack={() => setSelected(null)}
              onUpdated={(d) => {
                if (d) setDetail(d);
                else void loadDetail(detail.public_id);
                void loadList();
              }}
              setPaused={(p) => {
                pausedRef.current = p;
              }}
              handleAuth={handleAuth}
            />
          )}
        </section>
      </main>
    </div>
  );
};

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="lg:hidden inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-brand-bronze-dark hover:text-brand-maroon"
  >
    <ChevronLeft className="w-4 h-4" /> All orders
  </button>
);

const ListRow: React.FC<{ item: ListItem; active: boolean; onSelect: () => void }> = ({ item, active, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-current={active}
    className={`w-full text-left ${card} px-4 py-3 transition-colors ${active ? 'ring-2 ring-brand-maroon border-transparent' : 'hover:border-brand-bronze'}`}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[11px] tracking-wider text-brand-brown/70">{item.public_id}</span>
      <span className="text-[11px] text-brand-brown/60" title={fmtDateTime(item.created_at)}>
        {ago(item.created_at)}
      </span>
    </div>
    <div className="mt-1 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-brand-brown-deep truncate">{item.customer_name}</div>
        {item.company_name && <div className="text-xs text-brand-brown/70 truncate">{item.company_name}</div>}
      </div>
      <StatusBadge status={item.order_status} />
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-brown/80">
      {item.source === 'custom_bottle' ? (
        <>
          <span className="inline-flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-brand-bronze-dark" />
            {item.bottle_size} × {item.quantity?.toLocaleString('en-IN')}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 text-brand-bronze-dark" />
            {fmtDate(item.delivery_date)}
          </span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1">
          <Mail className="w-3.5 h-3.5 text-brand-bronze-dark" />
          {item.bottle_size ?? 'General enquiry'}
        </span>
      )}
      {item.failed_notifications > 0 && (
        <span className="inline-flex items-center gap-1 font-semibold text-red-800">
          <CircleAlert className="w-3.5 h-3.5" />
          {item.failed_notifications} failed
        </span>
      )}
      {item.pending_notifications > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-800">
          <Clock className="w-3.5 h-3.5" />
          sending
        </span>
      )}
    </div>
  </button>
);

// ------------------------------------------------------------------ order detail

interface DetailProps {
  detail: Detail;
  system: SystemInfo | null;
  canEdit: boolean;
  onBack: () => void;
  onUpdated: (d: Detail | null) => void;
  setPaused: (p: boolean) => void;
  handleAuth: (e: unknown) => boolean;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-[11px] uppercase tracking-[0.14em] text-brand-brown/60">{label}</dt>
    <dd className="mt-0.5 text-sm text-brand-brown-deep break-words">{children}</dd>
  </div>
);

const OrderDetail: React.FC<DetailProps> = ({ detail, system, canEdit, onBack, onUpdated, setPaused, handleAuth }) => {
  const isOrder = detail.source === 'custom_bottle';
  const c = detail.customization ?? {};
  const swatch = /#([0-9a-f]{6})/i.exec(c.colour ?? '')?.[0];

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <BackButton onClick={onBack} />
        <div className="mt-1 lg:mt-0 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-brand-bronze-dark font-bold">{isOrder ? 'Custom bottle order' : 'Website enquiry'}</p>
            <h1 className="mt-1 font-mono text-xl sm:text-2xl font-bold tracking-wider text-brand-maroon select-all">{detail.public_id}</h1>
            <p className="mt-1 text-xs text-brand-brown/70">Received {fmtDateTime(detail.created_at)}</p>
          </div>
          <StatusBadge status={detail.order_status} large />
        </div>
        {isOrder && canEdit ? (
          <OrderActions detail={detail} system={system} canEdit={canEdit} onUpdated={onUpdated} setPaused={setPaused} handleAuth={handleAuth} />
        ) : isOrder ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-brand-brown/80">
            <Lock className="w-4 h-4 text-brand-bronze-dark" />
            Your account is read-only. Ask an administrator to accept, reject or update this order.
          </p>
        ) : (
          <p className="mt-4 text-sm text-brand-brown/80">
            General enquiries from the Contact form are not orders. Reply to the customer directly by phone, email or WhatsApp.
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${card} p-5`}>
          <h2 className={sectionTitle}>Customer</h2>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Name">
              <span className="inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand-bronze-dark" />
                {detail.customer_name}
              </span>
            </Field>
            <Field label="Company">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-brand-bronze-dark" />
                {detail.company_name || '—'}
              </span>
            </Field>
            <Field label="Phone">
              <a href={`tel:${detail.customer_phone}`} className="inline-flex items-center gap-1.5 text-brand-maroon underline-offset-2 hover:underline">
                <Phone className="w-3.5 h-3.5" />
                {fmtPhone(detail.customer_phone)}
              </a>
            </Field>
            <Field label="Email">
              {detail.customer_email ? (
                <a href={`mailto:${detail.customer_email}`} className="inline-flex items-center gap-1.5 text-brand-maroon underline-offset-2 hover:underline min-w-0 [overflow-wrap:anywhere]">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  {detail.customer_email}
                </a>
              ) : (
                '—'
              )}
            </Field>
            {isOrder && (
              <div className="sm:col-span-2">
                <Field label="WhatsApp updates">
                  {detail.whatsapp_opt_in ? (
                    <span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                        <MessageCircle className="w-3.5 h-3.5" /> Opted in · {fmtPhone(detail.customer_whatsapp)}
                      </span>
                      <span className="block text-xs text-brand-brown/60">Consent given {fmtDateTime(detail.whatsapp_opt_in_at)}</span>
                    </span>
                  ) : detail.whatsapp_opt_out_at ? (
                    <span className="text-red-800">Opted out (replied STOP) on {fmtDateTime(detail.whatsapp_opt_out_at)}. The customer only gets email.</span>
                  ) : (
                    <span className="text-brand-brown/80">Not opted in. The customer only gets email.</span>
                  )}
                </Field>
              </div>
            )}
          </dl>
        </div>

        <div className={`${card} p-5`}>
          <h2 className={sectionTitle}>{isOrder ? 'Order & delivery' : 'Enquiry'}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
            {isOrder ? (
              <>
                <Field label="Bottle size">{detail.bottle_size}</Field>
                <Field label="Quantity">{detail.quantity?.toLocaleString('en-IN')} bottles</Field>
                <Field label="Preferred delivery">{fmtDate(detail.delivery_date)}</Field>
                <Field label="Status changed">{fmtDateTime(detail.status_changed_at)}</Field>
              </>
            ) : (
              <Field label="Interested in">{detail.bottle_size || '—'}</Field>
            )}
            <div className="col-span-2">
              <Field label={isOrder ? 'Delivery requirements / instructions' : 'Message'}>
                <span className="whitespace-pre-wrap">{detail.customer_message || '—'}</span>
              </Field>
            </div>
            {detail.accepted_at && <Field label="Accepted">{fmtDateTime(detail.accepted_at)}</Field>}
            {detail.rejected_at && (
              <div className="col-span-2">
                <Field label={`Rejected ${fmtDateTime(detail.rejected_at)}`}>
                  <span className="text-red-900">{detail.rejection_reason}</span>
                </Field>
              </div>
            )}
            {detail.cancelled_at && (
              <div className="col-span-2">
                <Field label={`Cancelled ${fmtDateTime(detail.cancelled_at)}`}>
                  <span className="text-stone-800">{detail.cancellation_reason}</span>
                </Field>
              </div>
            )}
          </dl>
        </div>
      </div>

      {isOrder && (
        <div className={`${card} p-5`}>
          <h2 className={sectionTitle}>Custom label</h2>
          <div className="mt-3 grid gap-5 md:grid-cols-[1fr_auto]">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 content-start">
              <Field label="Template">{c.template || '—'}</Field>
              <Field label="Label colour">
                <span className="inline-flex items-center gap-2">
                  {swatch && <span className="h-4 w-4 rounded-sm ring-1 ring-black/15" style={{ background: swatch }} />}
                  {c.colour || '—'}
                </span>
              </Field>
              <Field label="Name on label">
                <span className="font-semibold">{c.labelName || '—'}</span>
              </Field>
              <Field label="Message / tagline">{c.tagline || '—'}</Field>
              <Field label="Layout">{[c.layout, c.font].filter(Boolean).join(' · ') || '—'}</Field>
              <Field label="Text">{[c.textSize && `size ${c.textSize}`, c.position].filter(Boolean).join(' · ') || '—'}</Field>
              <div className="col-span-2">
                <Field label="Customization details">
                  <span className="whitespace-pre-wrap">{c.details || '—'}</span>
                </Field>
              </div>
            </dl>
            <div className="flex flex-wrap gap-4 md:flex-col">
              {(['preview', 'logo'] as const).map((kind) => {
                const f = detail.files.find((x) => x.kind === kind);
                return (
                  <figure key={kind} className="w-40">
                    <figcaption className="text-[11px] uppercase tracking-[0.14em] text-brand-brown/60 mb-1">{kind === 'logo' ? 'Uploaded logo' : 'Label preview'}</figcaption>
                    {f ? (
                      <>
                        <a href={api.fileUrl(detail.public_id, kind)} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={api.fileUrl(detail.public_id, kind)}
                            alt={kind === 'logo' ? `Logo uploaded by ${detail.customer_name}` : 'Label preview'}
                            className="h-40 w-40 object-contain rounded-sm border border-brand-cream-dark bg-white"
                          />
                        </a>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="truncate text-brand-brown/70" title={f.filename}>
                            {f.filename}
                          </span>
                          <a href={api.fileUrl(detail.public_id, kind, true)} className="inline-flex items-center gap-0.5 text-brand-maroon hover:underline shrink-0">
                            <Download className="w-3 h-3" /> Save
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="h-40 w-40 grid place-items-center rounded-sm border border-dashed border-brand-cream-dark text-xs text-brand-brown/50 text-center px-2">
                        {kind === 'logo' ? 'No logo uploaded' : 'No preview'}
                      </div>
                    )}
                  </figure>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isOrder && <StatusHistory history={detail.history} />}
      <Notifications detail={detail} canEdit={canEdit} onUpdated={onUpdated} handleAuth={handleAuth} />
    </div>
  );
};

// ------------------------------------------------------------------ owner actions

const OrderActions: React.FC<Omit<DetailProps, 'onBack'>> = ({ detail, system, onUpdated, setPaused, handleAuth }) => {
  const [open, setOpen] = useState<Detail['allowedTransitions'][number] | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOpen(null);
    setNote('');
    setError('');
  }, [detail.public_id]);
  useEffect(() => {
    setPaused(!!open);
    return () => setPaused(false);
  }, [open, setPaused]);

  if (!detail.allowedTransitions.length) {
    return (
      <p className="mt-4 inline-flex items-center gap-2 text-sm text-brand-brown/80">
        <Check className="w-4 h-4 text-brand-bronze-dark" />
        This order is {STATUS_META[detail.order_status!].label.toLowerCase()}. No further changes are possible.
      </p>
    );
  }

  const choose = (t: Detail['allowedTransitions'][number]) => {
    setOpen(t);
    setNote('');
    setError('');
  };

  const submit = async () => {
    if (!open || !detail.order_status) return;
    if (open.reasonRequired && note.trim().length < 3) {
      setError('Please enter a reason. It is included in the message to the customer.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const updated = await api.setStatus(detail.public_id, open.to, detail.order_status, note.trim());
      setOpen(null);
      setNote('');
      onUpdated(updated);
    } catch (err) {
      if (handleAuth(err)) return;
      setError(errorText(err));
      if (err instanceof ApiError && err.status === 409) onUpdated(null); // someone else changed it: reload
    } finally {
      setSubmitting(false);
    }
  };

  const copy = open ? ACTION_COPY[open.to] : null;
  const customerChannels = `email${detail.whatsapp_opt_in ? ' and WhatsApp' : ''}`;

  return (
    <div className="mt-4">
      {!open && (
        <div className="flex flex-wrap gap-2">
          {detail.allowedTransitions.map((t) => {
            const danger = ACTION_COPY[t.to].danger;
            const Icon = t.to === 'ACCEPTED' ? Check : t.to === 'REJECTED' ? X : t.to === 'CANCELLED' ? Ban : Send;
            return (
              <button
                key={t.to}
                type="button"
                onClick={() => choose(t)}
                className={`inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                  danger
                    ? 'border border-red-300 text-red-800 bg-white hover:bg-red-50'
                    : 'bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich shadow-luxury'
                }`}
              >
                <Icon className={`w-4 h-4 ${danger ? '' : 'text-brand-bronze'}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {open && copy && (
        <div className={`rounded-sm border p-4 ${copy.danger ? 'border-red-200 bg-red-50/60' : 'border-brand-bronze/50 bg-brand-cream-light'}`}>
          <h3 className="font-semibold text-brand-maroon">
            {open.label}: {detail.public_id}
          </h3>
          <p className="mt-1 text-sm text-brand-brown">{copy.effect}</p>
          <p className="mt-2 text-xs text-brand-brown/80">
            Notifications: the customer gets this by {customerChannels}
            {!detail.whatsapp_opt_in && ' (not opted in to WhatsApp)'}; you get a copy by email and WhatsApp.
          </p>
          {system && !system.whatsapp.configured && (
            <p className="mt-1 text-xs font-semibold text-red-800">WhatsApp is not connected, so WhatsApp messages will be recorded as not sent.</p>
          )}
          {system?.email.sandbox && <p className="mt-1 text-xs font-semibold text-amber-800">Email test mode: emails will not actually be delivered.</p>}
          <label htmlFor="action-note" className="mt-3 block text-xs font-bold uppercase tracking-[0.14em] text-brand-maroon">
            {copy.noteLabel}
          </label>
          <textarea
            id="action-note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.placeholder}
            className="mt-1.5 w-full rounded-sm border border-brand-cream-dark bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-bronze resize-y"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className={`inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white disabled:opacity-70 ${
                copy.danger ? 'bg-red-700 hover:bg-red-800' : 'bg-brand-maroon hover:bg-brand-maroon-rich'
              }`}
            >
              {submitting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirm: {open.label}
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              disabled={submitting}
              className="rounded-sm border border-brand-cream-dark bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-brown hover:border-brand-bronze"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ history & notifications

const StatusHistory: React.FC<{ history: HistoryEntry[] }> = ({ history }) => (
  <div className={`${card} p-5`}>
    <h2 className={`${sectionTitle} inline-flex items-center gap-2`}>
      <History className="w-4 h-4 text-brand-bronze-dark" /> Status history
    </h2>
    <ol className="mt-4 space-y-4">
      {history.map((h, i) => (
        <li key={h.id} className="relative pl-6">
          <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${STATUS_META[h.to_status].dot}`} />
          {i < history.length - 1 && <span className="absolute left-[4.5px] top-5 bottom-[-14px] w-px bg-brand-cream-dark" />}
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-brand-brown-deep">
              {h.from_status ? `${STATUS_META[h.from_status].label} → ${STATUS_META[h.to_status].label}` : 'Order request submitted (Pending approval)'}
            </span>
            <span className="text-xs text-brand-brown/60">{fmtDateTime(h.created_at)}</span>
          </div>
          <div className="text-xs text-brand-brown/70">
            by {h.actor_label}
            {h.actor_email ? ` (${h.actor_email})` : ''}
          </div>
          {h.note && <p className="mt-1.5 text-sm bg-brand-cream-light border-l-2 border-brand-bronze px-3 py-1.5 whitespace-pre-wrap">{h.note}</p>}
        </li>
      ))}
    </ol>
  </div>
);

function deliveryState(n: Notification): { label: string; cls: string; hint?: string } {
  if (n.test_mode && ['accepted', 'sent', 'delivered', 'read'].includes(n.status)) {
    return { label: 'Test mode: not delivered', cls: 'bg-purple-100 text-purple-900', hint: 'Brevo sandbox accepted it but did not deliver it.' };
  }
  switch (n.status) {
    case 'pending':
      return { label: 'Queued', cls: 'bg-stone-100 text-stone-700' };
    case 'sending':
      return { label: 'Sending…', cls: 'bg-stone-100 text-stone-700' };
    case 'retrying':
      return { label: 'Retrying', cls: 'bg-amber-100 text-amber-900', hint: `Attempt ${n.attempts} failed. Next try ${fmtDateTime(n.next_attempt_at)}.` };
    case 'accepted':
      return { label: 'Accepted by provider', cls: 'bg-sky-100 text-sky-900', hint: `Handed over ${fmtDateTime(n.accepted_at)}. Delivery not confirmed yet.` };
    case 'sent':
      return { label: 'Sent', cls: 'bg-sky-100 text-sky-900', hint: 'Sent by WhatsApp; not yet delivered to the phone.' };
    case 'delivered':
      return { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-900', hint: `Confirmed by the provider ${fmtDateTime(n.delivered_at)}.` };
    case 'read':
      return { label: 'Read', cls: 'bg-emerald-100 text-emerald-900', hint: `Delivered ${fmtDateTime(n.delivered_at)} and read.` };
    case 'failed':
      return { label: 'Failed', cls: 'bg-red-100 text-red-900' };
    case 'bounced':
      return { label: 'Bounced', cls: 'bg-red-100 text-red-900' };
    case 'skipped':
      return { label: 'Not sent', cls: 'bg-stone-200 text-stone-700' };
  }
}

const NotificationCell: React.FC<{
  n: Notification | undefined;
  audience: 'owner' | 'customer';
  channel: 'email' | 'whatsapp';
  events: ProviderEvent[];
  canEdit: boolean;
  onRetry: (id: number) => Promise<void>;
}> = ({ n, audience, channel, events, canEdit, onRetry }) => {
  const [busy, setBusy] = useState(false);
  const Icon = channel === 'email' ? Mail : MessageCircle;
  const title = `${audience === 'owner' ? 'You' : 'Customer'} · ${channel === 'email' ? 'Email' : 'WhatsApp'}`;
  if (!n) {
    return (
      <div className="rounded-sm border border-dashed border-brand-cream-dark p-3 text-xs text-brand-brown/50">
        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-[0.12em]">
          <Icon className="w-3.5 h-3.5" /> {title}
        </span>
        <p className="mt-1">Not applicable</p>
      </div>
    );
  }
  const s = deliveryState(n);
  const canRetry = canEdit && (n.status === 'failed' || n.status === 'skipped');
  const mine = events.filter((e) => e.notification_id === n.id);
  return (
    <div className="rounded-sm border border-brand-cream-dark bg-white/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-maroon">
          <Icon className="w-3.5 h-3.5" /> {title}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>
      </div>
      <div className="mt-1 text-xs text-brand-brown/75 break-all">{n.recipient}</div>
      {s.hint && <div className="mt-1 text-xs text-brand-brown/65">{s.hint}</div>}
      {n.last_error && (
        <div className={`mt-1.5 text-xs ${n.status === 'skipped' ? 'text-stone-700' : 'text-red-800'}`}>
          {n.status === 'skipped' ? 'Reason: ' : ''}
          {n.last_error}
        </div>
      )}
      {mine.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-brand-brown/60">
          {mine.map((e, i) => (
            <li key={i}>
              {e.provider === 'admin' ? 'Manual retry' : `Provider: ${e.event}`} · {fmtDateTime(e.occurred_at ?? e.received_at)}
              {e.detail && e.provider !== 'admin' ? ` · ${e.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
      {canRetry && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onRetry(n.id);
            setBusy(false);
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-brand-bronze/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-maroon hover:bg-brand-cream disabled:opacity-60"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Retry
        </button>
      )}
    </div>
  );
};

const Notifications: React.FC<{
  detail: Detail;
  canEdit: boolean;
  onUpdated: (d: Detail | null) => void;
  handleAuth: (e: unknown) => boolean;
}> = ({ detail, canEdit, onUpdated, handleAuth }) => {
  const [error, setError] = useState('');
  const groups: { event: string; at: string; items: Notification[] }[] = [];
  for (const n of detail.notifications) {
    let g = groups.find((x) => x.event === n.event);
    if (!g) groups.push((g = { event: n.event, at: n.event_at ?? n.created_at, items: [] }));
    g.items.push(n);
  }
  const retry = async (id: number) => {
    setError('');
    try {
      await api.retry(id);
    } catch (err) {
      if (handleAuth(err)) return;
      setError(errorText(err));
    }
    onUpdated(null);
  };
  const cells: ['owner' | 'customer', 'email' | 'whatsapp'][] = [
    ['owner', 'email'],
    ['owner', 'whatsapp'],
    ['customer', 'email'],
    ['customer', 'whatsapp'],
  ];

  return (
    <div className={`${card} p-5`}>
      <h2 className={`${sectionTitle} inline-flex items-center gap-2`}>
        <Send className="w-4 h-4 text-brand-bronze-dark" /> Notifications
      </h2>
      <p className="mt-1 text-xs text-brand-brown/65">
        Each message is tracked separately. “Accepted by provider” means Brevo or Meta took the message; it only shows Delivered once the provider confirms delivery.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-5">
        {groups.map((g) => (
          <div key={g.event}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-semibold text-brand-brown-deep">{EVENT_LABEL[g.event] ?? g.event}</h3>
              <span className="text-xs text-brand-brown/60">{fmtDateTime(g.at)}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {cells
                .filter(([a, ch]) => detail.source === 'custom_bottle' || !(a === 'customer' && ch === 'whatsapp'))
                .map(([a, ch]) => (
                  <NotificationCell
                    key={`${a}-${ch}`}
                    n={g.items.find((x) => x.audience === a && x.channel === ch)}
                    audience={a}
                    channel={ch}
                    events={detail.events}
                    canEdit={canEdit}
                    onRetry={retry}
                  />
                ))}
            </div>
          </div>
        ))}
        {!groups.length && <p className="text-sm text-brand-brown/70">No notifications recorded.</p>}
      </div>
      <a href="/" className="mt-5 inline-flex items-center gap-1 text-xs text-brand-brown/60 hover:text-brand-maroon">
        <ExternalLink className="w-3 h-3" /> Open the website
      </a>
    </div>
  );
};
