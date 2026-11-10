import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  User,
  Heart,
  Cake,
  Megaphone,
  Check,
  ImagePlus,
  Trash2,
  PanelTop,
  PanelLeft,
  Type,
  RotateCcw,
  MessageCircle,
  Download,
  Share2,
  Eye,
  Info,
  ExternalLink,
} from 'lucide-react';
import { productsData } from './ProductCollection';
import { WHATSAPP_DISPLAY, whatsappUrlWithText } from '../lib/business';
import {
  EnquiryError,
  EnquiryResult,
  WHATSAPP_CONSENT_TEXT,
  emailStatusText,
  fileToBase64,
  newRequestId,
  submitOrder,
  whatsAppStatusText,
} from '../lib/enquiryApi';
import {
  BOTTLES,
  LABEL_COLOURS,
  LABEL_H,
  LABEL_W,
  TEMPLATES,
  colourName,
  composePreview,
  renderBottle,
  renderLabel,
  templateMeta,
  type FontId,
  type LabelDesign,
  type LayoutId,
  type SizeId,
  type TemplateId,
} from '../lib/labelRenderer';

const SIZES: SizeId[] = ['250 mL', '500 mL', '1000 mL'];
const TEMPLATE_ICONS: Record<TemplateId, React.ElementType> = {
  corporate: Building2,
  personal: User,
  wedding: Heart,
  birthday: Cake,
  promo: Megaphone,
};
const LAYOUTS: { id: LayoutId; label: string; icon: React.ElementType }[] = [
  { id: 'stacked', label: 'Logo Above', icon: PanelTop },
  { id: 'inline', label: 'Logo Beside', icon: PanelLeft },
  { id: 'text', label: 'Text Only', icon: Type },
];
const FONTS: { id: FontId; label: string; sample: string; className: string }[] = [
  { id: 'sans', label: 'Modern Sans', sample: 'Aa', className: 'font-sans font-extrabold' },
  { id: 'serif', label: 'Editorial Serif', sample: 'Aa', className: 'font-editorial italic font-semibold' },
];
// tallest bottle (1000 mL) fills the stage; smaller sizes keep their true proportion
const MAX_CROP_H = BOTTLES['1000 mL'].cropBottom - BOTTLES['1000 mL'].cropTop;

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const inputClass = (error?: string) =>
  `w-full px-4 py-3 bg-brand-cream border text-sm text-brand-brown placeholder-brand-brown/40 focus:outline-none focus:ring-1 transition-all rounded-sm ${
    error
      ? 'border-red-600 focus:ring-red-600'
      : 'border-brand-bronze/40 focus:border-brand-maroon focus:ring-brand-maroon'
  }`;

const fieldLabel = 'block text-xs uppercase tracking-[0.16em] font-bold text-brand-maroon';

const Step: React.FC<{ n: string; title: string; hint?: string; children: React.ReactNode }> = ({ n, title, hint, children }) => (
  <div className="bg-brand-cream-pure/80 border border-brand-bronze/30 rounded-sm p-5 sm:p-7 shadow-luxury">
    <div className="flex items-start gap-4 mb-5">
      <span className="font-editorial text-3xl sm:text-4xl leading-none text-brand-bronze">{n}</span>
      <div className="pt-0.5">
        <h3 className="text-xs sm:text-sm uppercase tracking-[0.2em] font-bold text-brand-maroon">{title}</h3>
        {hint && <p className="text-xs sm:text-sm text-brand-brown/70 mt-1">{hint}</p>}
      </div>
    </div>
    {children}
  </div>
);

const FieldError: React.FC<{ msg?: string }> = ({ msg }) =>
  msg ? <p className="text-xs text-red-700 font-medium mt-1.5">{msg}</p> : null;

interface LogoState {
  file: File;
  url: string;
  img: HTMLImageElement;
}

const EMPTY_ORDER = {
  name: '',
  company: '',
  phone: '',
  email: '',
  whatsapp: '',
  quantity: '',
  date: '',
  details: '',
  instructions: '',
};

