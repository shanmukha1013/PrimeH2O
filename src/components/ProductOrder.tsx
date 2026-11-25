import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CircleCheck,
  Copy,
  Info,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { productsData } from './ProductCollection';
import { WHATSAPP_DISPLAY, WHATSAPP_ORDER_URL, whatsappUrlWithText } from '../lib/business';
import {
  CatalogueProduct,
  EnquiryError,
  ProductOrderResult,
  WHATSAPP_CONSENT_TEXT,
  emailStatusText,
  fetchProducts,
  newRequestId,
  submitProductOrder,
  whatsAppStatusText,
} from '../lib/enquiryApi';
import {
  DEFAULT_STATE,
  INDIAN_STATES,
  MAX_LINE_QUANTITY,
  formatBottles,
  formatPhone,
  formatRupees,
  isMobileNumber,
  isPinCode,
} from '../lib/orderForm';

const BUSINESS_PHONE = '8143489222';
const BUSINESS_EMAIL = 'prime2417@gmail.com';

const inputClass = (error?: string) =>
  `w-full px-4 py-3 bg-white border text-sm text-brand-slate placeholder-brand-slate/40 focus:outline-none focus:ring-1 transition-all rounded-sm ${
    error ? 'border-red-600 focus:ring-red-600' : 'border-brand-lavender/50 focus:border-brand-purple focus:ring-brand-purple'
  }`;
const fieldLabel = 'block text-xs uppercase tracking-[0.16em] font-bold text-brand-purple';

const Required = () => (
  <span className="text-brand-purple-rich" aria-hidden="true">
    *
  </span>
);
const Optional = () => <span className="normal-case tracking-normal font-medium text-brand-slate/55">(optional)</span>;

const FieldError: React.FC<{ id?: string; msg?: string }> = ({ id, msg }) =>
  msg ? (
    <p id={id} className="text-xs text-red-700 font-medium mt-1.5">
      {msg}
    </p>
  ) : null;

const Step: React.FC<{ n: string; title: string; hint?: string; children: React.ReactNode }> = ({ n, title, hint, children }) => (
  <div className="bg-white/90 border border-brand-lavender/40 rounded-frame p-5 sm:p-7 shadow-luxury">
    <div className="flex items-start gap-4 mb-5">
      <span className="font-editorial text-3xl sm:text-4xl leading-none text-brand-purple-light">{n}</span>
      <div className="pt-0.5">
        <h3 className="text-xs sm:text-sm uppercase tracking-[0.2em] font-bold text-brand-purple">{title}</h3>
        {hint && <p className="text-xs sm:text-sm text-brand-slate/70 mt-1">{hint}</p>}
      </div>
    </div>
    {children}
  </div>
);

const imageFor = (code: string) => productsData.find((p) => p.id === code)?.image ?? '/assets/bottle_500ml.png';

const EMPTY_FORM = {
  name: '',
  phone: '',
  whatsappSame: true,
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  state: DEFAULT_STATE,
  pinCode: '',
  instructions: '',
};
type OrderForm = typeof EMPTY_FORM;
type TextField = Exclude<keyof OrderForm, 'whatsappSame'>;

type Catalogue = { phase: 'loading' } | { phase: 'ready'; products: CatalogueProduct[] } | { phase: 'unavailable' };
type ServerState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'done'; result: ProductOrderResult }
  | { phase: 'error'; error: string };

interface ProductOrderProps {
  /** Set by "Order this size" buttons elsewhere on the page. */
  preselect?: { size: string; nonce: number } | null;
}