export const LabelStudio: React.FC = () => {
  // ---- design state -------------------------------------------------------
  const [size, setSize] = useState<SizeId>('500 mL');
  const [template, setTemplate] = useState<TemplateId>('corporate');
  const [color, setColor] = useState(templateMeta('corporate').color);
  const [colorTouched, setColorTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [logoError, setLogoError] = useState('');
  const [logoBacking, setLogoBacking] = useState(true);
  const [layout, setLayout] = useState<LayoutId>('stacked');
  const [font, setFont] = useState<FontId>('sans');
  const [textScale, setTextScale] = useState(1);
  const [offsetY, setOffsetY] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // ---- order state --------------------------------------------------------
  const [order, setOrder] = useState(EMPTY_ORDER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [waOptIn, setWaOptIn] = useState(false); // explicit opt-in, never pre-ticked
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [server, setServer] = useState<
    { phase: 'idle' } | { phase: 'submitting' } | { phase: 'done'; result: EnquiryResult } | { phase: 'error'; error: string }
  >({ phase: 'idle' });
  // idempotency key: kept while the submitted details stay the same, so retries never duplicate
  const requestRef = useRef<{ id: string; signature: string }>({ id: newRequestId(), signature: '' });

  // ---- rendering ----------------------------------------------------------
  const [bottleImgs, setBottleImgs] = useState<Partial<Record<SizeId, HTMLImageElement>>>({});
  const [fontsTick, setFontsTick] = useState(0);
  const [showFab, setShowFab] = useState(false);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const bottleCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRefs = useRef<Partial<Record<TemplateId, HTMLCanvasElement | null>>>({});
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const logoUrlRef = useRef<string | null>(null);

  const design: LabelDesign = useMemo(
    () => ({
      template,
      color,
      title,
      message,
      logo: logo?.img ?? null,
      logoBacking,
      layout,
      font,
      textScale,
      offsetY,
    }),
    [template, color, title, message, logo, logoBacking, layout, font, textScale, offsetY],
  );

  // preload the three product photos
  useEffect(() => {
    SIZES.forEach((id) => {
      const img = new Image();
      img.onload = () => setBottleImgs((prev) => ({ ...prev, [id]: img }));
      img.src = BOTTLES[id].src;
    });
  }, []);

  // make sure the brand fonts are available to the canvas, then redraw
  useEffect(() => {
    if (!document.fonts) return;
    const faces = [
      '700 100px "Cormorant Garamond"',
      'italic 600 100px "Cormorant Garamond"',
      '600 100px "Cormorant Garamond"',
      '800 100px Manrope',
      '700 100px Manrope',
      '600 100px Manrope',
    ];
    Promise.all(faces.map((f) => document.fonts.load(f, 'PRIME Aa')))
      .catch(() => undefined)
      .finally(() => setFontsTick((t) => t + 1));
  }, []);

  // live preview: flat artwork + wrapped bottle
  useEffect(() => {
    const label = labelCanvasRef.current;
    if (!label) return;
    renderLabel(label, design);
    const img = bottleImgs[size];
    const bottle = bottleCanvasRef.current;
    if (img && bottle) renderBottle(bottle, img, BOTTLES[size], label, 2.4);
  }, [design, size, bottleImgs, fontsTick]);

  // template thumbnails (debounced — they only need to keep up loosely)
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
      const scratch = scratchRef.current;
      TEMPLATES.forEach((m) => {
        const thumb = thumbRefs.current[m.id];
        if (!thumb) return;
        renderLabel(scratch, {
          ...design,
          template: m.id,
          color: colorTouched ? color : m.color,
          font: m.id === template ? font : m.font,
        });
        const ctx = thumb.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, thumb.width, thumb.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(scratch, 0, 0, thumb.width, thumb.height);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [design, colorTouched, color, template, font, fontsTick]);

  // floating "Preview" shortcut on small screens when the preview is off-screen
  useEffect(() => {
    const sec = sectionRef.current;
    const prev = previewRef.current;
    if (!sec || !prev || !('IntersectionObserver' in window)) return;
    let secIn = false;
    let prevIn = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.target === sec) secIn = e.isIntersecting;
        if (e.target === prev) prevIn = e.isIntersecting;
      });
      setShowFab(secIn && !prevIn);
    });
    io.observe(sec);
    io.observe(prev);
    return () => io.disconnect();
  }, []);

  // release the uploaded logo's object URL on unmount
  useEffect(() => () => {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
  }, []);

  // ---- handlers -----------------------------------------------------------
  const chooseTemplate = (id: TemplateId) => {
    const m = templateMeta(id);
    setTemplate(id);
    setFont(m.font);
    if (!colorTouched) setColor(m.color);
  };

  const chooseColour = (hex: string) => {
    setColor(hex);
    setColorTouched(true);
  };

  const handleLogoFile = (file?: File | null) => {
    setLogoError('');
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml|gif)$/.test(file.type)) {
      setLogoError('Please upload a PNG, JPG, WEBP or SVG image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLogoError('Please upload an image smaller than 8 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      logoUrlRef.current = url;
      setLogo({ file, url, img });
      setLayout((l) => (l === 'text' ? 'stacked' : l));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setLogoError('That image could not be read. Please try another file.');
    };
    img.src = url;
  };

  const removeLogo = () => {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    logoUrlRef.current = null;
    setLogo(null);
  };

  const resetPlacement = () => {
    setTextScale(1);
    setOffsetY(0);
    setLayout('stacked');
    setFont(templateMeta(template).font);
  };

  const updateOrder = (key: keyof typeof EMPTY_ORDER, value: string) => {
    setOrder((o) => ({ ...o, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const logoUsed = !!logo && layout !== 'text';
  const meta = templateMeta(template);
  const bottlePct = ((BOTTLES[size].cropBottom - BOTTLES[size].cropTop) / MAX_CROP_H) * 92;
  const summaryLines = [
    `Bottle: ${size}   ·   Template: ${meta.name}`,
    `Label colour: ${colourName(color)}`,
  ];

  const layoutText = { stacked: 'Logo above text', inline: 'Logo beside text', text: 'Text only' }[logo ? layout : 'text'];
  const pos = offsetY < -0.15 ? 'raised' : offsetY > 0.15 ? 'lowered' : 'centred';
  const fontText = font === 'serif' ? 'Editorial serif' : 'Modern sans';

  const buildMessage = () => {
    const dateText = order.date
      ? new Date(`${order.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Flexible / to be discussed';
    const logoText = !logo
      ? 'None'
      : logoUsed
        ? `Uploaded on the website (${logo.file.name}); not included in this WhatsApp message.`
        : `Not used (text-only layout chosen)`;
    const lines = [
      'Hi PRIME H₂O! I would like to request a custom-label bottle order.',
      '',
      '*CUSTOMER*',
      `Name: ${order.name.trim()}`,
      `Company: ${order.company.trim() || '—'}`,
      `Phone: ${order.phone.trim()}`,
      `Email: ${order.email.trim() || '—'}`,
      '',
      '*ORDER*',
      `Bottle size: ${size}`,
      `Quantity: ${parseInt(order.quantity, 10)} bottles`,
      `Preferred delivery date: ${dateText}`,
      '',
      '*LABEL DESIGN*',
      `Template: ${meta.name}`,
      `Label colour: ${colourName(color)}`,
      `Name on label: ${title.trim()}`,
      `Message / tagline: ${message.trim() || '—'}`,
      `Layout: ${layoutText} · ${fontText} font · text size ${Math.round(textScale * 100)}% · text ${pos}`,
      `Logo / image: ${logoText}`,
    ];
    if (order.details.trim()) lines.push('', '*CUSTOMISATION DETAILS*', order.details.trim());
    if (order.instructions.trim()) lines.push('', '*ADDITIONAL INSTRUCTIONS*', order.instructions.trim());
    lines.push('', 'Please confirm pricing and availability. Thank you!');
    return lines.join('\n');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Please enter the name or brand to print on the label.';
    if (!order.name.trim()) e.name = 'Please enter your name.';
    if (!order.phone.trim()) e.phone = 'Please enter your phone number.';
    else if (!/^[0-9+\-\s()]{7,15}$/.test(order.phone.trim())) e.phone = 'Please enter a valid phone number.';
    if (!order.email.trim()) e.email = 'Please enter your email address. Your order updates are sent there.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email.trim())) e.email = 'Please enter a valid email address.';
    if (waOptIn && order.whatsapp.trim() && !/^[0-9+\-\s()]{7,18}$/.test(order.whatsapp.trim()))
      e.whatsapp = 'Please enter a valid WhatsApp number.';
    if (!order.quantity.trim()) e.quantity = 'Please enter the number of bottles you need.';
    else if (!/^\d+$/.test(order.quantity.trim()) || parseInt(order.quantity, 10) < 1)
      e.quantity = 'Please enter a whole number of bottles (1 or more).';
    if (order.date && order.date < todayISO()) e.date = 'Please choose a date from today onwards.';
    setErrors(e);
    const first = ['title', 'name', 'phone', 'email', 'whatsapp', 'quantity', 'date'].find((k) => e[k]);
    if (first) {
      const el = document.getElementById(`cl-${first}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLInputElement | null)?.focus({ preventScroll: true });
      return false;
    }
    return true;
  };

  /** Saves the enquiry (with logo + preview) on the PRIME H₂O server, which emails the team and the customer. */
  const submitToServer = async () => {
    setServer({ phase: 'submitting' });
    try {
      const label = labelCanvasRef.current;
      const bottle = bottleCanvasRef.current;
      const blob = label && bottle ? await composePreview(bottle, label, summaryLines) : null;
      if (blob) setPreviewBlob(blob);
      const details = {
        source: 'custom_bottle',
        name: order.name.trim(),
        phone: order.phone.trim(),
        email: order.email.trim(),
        whatsappOptIn: waOptIn,
        whatsapp: waOptIn ? order.whatsapp.trim() || undefined : undefined,
        company: order.company.trim() || undefined,
        bottleSize: size,
        quantity: parseInt(order.quantity, 10),
        deliveryDate: order.date || undefined,
        message: order.instructions.trim() || undefined,
        customization: {
          template: meta.name,
          colour: colourName(color),
          labelName: title.trim(),
          tagline: message.trim(),
          layout: layoutText,
          font: fontText,
          textSize: `${Math.round(textScale * 100)}%`,
          position: pos,
          details: order.details.trim(),
        },
      };
      const signature = JSON.stringify([details, logoUsed && logo ? [logo.file.name, logo.file.size, logo.file.lastModified] : null]);
      if (signature !== requestRef.current.signature) requestRef.current = { id: newRequestId(), signature };
      const result = await submitOrder({
        ...details,
        clientRequestId: requestRef.current.id,
        logo: logoUsed && logo ? { filename: logo.file.name, contentType: logo.file.type, data: await fileToBase64(logo.file) } : undefined,
        preview: blob ? { filename: 'label-preview.png', contentType: 'image/png', data: await fileToBase64(blob) } : undefined,
      });
      setServer({ phase: 'done', result });
    } catch (err) {
      if (err instanceof EnquiryError && Object.keys(err.fields).length) {
        // show the server's field errors next to the matching inputs
        const map: Record<string, string> = { deliveryDate: 'date', 'customization.labelName': 'title' };
        setErrors((x) => ({ ...x, ...Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [map[k] ?? k, v])) }));
      }
      setServer({ phase: 'error', error: err instanceof Error ? err.message : 'Your order request could not be saved.' });
    }
  };

  const handleRequest = () => {
    if (server.phase === 'submitting' || !validate()) return;
    const url = whatsappUrlWithText(buildMessage());
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;
    setSentUrl(url);
    setPreviewBlob(null);
    void submitToServer();
  };

  const downloadPreview = async () => {
    const label = labelCanvasRef.current;
    const bottle = bottleCanvasRef.current;
    if (!label || !bottle) return;
    const blob = previewBlob ?? (await composePreview(bottle, label, summaryLines));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PRIME-H2O-custom-label-${size.replace(' ', '')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const shareFiles = useMemo(() => {
    if (!previewBlob) return null;
    const files = [new File([previewBlob], 'PRIME-H2O-custom-label-preview.png', { type: 'image/png' })];
    if (logoUsed && logo) files.push(logo.file);
    try {
      return typeof navigator.canShare === 'function' && navigator.canShare({ files }) ? files : null;
    } catch {
      return null;
    }
  }, [previewBlob, logoUsed, logo]);

  const shareToChat = async () => {
    if (!shareFiles) return;
    try {
      await navigator.share({ files: shareFiles, title: 'PRIME H₂O custom label', text: 'My PRIME H₂O custom label files' });
    } catch {
      /* share sheet dismissed */
    }
  };

  // ---- render -------------------------------------------------------------
  return (
    <section
      ref={sectionRef}
      id="customize"
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 bg-cream-gradient border-t border-brand-bronze/25 scroll-mt-[72px] lg:scroll-mt-[80px] overflow-hidden"
      aria-label="Create your own PRIME custom label"
    >
      <div className="absolute top-40 -left-40 w-[480px] h-[480px] rounded-full bg-brand-bronze/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 -right-40 w-[420px] h-[420px] rounded-full bg-brand-maroon/5 blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-8 h-px bg-brand-bronze" />
            <span className="text-xs uppercase tracking-[0.28em] font-semibold text-brand-maroon">Create Your Own PRIME</span>
            <span className="w-8 h-px bg-brand-bronze" />
          </div>
          <h2 className="font-editorial text-4xl sm:text-5xl md:text-6xl font-normal text-brand-maroon leading-tight text-balance">
            Your Bottle. Your Brand.{' '}
            <span className="italic text-brand-bronze-dark">Your Identity.</span>
          </h2>
          <p className="text-base sm:text-lg text-brand-brown/85 max-w-2xl mx-auto text-balance">
            Make every bottle uniquely yours. Personalize PRIME H₂O bottles with your company logo, brand name, event
            details or personal message.
          </p>
        </div>

        <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* ================= PREVIEW (right on desktop, first on mobile) ================= */}
          <aside className="lg:col-span-5 lg:order-2">
            <div ref={previewRef} className="lg:sticky lg:top-24 scroll-mt-24">
              <div className="rounded-sm border border-brand-bronze/40 shadow-luxury-lg overflow-hidden bg-brand-cream-pure">
                <div className="flex items-center justify-between px-5 py-3 bg-maroon-gradient">
                  <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-bold text-brand-cream">
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inset-0 rounded-full bg-brand-bronze animate-ping opacity-75" />
                      <span className="relative w-2 h-2 rounded-full bg-brand-bronze" />
                    </span>
                    Live Preview
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-brand-bronze-light border border-brand-bronze/50 rounded-sm px-2.5 py-1">
                    {size}
                  </span>
                </div>

                {/* Studio stage */}
                <div className="relative h-[380px] sm:h-[440px] lg:h-[clamp(330px,50vh,460px)] flex items-end justify-center pb-6 bg-[radial-gradient(ellipse_at_50%_42%,#FFFFFF_0%,#FBF7F2_38%,#EFE2D4_100%)]">
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-brand-cream-tint/70 to-transparent pointer-events-none" />
                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-40 h-4 rounded-[50%] bg-brand-brown/20 blur-md" />
                  <canvas
                    ref={bottleCanvasRef}
                    role="img"
                    aria-label={`Preview of a ${size} PRIME H₂O bottle with your custom ${meta.name} label`}
                    className="relative w-auto max-w-full transition-[height] duration-500 ease-out drop-shadow-[0_18px_22px_rgba(73,48,43,0.18)]"
                    style={{ height: `${bottlePct}%` }}
                  />
                  {!bottleImgs[size] && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-brand-brown/60">
                      Loading bottle…
                    </div>
                  )}
                </div>

                {/* Flat artwork + summary */}
                <div className="grid grid-cols-5 gap-4 p-4 sm:p-5 border-t border-brand-bronze/25 bg-brand-cream-light">
                  <div className="col-span-3">
                    <span className="block text-[10px] uppercase tracking-[0.22em] font-bold text-brand-bronze-dark mb-1.5">
                      Label Artwork
                    </span>
                    <canvas
                      ref={labelCanvasRef}
                      width={LABEL_W}
                      height={LABEL_H}
                      role="img"
                      aria-label="Flat view of your label artwork"
                      className="w-full h-auto rounded-sm border border-brand-bronze/40 shadow-sm"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col justify-between gap-3 text-xs text-brand-brown">
                    <dl className="space-y-1.5">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-brand-brown/60">Template</dt>
                        <dd className="font-semibold text-brand-maroon leading-snug">{meta.name}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-brand-brown/60">Colour</dt>
                        <dd className="flex items-center gap-1.5 font-semibold text-brand-maroon">
                          <span className="w-3 h-3 rounded-full border border-brand-bronze/60" style={{ background: color }} />
                          {colourName(color).replace(/ \(.*\)$/, '')}
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={downloadPreview}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] text-brand-maroon border border-brand-maroon/30 hover:bg-brand-cream-dark/60 transition-colors rounded-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-brand-bronze-dark" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-brand-brown/65 text-center">
                Digital preview for reference. Final print proof is shared by PRIME H₂O before production.
              </p>
            </div>
          </aside>

          {/* ================= CONFIGURATOR ================= */}
          <div className="lg:col-span-7 lg:order-1 space-y-6">
            {/* 01 — Bottle */}
            <Step n="01" title="Choose Your Bottle" hint="Select from our PRIME H₂O sizes.">
              <div className="grid grid-cols-3 gap-3 sm:gap-4" role="radiogroup" aria-label="Bottle size">
                {SIZES.map((s) => {
                  const p = productsData.find((x) => x.size === s);
                  const active = s === size;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSize(s)}
                      className={`group relative flex flex-col items-center gap-2 pt-4 pb-3 px-2 rounded-sm border transition-all duration-300 hover:-translate-y-0.5 ${
                        active
                          ? 'border-brand-maroon ring-1 ring-brand-maroon bg-brand-cream-light shadow-luxury'
                          : 'border-brand-bronze/35 bg-brand-cream hover:border-brand-bronze'
                      }`}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-maroon flex items-center justify-center">
                          <Check className="w-3 h-3 text-brand-cream" />
                        </span>
                      )}
                      <div className="h-24 sm:h-32 flex items-end">
                        <img
                          src={BOTTLES[s].src}
                          alt=""
                          className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                          style={{ height: `${((BOTTLES[s].cropBottom - BOTTLES[s].cropTop) / MAX_CROP_H) * 100}%` }}
                        />
                      </div>
                      <span className="font-editorial text-xl sm:text-2xl font-semibold text-brand-maroon leading-none">{s}</span>
                      {p && (
                        <span className="hidden sm:block text-[10px] uppercase tracking-[0.14em] text-brand-brown/70 text-center leading-tight">
                          {p.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Step>

            {/* 02 — Template */}
            <Step n="02" title="Select a Label Template" hint="Each design updates live with your name, logo and colour.">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" role="radiogroup" aria-label="Label template">
                {TEMPLATES.map((m) => {
                  const Icon = TEMPLATE_ICONS[m.id];
                  const active = m.id === template;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => chooseTemplate(m.id)}
                      className={`group text-left rounded-sm border overflow-hidden transition-all duration-300 hover:-translate-y-0.5 ${
                        active
                          ? 'border-brand-maroon ring-1 ring-brand-maroon shadow-luxury bg-brand-cream-light'
                          : 'border-brand-bronze/35 bg-brand-cream hover:border-brand-bronze hover:shadow-luxury'
                      }`}
                    >
                      <div className="relative">
                        <canvas
                          ref={(el) => {
                            thumbRefs.current[m.id] = el;
                          }}
                          width={292}
                          height={200}
                          aria-hidden="true"
                          className="block w-full h-auto"
                        />
                        {active && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-maroon border border-brand-bronze flex items-center justify-center">
                            <Check className="w-3 h-3 text-brand-cream" />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 sm:p-3">
                        <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.1em] text-brand-maroon leading-tight">
                          <Icon className="w-3.5 h-3.5 shrink-0 text-brand-bronze-dark" />
                          {m.name}
                        </span>
                        <span className="hidden sm:block mt-1 text-[11px] text-brand-brown/70 leading-snug">{m.blurb}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Step>

            {/* 03 — Personalise */}
            <Step n="03" title="Personalize Your Label" hint="Your name, logo and message appear on the bottle instantly.">
              <div className="space-y-5">
                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="cl-title" className={fieldLabel}>
                      Company or Personal Name <span className="text-brand-maroon-rich">*</span>
                    </label>
                    <span className="text-[11px] text-brand-brown/50">{title.length}/40</span>
                  </div>
                  <input
                    id="cl-title"
                    type="text"
                    maxLength={40}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (errors.title) setErrors((x) => ({ ...x, title: '' }));
                    }}
                    placeholder={`e.g. ${meta.sampleTitle}`}
                    className={`mt-1.5 ${inputClass(errors.title)}`}
                  />
                  <FieldError msg={errors.title} />
                </div>

                <div>
                  <span className={fieldLabel}>Logo or Personal Image</span>
                  {logo ? (
                    <div className="mt-1.5 flex items-center gap-4 p-3 border border-brand-bronze/40 rounded-sm bg-brand-cream">
                      <div className="w-16 h-16 rounded-sm bg-white border border-brand-bronze/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={logo.url} alt="Your uploaded logo" className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-brand-maroon truncate">{logo.file.name}</p>
                        <p className="text-xs text-brand-brown/60">{(logo.file.size / 1024).toFixed(0)} KB · shown on your label</p>
                        <label className="mt-1 inline-block text-xs font-semibold text-brand-bronze-dark underline cursor-pointer hover:text-brand-maroon">
                          Replace
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                            className="sr-only"
                            onChange={(e) => {
                              handleLogoFile(e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="p-2 text-brand-brown/60 hover:text-brand-maroon transition-colors"
                        aria-label="Remove logo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        handleLogoFile(e.dataTransfer.files?.[0]);
                      }}
                      className={`mt-1.5 flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-sm cursor-pointer transition-colors text-center ${
                        dragOver ? 'border-brand-maroon bg-brand-cream-dark/50' : 'border-brand-bronze/50 bg-brand-cream hover:border-brand-maroon/60'
                      }`}
                    >
                      <span className="w-11 h-11 rounded-full bg-brand-maroon flex items-center justify-center">
                        <ImagePlus className="w-5 h-5 text-brand-bronze-light" />
                      </span>
                      <span className="text-sm font-semibold text-brand-maroon">Upload your logo or image</span>
                      <span className="text-xs text-brand-brown/60">PNG, JPG, WEBP or SVG · up to 8 MB · drag &amp; drop or tap</span>
                      <input
                        id="cl-logo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        className="sr-only"
                        onChange={(e) => {
                          handleLogoFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <FieldError msg={logoError} />
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="cl-message" className={fieldLabel}>
                      Custom Message or Tagline
                    </label>
                    <span className="text-[11px] text-brand-brown/50">{message.length}/80</span>
                  </div>
                  <input
                    id="cl-message"
                    type="text"
                    maxLength={80}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`e.g. ${meta.sampleMessage}`}
                    className={`mt-1.5 ${inputClass()}`}
                  />
                </div>
              </div>
            </Step>

            {/* 04 — Colour */}
            <Step n="04" title="Label Colour" hint="Choose a PRIME signature shade, or match your own brand colour.">
              <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Label colour">
                {LABEL_COLOURS.map((c) => {
                  const active = c.hex.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={c.name}
                      aria-label={c.name}
                      onClick={() => chooseColour(c.hex)}
                      className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full border transition-all duration-200 hover:scale-110 ${
                        active ? 'ring-2 ring-offset-2 ring-offset-brand-cream-pure ring-brand-maroon border-transparent' : 'border-brand-bronze/50'
                      }`}
                      style={{ background: c.hex }}
                    >
                      {active && (
                        <Check
                          className={`absolute inset-0 m-auto w-4 h-4 ${['#F8EFE5', '#FFFFFF', '#C69A70'].includes(c.hex) ? 'text-brand-maroon' : 'text-brand-cream'}`}
                        />
                      )}
                    </button>
                  );
                })}
                <label
                  className={`relative inline-flex items-center gap-2 h-10 sm:h-11 pl-1 pr-3 rounded-full border cursor-pointer transition-colors ${
                    LABEL_COLOURS.some((c) => c.hex.toLowerCase() === color.toLowerCase())
                      ? 'border-brand-bronze/50 hover:border-brand-maroon'
                      : 'border-brand-maroon ring-1 ring-brand-maroon'
                  }`}
                  title="Pick a custom colour"
                >
                  <span
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-brand-bronze/50"
                    style={{ background: 'conic-gradient(from 0deg, #500D18, #C69A70, #F8EFE5, #49302B, #6E1624, #500D18)' }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-maroon">Custom</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => chooseColour(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Custom label colour"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-brand-brown/70">
                Selected: <span className="font-semibold text-brand-maroon">{colourName(color)}</span>
              </p>
            </Step>

            {/* 05 — Text & placement */}
            <Step n="05" title="Text & Placement" hint="Fine-tune the layout, typeface and position of your text.">
              <div className="space-y-5">
                <div>
                  <span className={fieldLabel}>Layout</span>
                  <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Label layout">
                    {LAYOUTS.map((l) => {
                      const Icon = l.icon;
                      const active = (logo ? layout : 'text') === l.id;
                      const disabled = !logo && l.id !== 'text';
                      return (
                        <button
                          key={l.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={disabled}
                          onClick={() => setLayout(l.id)}
                          title={disabled ? 'Upload a logo to use this layout' : l.label}
                          className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] rounded-sm border transition-all ${
                            active
                              ? 'bg-brand-maroon text-brand-cream border-brand-maroon'
                              : 'bg-brand-cream text-brand-maroon border-brand-bronze/40 hover:border-brand-maroon'
                          } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-brand-bronze/40`}
                        >
                          <Icon className={`w-4 h-4 ${active ? 'text-brand-bronze-light' : 'text-brand-bronze-dark'}`} />
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                  {!logo && <p className="mt-1.5 text-[11px] text-brand-brown/60">Upload a logo in step 03 to unlock logo layouts.</p>}
                </div>

                <div>
                  <span className={fieldLabel}>Typeface</span>
                  <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Typeface">
                    {FONTS.map((f) => {
                      const active = f.id === font;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setFont(f.id)}
                          className={`flex items-center justify-center gap-2.5 py-2.5 px-3 rounded-sm border transition-all ${
                            active
                              ? 'bg-brand-maroon text-brand-cream border-brand-maroon'
                              : 'bg-brand-cream text-brand-maroon border-brand-bronze/40 hover:border-brand-maroon'
                          }`}
                        >
                          <span className={`text-xl leading-none ${f.className}`}>{f.sample}</span>
                          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em]">{f.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="cl-scale" className={fieldLabel}>
                        Text Size
                      </label>
                      <span className="text-xs font-semibold text-brand-bronze-dark">{Math.round(textScale * 100)}%</span>
                    </div>
                    <input
                      id="cl-scale"
                      type="range"
                      min={0.75}
                      max={1.3}
                      step={0.05}
                      value={textScale}
                      onChange={(e) => setTextScale(parseFloat(e.target.value))}
                      className="mt-2 w-full accent-brand-maroon cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="cl-offset" className={fieldLabel}>
                        Vertical Position
                      </label>
                      <span className="text-xs font-semibold text-brand-bronze-dark">
                        {offsetY < -0.15 ? 'Higher' : offsetY > 0.15 ? 'Lower' : 'Centred'}
                      </span>
                    </div>
                    <input
                      id="cl-offset"
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={offsetY}
                      onChange={(e) => setOffsetY(parseFloat(e.target.value))}
                      className="mt-2 w-full accent-brand-maroon cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {logoUsed ? (
                    <label className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-brand-brown">
                      <input
                        type="checkbox"
                        checked={logoBacking}
                        onChange={(e) => setLogoBacking(e.target.checked)}
                        className="w-4 h-4 accent-brand-maroon"
                      />
                      Place logo on a white badge
                      <span className="text-[11px] text-brand-brown/55">(turn off for photos)</span>
                    </label>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={resetPlacement}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand-bronze-dark hover:text-brand-maroon transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset placement
                  </button>
                </div>
              </div>
            </Step>

            {/* 06 — Order details */}
            <Step n="06" title="Your Order Details" hint="Tell us how many bottles you need. We'll confirm pricing and availability.">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="cl-name" className={fieldLabel}>
                      Your Name <span className="text-brand-maroon-rich">*</span>
                    </label>
                    <input
                      id="cl-name"
                      type="text"
                      autoComplete="name"
                      value={order.name}
                      onChange={(e) => updateOrder('name', e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className={`mt-1.5 ${inputClass(errors.name)}`}
                    />
                    <FieldError msg={errors.name} />
                  </div>
                  <div>
                    <label htmlFor="cl-company" className={fieldLabel}>
                      Company Name <span className="normal-case tracking-normal font-medium text-brand-brown/55">(optional)</span>
                    </label>
                    <input
                      id="cl-company"
                      type="text"
                      autoComplete="organization"
                      value={order.company}
                      onChange={(e) => updateOrder('company', e.target.value)}
                      placeholder="e.g. Acme Technologies"
                      className={`mt-1.5 ${inputClass()}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="cl-phone" className={fieldLabel}>
                      Phone Number <span className="text-brand-maroon-rich">*</span>
                    </label>
                    <input
                      id="cl-phone"
                      type="tel"
                      autoComplete="tel"
                      value={order.phone}
                      onChange={(e) => updateOrder('phone', e.target.value)}
                      placeholder="e.g. 98765 43210"
                      className={`mt-1.5 ${inputClass(errors.phone)}`}
                    />
                    <FieldError msg={errors.phone} />
                  </div>
                  <div>
                    <label htmlFor="cl-email" className={fieldLabel}>
                      Email <span className="text-brand-maroon-rich">*</span>
                    </label>
                    <input
                      id="cl-email"
                      type="email"
                      autoComplete="email"
                      value={order.email}
                      onChange={(e) => updateOrder('email', e.target.value)}
                      placeholder="e.g. yourname@domain.com"
                      className={`mt-1.5 ${inputClass(errors.email)}`}
                    />
                    <FieldError msg={errors.email} />
                  </div>
                  <div>
                    <label htmlFor="cl-size" className={fieldLabel}>
                      Bottle Size
                    </label>
                    <select
                      id="cl-size"
                      value={size}
                      onChange={(e) => setSize(e.target.value as SizeId)}
                      className={`mt-1.5 ${inputClass()}`}
                    >
                      {SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cl-quantity" className={fieldLabel}>
                      Quantity (bottles) <span className="text-brand-maroon-rich">*</span>
                    </label>
                    <input
                      id="cl-quantity"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={order.quantity}
                      onChange={(e) => updateOrder('quantity', e.target.value)}
                      placeholder="e.g. 500"
                      className={`mt-1.5 ${inputClass(errors.quantity)}`}
                    />
                    <FieldError msg={errors.quantity} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="cl-date" className={fieldLabel}>
                      Preferred Delivery Date <span className="normal-case tracking-normal font-medium text-brand-brown/55">(optional)</span>
                    </label>
                    <input
                      id="cl-date"
                      type="date"
                      min={todayISO()}
                      value={order.date}
                      onChange={(e) => updateOrder('date', e.target.value)}
                      className={`mt-1.5 ${inputClass(errors.date)}`}
                    />
                    <FieldError msg={errors.date} />
                  </div>
                </div>
                <div className="p-4 rounded-sm border border-brand-bronze/40 bg-brand-cream-light/70 space-y-3">
                  <label htmlFor="cl-wa-optin" className="flex items-start gap-3 cursor-pointer">
                    <input
                      id="cl-wa-optin"
                      type="checkbox"
                      checked={waOptIn}
                      onChange={(e) => {
                        setWaOptIn(e.target.checked);
                        if (errors.whatsapp) setErrors((x) => ({ ...x, whatsapp: '' }));
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#500D18]"
                    />
                    <span className="text-sm text-brand-brown leading-relaxed">
                      <span className="font-semibold text-brand-maroon">WhatsApp order updates </span>
                      <span className="text-brand-brown/60">(optional)</span>
                      <span className="block text-xs text-brand-brown/75 mt-1">{WHATSAPP_CONSENT_TEXT}</span>
                    </span>
                  </label>
                  {waOptIn && (
                    <div className="pl-7">
                      <label htmlFor="cl-whatsapp" className={fieldLabel}>
                        WhatsApp Number{' '}
                        <span className="normal-case tracking-normal font-medium text-brand-brown/55">(leave blank if same as phone)</span>
                      </label>
                      <input
                        id="cl-whatsapp"
                        type="tel"
                        autoComplete="tel"
                        value={order.whatsapp}
                        onChange={(e) => updateOrder('whatsapp', e.target.value)}
                        placeholder={order.phone.trim() || 'e.g. 98765 43210'}
                        className={`mt-1.5 ${inputClass(errors.whatsapp)}`}
                      />
                      <FieldError msg={errors.whatsapp} />
                    </div>
                  )}
                  <p className="text-xs text-brand-brown/65 pl-7">
                    Your order request, our decision and every status update are always sent to your email.
                  </p>
                </div>
                <div>
                  <label htmlFor="cl-details" className={fieldLabel}>
                    Customization Details
                  </label>
                  <textarea
                    id="cl-details"
                    rows={3}
                    value={order.details}
                    onChange={(e) => updateOrder('details', e.target.value)}
                    placeholder="e.g. Use our exact brand colour, event name and date, wording changes, number of label versions…"
                    className={`mt-1.5 resize-none ${inputClass()}`}
                  />
                </div>
                <div>
                  <label htmlFor="cl-instructions" className={fieldLabel}>
                    Additional Instructions
                  </label>
                  <textarea
                    id="cl-instructions"
                    rows={3}
                    value={order.instructions}
                    onChange={(e) => updateOrder('instructions', e.target.value)}
                    placeholder="e.g. Delivery location, packing preferences, contact person at the venue…"
                    className={`mt-1.5 resize-none ${inputClass()}`}
                  />
                </div>
              </div>
            </Step>

            {/* Request */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleRequest}
                disabled={server.phase === 'submitting'}
                className="group w-full disabled:opacity-75 disabled:cursor-wait inline-flex items-center justify-center gap-3 py-5 px-6 text-sm sm:text-base font-bold uppercase tracking-[0.2em] bg-maroon-gradient text-brand-cream rounded-sm shadow-luxury-lg border border-brand-bronze/50 hover:shadow-bronze-glow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
              >
                <MessageCircle className="w-5 h-5 text-brand-bronze transition-transform duration-300 group-hover:scale-110" />
                Request Custom Bottle Order
              </button>
              <p className="flex items-start justify-center gap-2 text-xs text-brand-brown/70 text-center">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-bronze-dark" />
                <span>
                  Sends your order request and label design to PRIME H₂O and opens WhatsApp ({WHATSAPP_DISPLAY}) with the details
                  pre-filled. Every order is reviewed by PRIME H₂O before it is confirmed.
                </span>
              </p>

              <AnimatePresence>
                {sentUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="status"
                    className="p-5 sm:p-6 bg-brand-cream-pure border border-brand-bronze/50 rounded-sm shadow-luxury space-y-4"
                  >
                    <div>
                      {server.phase === 'done' ? (
                        <>
                          <h4 className="font-editorial text-2xl text-brand-maroon font-semibold">Order request received</h4>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-brand-brown/80">
                            Order ID{' '}
                            <span className="font-bold text-brand-maroon tracking-[0.12em] select-all">{server.result.enquiryId}</span>
                            <span className="ml-2 inline-block px-2 py-0.5 rounded-sm bg-brand-bronze/20 text-brand-maroon tracking-[0.1em] normal-case font-semibold">
                              Awaiting confirmation
                            </span>
                          </p>
                          <p className="mt-2 text-sm text-brand-brown leading-relaxed">
                            Your order request and label design have reached PRIME H₂O. <strong>This is not an order confirmation yet:</strong>{' '}
                            our team reviews every order and will let you know once it has been accepted.{' '}
                            {emailStatusText(server.result.customerEmail, 'order')} {whatsAppStatusText(server.result.customerWhatsApp)} We also
                            opened WhatsApp with the details pre-filled; tap <strong>Send</strong> there if you'd like to chat with us directly.
                          </p>
                        </>
                      ) : server.phase === 'error' ? (
                        <>
                          <h4 className="font-editorial text-2xl text-brand-maroon font-semibold">We couldn't save your order request online</h4>
                          <p className="mt-1 text-sm text-brand-brown leading-relaxed">
                            {server.error} WhatsApp has opened with your enquiry pre-filled. Tap <strong>Send</strong> there so it reaches us,
                            or try again below.
                          </p>
                        </>
                      ) : (
                        <>
                          <h4 className="font-editorial text-2xl text-brand-maroon font-semibold">Sending your order request…</h4>
                          <p className="mt-1 text-sm text-brand-brown leading-relaxed">
                            Uploading your details and label design to PRIME H₂O. WhatsApp has also opened with your enquiry pre-filled.
                          </p>
                        </>
                      )}
                    </div>
                    {logoUsed && logo && server.phase !== 'done' && (
                      <div className="p-3.5 rounded-sm bg-brand-cream border border-brand-bronze/40 text-sm text-brand-brown">
                        <strong className="text-brand-maroon">Your logo is not part of the WhatsApp message.</strong> WhatsApp links can only carry
                        text, so if you message us there, please attach <span className="font-semibold">{logo.file.name}</span> in the same chat.
                      </div>
                    )}
                    {logoUsed && logo && server.phase === 'done' && (
                      <div className="p-3.5 rounded-sm bg-brand-cream border border-brand-bronze/40 text-sm text-brand-brown">
                        Your logo <span className="font-semibold">{logo.file.name}</span> was uploaded with order request{' '}
                        <span className="font-semibold">{server.result.enquiryId}</span>, so our team already has it.
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3">
                      {server.phase === 'error' && (
                        <button
                          type="button"
                          onClick={() => void submitToServer()}
                          className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.14em] bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich transition-colors rounded-sm"
                        >
                          <RotateCcw className="w-4 h-4 text-brand-bronze" />
                          Try Again
                        </button>
                      )}
                      {shareFiles && (
                        <button
                          type="button"
                          onClick={shareToChat}
                          className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.14em] bg-brand-maroon text-brand-cream hover:bg-brand-maroon-rich transition-colors rounded-sm"
                        >
                          <Share2 className="w-4 h-4 text-brand-bronze" />
                          {logoUsed ? 'Share Logo & Preview' : 'Share Preview'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={downloadPreview}
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.14em] bg-brand-cream text-brand-maroon border border-brand-maroon/30 hover:bg-brand-cream-dark/60 transition-colors rounded-sm"
                      >
                        <Download className="w-4 h-4 text-brand-bronze-dark" />
                        Download Preview
                      </button>
                      <a
                        href={sentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.14em] bg-brand-cream text-brand-maroon border border-brand-maroon/30 hover:bg-brand-cream-dark/60 transition-colors rounded-sm"
                      >
                        <ExternalLink className="w-4 h-4 text-brand-bronze-dark" />
                        Reopen WhatsApp
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile shortcut back to the live preview */}
      <AnimatePresence>
        {showFab && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="lg:hidden fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-[0.16em] bg-brand-maroon text-brand-cream rounded-full shadow-luxury-lg border border-brand-bronze/60"
          >
            <Eye className="w-4 h-4 text-brand-bronze" />
            Preview
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
};