export const ProductOrder: React.FC<ProductOrderProps> = ({ preselect }) => {
  const [catalogue, setCatalogue] = useState<Catalogue>({ phase: 'loading' });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [waOptIn, setWaOptIn] = useState(false); // explicit opt-in, never pre-ticked
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [server, setServer] = useState<ServerState>({ phase: 'idle' });
  // idempotency key: kept while the order stays the same, so retries never create a second order
  const requestRef = useRef<{ id: string; signature: string }>({ id: newRequestId(), signature: '' });
  const honeypotRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadCatalogue = useCallback(() => {
    setCatalogue({ phase: 'loading' });
    fetchProducts()
      .then((products) => setCatalogue(products.length ? { phase: 'ready', products } : { phase: 'unavailable' }))
      .catch(() => setCatalogue({ phase: 'unavailable' }));
  }, []);
  useEffect(() => loadCatalogue(), [loadCatalogue]);

  const products = catalogue.phase === 'ready' ? catalogue.products : [];

  // "Order this size" from the product details: select it and put the cursor in its quantity box.
  // After a completed order it starts a new one (keeping the customer's details).
  const lastPreselect = useRef<number | null>(null);
  const phaseRef = useRef(server.phase);
  phaseRef.current = server.phase;
  useEffect(() => {
    if (!preselect || catalogue.phase !== 'ready' || lastPreselect.current === preselect.nonce) return;
    const p = catalogue.products.find((x) => x.size === preselect.size);
    if (!p) return;
    lastPreselect.current = preselect.nonce;
    if (phaseRef.current === 'done') {
      setQuantities({ [p.code]: '1' });
      setForm((f) => ({ ...f, instructions: '' }));
      setErrors({});
      requestRef.current = { id: newRequestId(), signature: '' };
      setServer({ phase: 'idle' });
    } else {
      setQuantities((q) => (Number(q[p.code]) > 0 ? q : { ...q, [p.code]: '1' }));
    }
    // (no cleanup: focusing after an unmount is a harmless no-op, and cancelling it would lose the focus in React strict mode)
    window.setTimeout(() => document.getElementById(`po-qty-${p.code}`)?.focus({ preventScroll: true }), 700);
  }, [preselect, catalogue]);

  const lines = useMemo(
    () =>
      products
        .map((product) => ({ product, qty: /^\d+$/.test(quantities[product.code] ?? '') ? parseInt(quantities[product.code], 10) : 0 }))
        .filter((l) => l.qty > 0),
    [products, quantities],
  );
  const allPriced = lines.length > 0 && lines.every((l) => l.product.unitPricePaise != null);
  const total = allPriced ? lines.reduce((sum, l) => sum + l.qty * (l.product.unitPricePaise as number), 0) : null;
  const totalBottles = lines.reduce((sum, l) => sum + l.qty, 0);
  const anyPriceListed = products.some((p) => p.unitPricePaise != null);
  const submitting = server.phase === 'submitting';

  const update = (key: TextField, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };
  const setQty = (code: string, value: string) => {
    setQuantities((q) => ({ ...q, [code]: value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6) }));
    setErrors((e) => ({ ...e, [`items.${code}`]: '', items: '' }));
  };
  const stepQty = (code: string, delta: number) => {
    const current = parseInt(quantities[code] || '0', 10) || 0;
    const next = Math.min(Math.max(current + delta, 0), MAX_LINE_QUANTITY);
    setQty(code, next ? String(next) : '');
  };

  const focusField = (key: string) => {
    const id = key === 'items' ? `po-qty-${products[0]?.code}` : key.startsWith('items.') ? `po-qty-${key.slice(6)}` : `po-${key}`;
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLInputElement | null)?.focus({ preventScroll: true });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!lines.length) e.items = 'Please choose at least one bottle size and enter how many bottles you need.';
    for (const l of lines) {
      if (l.qty > MAX_LINE_QUANTITY) {
        e[`items.${l.product.code}`] = `Please enter up to ${MAX_LINE_QUANTITY.toLocaleString('en-IN')} bottles. For larger orders, contact us directly.`;
      }
    }
    if (form.name.trim().length < 2) e.name = 'Please enter your full name.';
    if (!form.phone.trim()) e.phone = 'Please enter your mobile number.';
    else if (!isMobileNumber(form.phone)) e.phone = 'Please enter a valid 10-digit mobile number (e.g. 98765 43210).';
    if (!form.whatsappSame) {
      if (!form.whatsapp.trim()) e.whatsapp = 'Please enter your WhatsApp number, or tick “Same as my mobile number”.';
      else if (!isMobileNumber(form.whatsapp)) e.whatsapp = 'Please enter a valid WhatsApp mobile number (e.g. 98765 43210).';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = 'Please enter a valid email address, or leave it blank.';
    if (form.address.trim().length < 8) e.address = 'Please enter your complete delivery address (house / flat, street and area).';
    if (form.city.trim().length < 2) e.city = 'Please enter your city.';
    if (!INDIAN_STATES.includes(form.state)) e.state = 'Please choose your state.';
    if (!isPinCode(form.pinCode)) e.pinCode = form.pinCode.trim() ? 'Please enter a valid 6-digit PIN code (e.g. 500068).' : 'Please enter your 6-digit PIN code.';
    if (form.instructions.trim().length > 1000) e.instructions = 'Please keep the instructions under 1,000 characters.';
    setErrors(e);
    const order = ['items', ...products.map((p) => `items.${p.code}`), 'name', 'phone', 'email', 'whatsapp', 'address', 'city', 'state', 'pinCode', 'instructions'];
    const first = order.find((k) => e[k]);
    if (first) {
      focusField(first);
      return false;
    }
    return true;
  };

  const inFlightRef = useRef(false); // a ref, not state: two clicks in the same instant must not send two orders
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (inFlightRef.current || submitting || !validate()) return;
    inFlightRef.current = true;
    const details = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsappSame ? '' : form.whatsapp.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state,
      pinCode: form.pinCode.trim(),
      items: lines.map((l) => ({ product: l.product.code, quantity: l.qty })),
      instructions: form.instructions.trim(),
      whatsappOptIn: waOptIn,
    };
    const signature = JSON.stringify(details);
    if (signature !== requestRef.current.signature) requestRef.current = { id: newRequestId(), signature };
    setServer({ phase: 'submitting' });
    try {
      const result = await submitProductOrder({ ...details, clientRequestId: requestRef.current.id, website: honeypotRef.current?.value ?? '' });
      setServer({ phase: 'done', result });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (err) {
      if (err instanceof EnquiryError && Object.keys(err.fields).length) {
        setErrors((x) => ({ ...x, ...err.fields }));
        focusField(Object.keys(err.fields)[0]);
      }
      setServer({ phase: 'error', error: err instanceof Error ? err.message : 'Your order could not be placed. Please try again.' });
    } finally {
      inFlightRef.current = false;
    }
  };

  /** Another order: keep the customer's details, clear the bottles and instructions. */
  const newOrder = () => {
    setQuantities({});
    setForm((f) => ({ ...f, instructions: '' }));
    setErrors({});
    setServer({ phase: 'idle' });
    requestRef.current = { id: newRequestId(), signature: '' };
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updatesTo = form.whatsappSame ? form.phone.trim() : form.whatsapp.trim();

  return (
    <section
      ref={sectionRef}
      id="order"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-brand-lavender-pure border-t border-brand-lavender/35 scroll-mt-[72px] lg:scroll-mt-[80px] overflow-hidden"
      aria-label="Order PRIME H₂O online"
    >
      <div className="absolute -top-24 -right-40 w-[460px] h-[460px] rounded-full bg-brand-lavender/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 -left-40 w-[420px] h-[420px] rounded-full bg-brand-purple/5 blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-8 h-px bg-brand-purple-light" />
            <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-purple">Order Online</span>
            <span className="w-8 h-px bg-brand-purple-light" />
          </div>
          <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-purple leading-tight text-balance">
            Order PRIME H<sub className="text-[0.55em] relative bottom-[-0.05em]">2</sub>O <span className="italic text-brand-purple">Online.</span>
          </h2>
          <p className="text-base sm:text-lg text-brand-slate/85 max-w-2xl mx-auto text-balance">
            Choose your bottle sizes and quantities, tell us where to deliver, and our team will confirm your order.
          </p>
        </div>

        {catalogue.phase === 'loading' && (
          <div className="mt-12 md:mt-16 py-16 grid place-items-center text-brand-purple" role="status">
            <LoaderCircle className="w-7 h-7 animate-spin" aria-hidden="true" />
            <span className="mt-3 text-xs uppercase tracking-[0.2em] text-brand-slate/70">Loading products…</span>
          </div>
        )}

        {catalogue.phase === 'unavailable' && <OrderingUnavailable onRetry={loadCatalogue} />}

        {catalogue.phase === 'ready' && server.phase === 'done' && (
          <div ref={resultRef} className="scroll-mt-24">
            <OrderConfirmation result={server.result} onNewOrder={newOrder} />
          </div>
        )}

        {catalogue.phase === 'ready' && server.phase !== 'done' && (
          <form onSubmit={submit} noValidate className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* spam trap: invisible to people */}
            <div className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
              <label>
                Website
                <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <fieldset disabled={submitting} className="lg:col-span-7 space-y-6 min-w-0">
              <legend className="sr-only">Order details</legend>

              {/* 01 — Products */}
              <Step n="01" title="Choose Your Bottles" hint="Order one size or mix all three in a single order.">
                <div className="space-y-3">
                  {products.map((p) => {
                    const q = quantities[p.code] ?? '';
                    const qty = /^\d+$/.test(q) ? parseInt(q, 10) : 0;
                    const err = errors[`items.${p.code}`];
                    return (
                      <div
                        key={p.code}
                        className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-tile border transition-all duration-200 ${
                          err ? 'border-red-600 bg-white' : qty > 0 ? 'border-brand-purple/60 bg-white shadow-luxury' : 'border-brand-lavender/40 bg-white/60'
                        }`}
                      >
                        <div className="w-12 h-20 sm:w-16 sm:h-24 shrink-0 flex items-end justify-center rounded-tile bg-brand-lavender-light/40 border border-brand-lavender/30 overflow-hidden">
                          <img src={imageFor(p.code)} alt={`${p.name} packaged drinking water bottle`} className="h-[90%] w-auto object-contain drop-shadow-[0_6px_8px_rgba(88,18,184,0.18)]" loading="lazy" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-brand-purple text-sm sm:text-base">{p.name}</div>
                          <div className="text-xs text-brand-slate/75 mt-0.5">
                            {p.unitPricePaise != null ? `${formatRupees(p.unitPricePaise)} per bottle` : 'Price confirmed by PRIME H₂O'}
                          </div>
                          {qty > 0 && (
                            <div className="text-xs font-semibold text-brand-purple mt-0.5">
                              {formatBottles(qty)}
                              {p.unitPricePaise != null && ` · ${formatRupees(qty * p.unitPricePaise)}`}
                            </div>
                          )}
                          <FieldError msg={err} />
                        </div>
                        <div className="flex items-stretch shrink-0">
                          <button
                            type="button"
                            onClick={() => stepQty(p.code, -1)}
                            disabled={qty === 0}
                            aria-label={`One bottle fewer of ${p.size}`}
                            className="w-9 sm:w-10 h-10 grid place-items-center border border-brand-lavender/50 rounded-l-sm text-brand-purple bg-white hover:bg-brand-lavender-light/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <label htmlFor={`po-qty-${p.code}`} className="sr-only">
                            Number of {p.size} bottles
                          </label>
                          <input
                            id={`po-qty-${p.code}`}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="off"
                            value={q}
                            placeholder="0"
                            onChange={(e) => setQty(p.code, e.target.value)}
                            aria-invalid={!!err}
                            className={`w-14 sm:w-20 h-10 text-center border-y bg-white text-sm font-semibold text-brand-slate-deep focus:outline-none focus:ring-1 focus:ring-brand-purple ${
                              err ? 'border-red-600' : 'border-brand-lavender/50'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => stepQty(p.code, 1)}
                            aria-label={`One bottle more of ${p.size}`}
                            className="w-9 sm:w-10 h-10 grid place-items-center border border-brand-lavender/50 rounded-r-sm text-brand-purple bg-white hover:bg-brand-lavender-light/60 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <FieldError msg={errors.items} />
                  <p className="text-xs text-brand-slate/65">Quantities are in bottles.</p>
                </div>
              </Step>

              {/* 02 — Customer */}
              <Step n="02" title="Your Details" hint="So we can confirm your order and reach you about the delivery.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <label htmlFor="po-name" className={fieldLabel}>
                      Full Name <Required />
                    </label>
                    <input
                      id="po-name"
                      type="text"
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      maxLength={100}
                      aria-invalid={!!errors.name}
                      className={`mt-1.5 ${inputClass(errors.name)}`}
                    />
                    <FieldError msg={errors.name} />
                  </div>
                  <div>
                    <label htmlFor="po-phone" className={fieldLabel}>
                      Mobile Number <Required />
                    </label>
                    <input
                      id="po-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      placeholder="e.g. 98765 43210"
                      maxLength={25}
                      aria-invalid={!!errors.phone}
                      className={`mt-1.5 ${inputClass(errors.phone)}`}
                    />
                    <FieldError msg={errors.phone} />
                  </div>
                  <div>
                    <label htmlFor="po-email" className={fieldLabel}>
                      Email <Optional />
                    </label>
                    <input
                      id="po-email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="For order updates by email"
                      maxLength={254}
                      aria-invalid={!!errors.email}
                      className={`mt-1.5 ${inputClass(errors.email)}`}
                    />
                    <FieldError msg={errors.email} />
                  </div>
                  <div className="sm:col-span-2 space-y-3">
                    <span className={fieldLabel}>WhatsApp Number</span>
                    <label className="flex items-center gap-2.5 cursor-pointer text-sm text-brand-slate">
                      <input
                        type="checkbox"
                        checked={form.whatsappSame}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, whatsappSame: e.target.checked }));
                          if (errors.whatsapp) setErrors((x) => ({ ...x, whatsapp: '' }));
                        }}
                        className="h-4 w-4 shrink-0 accent-[#5812B8]"
                      />
                      Same as my mobile number
                    </label>
                    {!form.whatsappSame && (
                      <div>
                        <label htmlFor="po-whatsapp" className="sr-only">
                          WhatsApp number
                        </label>
                        <input
                          id="po-whatsapp"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          value={form.whatsapp}
                          onChange={(e) => update('whatsapp', e.target.value)}
                          placeholder="Your WhatsApp number, e.g. 98765 43210"
                          maxLength={25}
                          aria-invalid={!!errors.whatsapp}
                          className={inputClass(errors.whatsapp)}
                        />
                      </div>
                    )}
                    <FieldError msg={errors.whatsapp} />
                  </div>
                </div>
              </Step>

              {/* 03 — Delivery address */}
              <Step n="03" title="Delivery Address" hint="Where should we deliver your order?">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <label htmlFor="po-address" className={fieldLabel}>
                      Complete Address <Required />
                    </label>
                    <textarea
                      id="po-address"
                      rows={2}
                      autoComplete="street-address"
                      value={form.address}
                      onChange={(e) => update('address', e.target.value)}
                      placeholder="House / flat no., building, street, area and landmark"
                      maxLength={300}
                      aria-invalid={!!errors.address}
                      className={`mt-1.5 resize-none ${inputClass(errors.address)}`}
                    />
                    <FieldError msg={errors.address} />
                  </div>
                  <div>
                    <label htmlFor="po-city" className={fieldLabel}>
                      City <Required />
                    </label>
                    <input
                      id="po-city"
                      type="text"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={(e) => update('city', e.target.value)}
                      placeholder="e.g. Hyderabad"
                      maxLength={60}
                      aria-invalid={!!errors.city}
                      className={`mt-1.5 ${inputClass(errors.city)}`}
                    />
                    <FieldError msg={errors.city} />
                  </div>
                  <div>
                    <label htmlFor="po-pinCode" className={fieldLabel}>
                      PIN Code <Required />
                    </label>
                    <input
                      id="po-pinCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={form.pinCode}
                      onChange={(e) => update('pinCode', e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="e.g. 500068"
                      maxLength={7}
                      aria-invalid={!!errors.pinCode}
                      className={`mt-1.5 ${inputClass(errors.pinCode)}`}
                    />
                    <FieldError msg={errors.pinCode} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="po-state" className={fieldLabel}>
                      State <Required />
                    </label>
                    <select
                      id="po-state"
                      autoComplete="address-level1"
                      value={form.state}
                      onChange={(e) => update('state', e.target.value)}
                      aria-invalid={!!errors.state}
                      className={`mt-1.5 ${inputClass(errors.state)}`}
                    >
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <FieldError msg={errors.state} />
                  </div>
                </div>
              </Step>

              {/* 04 — Updates & instructions */}
              <Step n="04" title="Updates & Instructions">
                <div className="space-y-5">
                  <div className="p-4 rounded-sm border border-brand-lavender/50 bg-brand-lavender-pure/90">
                    <label htmlFor="po-wa-optin" className="flex items-start gap-3 cursor-pointer">
                      <input
                        id="po-wa-optin"
                        type="checkbox"
                        checked={waOptIn}
                        onChange={(e) => setWaOptIn(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#5812B8]"
                      />
                      <span className="text-sm text-brand-slate leading-relaxed">
                        <span className="font-semibold text-brand-purple">WhatsApp order updates </span>
                        <span className="text-brand-slate/60">(optional)</span>
                        <span className="block text-xs text-brand-slate/75 mt-1">{WHATSAPP_CONSENT_TEXT}</span>
                        {waOptIn && updatesTo && (
                          <span className="block text-xs font-semibold text-brand-purple mt-1.5">Updates will be sent to {updatesTo}.</span>
                        )}
                      </span>
                    </label>
                  </div>
                  <div>
                    <label htmlFor="po-instructions" className={fieldLabel}>
                      Additional Instructions <Optional />
                    </label>
                    <textarea
                      id="po-instructions"
                      rows={3}
                      value={form.instructions}
                      onChange={(e) => update('instructions', e.target.value)}
                      placeholder="e.g. Preferred delivery time, gate number, call before arriving…"
                      maxLength={1000}
                      aria-invalid={!!errors.instructions}
                      className={`mt-1.5 resize-none ${inputClass(errors.instructions)}`}
                    />
                    <FieldError msg={errors.instructions} />
                  </div>
                </div>
              </Step>
            </fieldset>

            {/* Summary + place order */}
            <aside className="lg:col-span-5 lg:sticky lg:top-24">
              <div className="rounded-frame border border-brand-lavender/50 shadow-luxury-lg overflow-hidden bg-white">
                <div className="flex items-center justify-between gap-3 px-5 py-3 bg-purple-gradient">
                  <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-bold text-white">
                    <ShoppingBag className="w-4 h-4 text-brand-purple-light" aria-hidden="true" />
                    Your Order
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-brand-lavender">
                    {totalBottles ? formatBottles(totalBottles) : 'No bottles yet'}
                  </span>
                </div>

                <div className="p-5 sm:p-6 space-y-4" aria-live="polite">
                  {lines.length ? (
                    <ul className="divide-y divide-brand-bronze/20">
                      {lines.map((l) => (
                        <li key={l.product.code} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0">
                            <span className="font-semibold text-brand-purple">{l.product.name}</span>
                            <span className="block text-xs text-brand-slate/70">
                              {formatBottles(l.qty)}
                              {l.product.unitPricePaise != null && ` × ${formatRupees(l.product.unitPricePaise)}`}
                            </span>
                          </span>
                          <span className="font-semibold text-brand-slate-deep whitespace-nowrap">
                            {l.product.unitPricePaise != null ? formatRupees(l.qty * l.product.unitPricePaise) : 'To be confirmed'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-brand-slate/70">Choose a bottle size and enter how many bottles you need.</p>
                  )}

                  <div className="flex items-baseline justify-between gap-3 border-t border-brand-lavender/40 pt-3">
                    <span className="text-xs uppercase tracking-[0.18em] font-bold text-brand-purple">Total</span>
                    <span className="font-editorial text-2xl sm:text-3xl text-brand-purple text-right">
                      {total != null ? formatRupees(total) : lines.length ? 'To be confirmed' : '—'}
                    </span>
                  </div>
                  {lines.length > 0 && total == null && (
                    <p className="text-xs text-brand-slate/70">
                      {anyPriceListed ? 'Some sizes do not have a price listed online yet.' : 'Prices are not listed online yet.'} PRIME H₂O will
                      confirm the amount with you when your order is confirmed.
                    </p>
                  )}

                  <p className="flex items-start gap-2 text-xs text-brand-slate/75">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-purple" aria-hidden="true" />
                    <span>Every order is reviewed by PRIME H₂O and confirmed with you before delivery. Delivery and payment are arranged when your order is confirmed.</span>
                  </p>

                  {server.phase === 'error' && (
                    <div role="alert" className="p-3.5 rounded-sm border border-red-200 bg-red-50 text-sm text-red-900">
                      <strong className="block">Your order was not placed.</strong>
                      {server.error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="group w-full disabled:opacity-75 disabled:cursor-wait inline-flex items-center justify-center gap-3 py-4 px-6 text-sm font-bold uppercase tracking-[0.2em] bg-purple-gradient text-white rounded-sm shadow-luxury-lg border border-brand-lavender/60 hover:shadow-purple-glow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                  >
                    {submitting ? (
                      <>
                        <LoaderCircle className="w-5 h-5 animate-spin text-brand-purple-light" aria-hidden="true" />
                        Placing your order…
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5 text-brand-purple-light transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
                        {server.phase === 'error' ? 'Try Again' : 'Place Order'}
                      </>
                    )}
                  </button>

                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-brand-slate/65">
                    <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-purple" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold text-brand-slate/80">Privacy:</strong> PRIME H₂O stores the details you enter to process,
                      deliver and update you about this order. They are visible only to PRIME H₂O staff, and are shared with our messaging providers
                      (Brevo for email, Meta for WhatsApp) only to send your order updates. WhatsApp updates are sent only if you tick the box above.
                    </span>
                  </p>
                </div>
              </div>
            </aside>
          </form>
        )}
      </div>
    </section>
  );
};

// ------------------------------------------------------------------ confirmation

const OrderConfirmation: React.FC<{ result: ProductOrderResult; onNewOrder: () => void }> = ({ result, onNewOrder }) => {
  const [copied, setCopied] = useState(false);
  const o = result.order;
  const id = result.orderId ?? result.enquiryId;
  const placed = o
    ? new Date(o.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  // Only report what the notification service actually confirmed.
  const wa = result.customerWhatsApp ? { ...result.customerWhatsApp, to: formatPhone(result.customerWhatsApp.to) } : null;
  const notices = [
    result.duplicate ? 'We had already received this order, so it was not placed twice.' : '',
    emailStatusText(result.customerEmail, 'order'),
    whatsAppStatusText(wa),
    wa?.status === 'failed' ? 'We could not send your WhatsApp confirmation just now, but your order is saved and our team has it.' : '',
  ].filter(Boolean);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the ID is selectable */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      role="status"
      aria-live="polite"
      className="mt-12 md:mt-16 max-w-5xl mx-auto rounded-frame border border-brand-lavender/60 bg-white shadow-luxury-lg overflow-hidden"
    >
      <div className="bg-purple-gradient px-6 py-8 sm:px-10 sm:py-10 text-center text-white">
        <CircleCheck className="w-12 h-12 mx-auto text-brand-purple-light" aria-hidden="true" />
        <h3 className="mt-3 font-editorial text-3xl sm:text-4xl">Order Successfully Received</h3>
        <p className="mt-2 text-sm text-white/80">Thank you for choosing PRIME H₂O{o ? `, ${o.customer.name}` : ''}.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span className="text-[11px] uppercase tracking-[0.24em] text-brand-lavender">Order ID</span>
          <span className="font-mono text-xl sm:text-2xl font-bold tracking-wider select-all">{id}</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-sm border border-brand-lavender/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] hover:bg-white/10 transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-brand-purple-light" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="mt-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-brand-lavender/60 px-3 py-1 text-xs font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
            Status: Received — Awaiting Confirmation
          </span>
        </div>
        {placed && <p className="mt-2 text-xs text-white/70">Placed {placed} IST</p>}
      </div>

      <div className="p-6 sm:p-10 space-y-8">
        <div className="max-w-2xl mx-auto text-center space-y-2 text-sm sm:text-base text-brand-slate leading-relaxed">
          <p>
            Your order has been saved. <strong>Our team will review it and confirm it with you</strong> before delivery. Please keep your Order ID
            for any questions.
          </p>
          {notices.length > 0 && <p className="text-sm text-brand-slate/80">{notices.join(' ')}</p>}
        </div>

        {o && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-sm border border-brand-lavender/40 bg-brand-lavender-pure/80 p-5">
              <h4 className="text-[11px] uppercase tracking-[0.22em] font-bold text-brand-purple">Order Summary</h4>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-brand-slate/60">
                    <th className="pb-2 font-semibold">Product</th>
                    <th className="pb-2 font-semibold text-right">Qty</th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-bronze/20">
                  {o.items.map((i) => (
                    <tr key={i.code} className="align-top">
                      <td className="py-2 pr-2">
                        <span className="font-semibold text-brand-purple">{i.name}</span>
                        <span className="block text-xs text-brand-slate/70">
                          {i.unitPricePaise != null ? `${formatRupees(i.unitPricePaise)} per bottle` : 'Price to be confirmed'}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">{i.quantity.toLocaleString('en-IN')}</td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap font-semibold">
                        {i.lineTotalPaise != null ? formatRupees(i.lineTotalPaise) : 'To be confirmed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-brand-lavender/50">
                    <td colSpan={2} className="pt-3 text-[11px] uppercase tracking-[0.18em] font-bold text-brand-purple">
                      Total
                    </td>
                    <td className="pt-3 text-right font-editorial text-xl text-brand-purple whitespace-nowrap">
                      {o.totalPaise != null ? formatRupees(o.totalPaise) : 'To be confirmed'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="rounded-sm border border-brand-lavender/40 bg-brand-lavender-pure/80 p-5 space-y-4 text-sm">
              <div>
                <h4 className="text-[11px] uppercase tracking-[0.22em] font-bold text-brand-purple">Customer</h4>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-brand-slate/60">Name</dt>
                  <dd className="font-semibold text-brand-slate-deep break-words">{o.customer.name}</dd>
                  <dt className="text-brand-slate/60">Mobile</dt>
                  <dd>{formatPhone(o.customer.phone)}</dd>
                  <dt className="text-brand-slate/60">WhatsApp</dt>
                  <dd>
                    {o.customer.whatsapp ? formatPhone(o.customer.whatsapp) : '—'}
                    <span className="block text-xs text-brand-slate/60">{o.whatsappOptIn ? 'Order updates on WhatsApp: yes' : 'No WhatsApp updates'}</span>
                  </dd>
                  <dt className="text-brand-slate/60">Email</dt>
                  <dd className="[overflow-wrap:anywhere]">{o.customer.email || '—'}</dd>
                </dl>
              </div>
              <div>
                <h4 className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-purple">
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Delivery Address
                </h4>
                <address className="mt-2 not-italic text-brand-slate-deep leading-relaxed whitespace-pre-line break-words">
                  {o.delivery.address}
                  {'\n'}
                  {o.delivery.city}, {o.delivery.state} – {o.delivery.pinCode}
                </address>
              </div>
              {o.instructions && (
                <div>
                  <h4 className="text-[11px] uppercase tracking-[0.22em] font-bold text-brand-purple">Instructions</h4>
                  <p className="mt-2 text-brand-slate whitespace-pre-wrap break-words">{o.instructions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-sm border border-brand-lavender/40 p-5 text-sm text-brand-slate">
          <p className="font-semibold text-brand-purple">Questions about your order? Quote {id}.</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <a href={whatsappUrlWithText(`Hi PRIME H₂O! I placed order ${id} on your website.`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-brand-purple hover:underline underline-offset-2">
              <MessageCircle className="w-4 h-4 text-brand-purple" aria-hidden="true" /> WhatsApp {WHATSAPP_DISPLAY}
            </a>
            <a href={`tel:${BUSINESS_PHONE}`} className="inline-flex items-center gap-2 text-brand-purple hover:underline underline-offset-2">
              <Phone className="w-4 h-4 text-brand-purple" aria-hidden="true" /> Call {BUSINESS_PHONE}
            </a>
            <a href={`mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent(`Order ${id}`)}`} className="inline-flex items-center gap-2 text-brand-purple hover:underline underline-offset-2 [overflow-wrap:anywhere]">
              <Mail className="w-4 h-4 text-brand-purple" aria-hidden="true" /> {BUSINESS_EMAIL}
            </a>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onNewOrder}
            className="inline-flex items-center justify-center gap-2 py-3 px-6 text-xs font-bold uppercase tracking-[0.16em] bg-brand-purple text-white hover:bg-brand-purple-rich transition-colors rounded-sm shadow-md"
          >
            <RotateCcw className="w-4 h-4 text-brand-purple-light" aria-hidden="true" />
            Place Another Order
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ------------------------------------------------------------------ fallback

const OrderingUnavailable: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="mt-12 md:mt-16 max-w-2xl mx-auto text-center rounded-frame border border-brand-lavender/50 bg-white p-8 sm:p-10 shadow-luxury">
    <MessageCircle className="w-9 h-9 mx-auto text-brand-purple" aria-hidden="true" />
    <h3 className="mt-3 font-editorial text-2xl sm:text-3xl text-brand-purple">Online ordering is not available right now</h3>
    <p className="mt-2 text-sm text-brand-slate/80">You can still order straight away on WhatsApp or by phone.</p>
    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
      <a
        href={WHATSAPP_ORDER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold uppercase tracking-[0.16em] bg-brand-purple text-white hover:bg-brand-purple-rich transition-colors rounded-sm shadow-md"
      >
        <MessageCircle className="w-4 h-4 text-brand-purple-light" aria-hidden="true" /> Order on WhatsApp
      </a>
      <a
        href={`tel:${BUSINESS_PHONE}`}
        className="inline-flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold uppercase tracking-[0.16em] bg-white text-brand-purple border border-brand-purple/30 hover:bg-brand-lavender-light/60 transition-colors rounded-sm"
      >
        <Phone className="w-4 h-4 text-brand-purple" aria-hidden="true" /> Call {BUSINESS_PHONE}
      </a>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center gap-2 py-3 px-5 text-xs font-bold uppercase tracking-[0.16em] text-brand-purple hover:text-brand-purple transition-colors"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" /> Try again
      </button>
    </div>
  </div>
);
