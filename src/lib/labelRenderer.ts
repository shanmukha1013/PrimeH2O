// Canvas renderer for the "Create Your Own PRIME" label designer.
//
// 1. `renderLabel` paints the flat label artwork (LABEL_W × LABEL_H). The artwork
//    represents the half of the wrap-around label that faces the viewer
//    (-90° … +90° around the bottle), so content near the side edges is
//    foreshortened once it is wrapped — keep key content in the centre.
// 2. `renderBottle` draws the real PRIME product photo and wraps the artwork onto
//    the bottle's label band column by column (cylindrical projection), then adds
//    cylindrical shading and a specular highlight.

export type TemplateId = 'corporate' | 'personal' | 'wedding' | 'birthday' | 'promo';
export type LayoutId = 'stacked' | 'inline' | 'text';
export type FontId = 'serif' | 'sans';
export type SizeId = '250 mL' | '500 mL' | '1000 mL';

export interface LabelDesign {
  template: TemplateId;
  color: string;
  title: string;
  message: string;
  logo: HTMLImageElement | null;
  logoBacking: boolean;
  layout: LayoutId;
  font: FontId;
  textScale: number; // 0.75 – 1.3
  offsetY: number; // -1 (higher) … 1 (lower)
}

export const LABEL_W = 1460;
export const LABEL_H = 1000;

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  blurb: string;
  color: string;
  font: FontId;
  sampleTitle: string;
  sampleMessage: string;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'corporate',
    name: 'Corporate Branding',
    blurb: 'Clean, confident and boardroom-ready.',
    color: '#500D18',
    font: 'sans',
    sampleTitle: 'Your Company',
    sampleMessage: 'Annual Leadership Summit 2026',
  },
  {
    id: 'personal',
    name: 'Personal Branding',
    blurb: 'A refined monogram look for your name.',
    color: '#49302B',
    font: 'serif',
    sampleTitle: 'Your Name',
    sampleMessage: 'Stay refreshed, stay inspired',
  },
  {
    id: 'wedding',
    name: 'Wedding & Celebrations',
    blurb: 'Ornate ivory frame with gold detailing.',
    color: '#F8EFE5',
    font: 'serif',
    sampleTitle: 'Aarav & Diya',
    sampleMessage: 'Together Forever · 12.12.2026',
  },
  {
    id: 'birthday',
    name: 'Birthday Events',
    blurb: 'Festive bunting, confetti and waves.',
    color: '#6E1624',
    font: 'sans',
    sampleTitle: 'Ananya Turns 5',
    sampleMessage: 'Thank you for celebrating with us!',
  },
  {
    id: 'promo',
    name: 'Promotional & Marketing',
    blurb: 'Bold sunburst with a call-out badge.',
    color: '#C69A70',
    font: 'sans',
    sampleTitle: 'Your Brand',
    sampleMessage: 'Grand Opening · Visit Us Today',
  },
];

export const LABEL_COLOURS = [
  { name: 'Burgundy', hex: '#500D18' },
  { name: 'Rosewood', hex: '#6E1624' },
  { name: 'Champagne Gold', hex: '#C69A70' },
  { name: 'Ivory', hex: '#F8EFE5' },
  { name: 'Pearl White', hex: '#FFFFFF' },
  { name: 'Cocoa', hex: '#49302B' },
  { name: 'Onyx', hex: '#1B1716' },
];

export const templateMeta = (id: TemplateId) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export const colourName = (hex: string) => {
  const match = LABEL_COLOURS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return match ? `${match.name} (${match.hex.toUpperCase()})` : `Custom colour (${hex.toUpperCase()})`;
};

// ---------------------------------------------------------------------------
// Product photos and where their printed label band sits (in image pixels).
// ---------------------------------------------------------------------------

export interface BottleSpec {
  src: string;
  w: number;
  h: number;
  cropTop: number;
  cropBottom: number;
  label: { left: number; right: number; top: number; bottom: number };
}

export const BOTTLES: Record<SizeId, BottleSpec> = {
  '250 mL': {
    src: '/assets/bottle_250ml.png',
    w: 175,
    h: 820,
    cropTop: 215,
    cropBottom: 775,
    label: { left: 5, right: 168, top: 436, bottom: 613 },
  },
  '500 mL': {
    src: '/assets/bottle_500ml.png',
    w: 210,
    h: 920,
    cropTop: 233,
    cropBottom: 920,
    label: { left: 3, right: 207, top: 507, bottom: 727 },
  },
  '1000 mL': {
    src: '/assets/bottle_1000ml.png',
    w: 260,
    h: 1000,
    cropTop: 213,
    cropBottom: 1000,
    label: { left: 6, right: 252, top: 540, bottom: 804 },
  },
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const CREAM: RGB = [251, 247, 242];
const MAROON: RGB = [62, 9, 18];
const GOLD: RGB = [198, 154, 112];
const GOLD_DARK: RGB = [150, 105, 62];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

const hexToRgb = (hex: string): RGB => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [80, 13, 24];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const luminance = ([r, g, b]: RGB) => {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

interface Scheme {
  bg: RGB;
  bgLight: RGB;
  bgDark: RGB;
  ink: RGB;
  soft: RGB;
  accent: RGB;
  onAccent: RGB;
  dark: boolean;
}

const makeScheme = (hex: string): Scheme => {
  const bg = hexToRgb(hex);
  const dark = luminance(bg) < 0.22;
  const ink: RGB = dark ? CREAM : contrast(bg, MAROON) >= 4.5 ? MAROON : [24, 12, 10];
  let accent: RGB = dark ? GOLD : GOLD_DARK;
  if (contrast(bg, accent) < 2.2) accent = dark ? CREAM : MAROON;
  return {
    bg,
    bgLight: mix(bg, WHITE, dark ? 0.12 : 0.4),
    bgDark: mix(bg, BLACK, dark ? 0.35 : 0.1),
    ink,
    soft: mix(ink, bg, 0.22),
    accent,
    onAccent: luminance(accent) > 0.3 ? MAROON : CREAM,
    dark,
  };
};

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = 'Manrope, "Segoe UI", system-ui, sans-serif';
const TAU = Math.PI * 2;

const fontSpec = (weight: number, size: number, family: string, italic = false) =>
  `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${family}`;

const setSpacing = (ctx: CanvasRenderingContext2D, px: number) => {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px.toFixed(1)}px`;
};

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(next).width <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface TitleLayout {
  lines: string[];
  size: number;
  width: number;
}

function layoutTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  italic: boolean,
  spacing: number,
  base: number,
  maxW: number,
): TitleLayout {
  const measure = (t: string, size: number) => {
    ctx.font = fontSpec(weight, size, family, italic);
    setSpacing(ctx, (spacing * size) / 150);
    return ctx.measureText(t).width;
  };
  const fit = (lines: string[], start: number) =>
    lines.reduce((size, l) => {
      const w = measure(l, start);
      return w > maxW ? Math.min(size, (start * maxW) / w) : size;
    }, start);
  const widthOf = (lines: string[], size: number) => Math.max(...lines.map((l) => measure(l, size)));

  const single = fit([text], base);
  const words = text.split(/\s+/).filter(Boolean);
  if (single >= base * 0.72 || words.length < 2) {
    return { lines: [text], size: single, width: widthOf([text], single) };
  }
  let best: TitleLayout = { lines: [text], size: single, width: 0 };
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const size = fit(lines, base * 0.9);
    if (size > best.size) best = { lines, size, width: 0 };
  }
  best.width = widthOf(best.lines, best.size);
  return best;
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: 'contain' | 'circle',
  backing: boolean,
  s: Scheme,
) {
  const iw = img.naturalWidth || 400;
  const ih = img.naturalHeight || 400;
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 16, 0, TAU);
    ctx.strokeStyle = rgba(s.accent);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = backing ? '#FFFFFF' : rgba(s.bgDark);
    ctx.fill();
    ctx.clip();
    if (backing) {
      const box = r * 1.38;
      const k = Math.min(box / iw, box / ih);
      ctx.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
    } else {
      const k = Math.max((2 * r) / iw, (2 * r) / ih);
      ctx.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
    }
    ctx.restore();
    return;
  }
  const pad = backing ? 28 : 0;
  const k = Math.min((w - 2 * pad) / iw, (h - 2 * pad) / ih);
  const dw = iw * k;
  const dh = ih * k;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  if (backing) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    roundRectPath(ctx, dx - pad, dy - pad, dw + 2 * pad, dh + 2 * pad, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface TemplateStyle {
  area: [number, number];
  maxW: number;
  titleBase: number;
  titleUpper: boolean;
  titleSpacing: number;
  serifItalic: boolean;
  msg: { family: string; weight: number; italic: boolean; upper: boolean; spacing: number; base: number };
  msgColor: 'soft' | 'accent';
  separator: 'rule' | 'diamond' | 'dots' | 'none';
  msgPill: boolean;
  logoShape: 'contain' | 'circle';
  logoSize: number;
  footerY: number;
  footerOnAccent: boolean;
}

const STYLES: Record<TemplateId, TemplateStyle> = {
  corporate: {
    area: [110, 850],
    maxW: 760,
    titleBase: 150,
    titleUpper: true,
    titleSpacing: 9,
    serifItalic: false,
    msg: { family: SANS, weight: 600, italic: false, upper: true, spacing: 6, base: 46 },
    msgColor: 'accent',
    separator: 'rule',
    msgPill: false,
    logoShape: 'contain',
    logoSize: 240,
    footerY: 890,
    footerOnAccent: false,
  },
  personal: {
    area: [100, 840],
    maxW: 740,
    titleBase: 165,
    titleUpper: false,
    titleSpacing: 2,
    serifItalic: true,
    msg: { family: SANS, weight: 600, italic: false, upper: true, spacing: 6, base: 44 },
    msgColor: 'soft',
    separator: 'diamond',
    msgPill: false,
    logoShape: 'circle',
    logoSize: 250,
    footerY: 905,
    footerOnAccent: false,
  },
  wedding: {
    area: [205, 765],
    maxW: 720,
    titleBase: 165,
    titleUpper: false,
    titleSpacing: 1,
    serifItalic: true,
    msg: { family: SERIF, weight: 600, italic: false, upper: true, spacing: 7, base: 50 },
    msgColor: 'accent',
    separator: 'diamond',
    msgPill: false,
    logoShape: 'circle',
    logoSize: 230,
    footerY: 890,
    footerOnAccent: false,
  },
  birthday: {
    area: [200, 800],
    maxW: 760,
    titleBase: 160,
    titleUpper: false,
    titleSpacing: 1,
    serifItalic: true,
    msg: { family: SANS, weight: 700, italic: false, upper: false, spacing: 1, base: 50 },
    msgColor: 'soft',
    separator: 'dots',
    msgPill: false,
    logoShape: 'circle',
    logoSize: 230,
    footerY: 935,
    footerOnAccent: true,
  },
  promo: {
    area: [110, 820],
    maxW: 780,
    titleBase: 185,
    titleUpper: true,
    titleSpacing: 4,
    serifItalic: false,
    msg: { family: SANS, weight: 800, italic: false, upper: true, spacing: 4, base: 46 },
    msgColor: 'soft',
    separator: 'none',
    msgPill: true,
    logoShape: 'contain',
    logoSize: 230,
    footerY: 925,
    footerOnAccent: true,
  },
};

function bgCorporate(ctx: CanvasRenderingContext2D, s: Scheme) {
  const g = ctx.createLinearGradient(0, 0, 0, LABEL_H);
  g.addColorStop(0, rgba(s.bgLight));
  g.addColorStop(0.5, rgba(s.bg));
  g.addColorStop(1, rgba(s.bgDark));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  // fine diagonal pinstripes
  ctx.strokeStyle = rgba(s.ink, 0.035);
  ctx.lineWidth = 2;
  for (let x = -LABEL_H; x < LABEL_W; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, LABEL_H);
    ctx.lineTo(x + LABEL_H, 0);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(s.accent);
  ctx.fillRect(0, 44, LABEL_W, 10);
  ctx.fillRect(0, LABEL_H - 54, LABEL_W, 10);
  ctx.fillStyle = rgba(s.accent, 0.6);
  ctx.fillRect(0, 66, LABEL_W, 2);
  ctx.fillRect(0, LABEL_H - 68, LABEL_W, 2);
}

function bgPersonal(ctx: CanvasRenderingContext2D, s: Scheme) {
  const g = ctx.createRadialGradient(LABEL_W / 2, LABEL_H * 0.45, 40, LABEL_W / 2, LABEL_H * 0.45, LABEL_W * 0.62);
  g.addColorStop(0, rgba(s.bgLight));
  g.addColorStop(0.55, rgba(s.bg));
  g.addColorStop(1, rgba(s.bgDark));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.strokeStyle = rgba(s.accent, 0.12);
  ctx.lineWidth = 2;
  for (const r of [330, 395, 460]) {
    ctx.beginPath();
    ctx.arc(LABEL_W / 2, LABEL_H * 0.46, r, 0, TAU);
    ctx.stroke();
  }
  // front-panel double border
  ctx.strokeStyle = rgba(s.accent);
  ctx.lineWidth = 4;
  ctx.strokeRect(240, 40, LABEL_W - 480, LABEL_H - 80);
  ctx.strokeStyle = rgba(s.accent, 0.55);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(258, 58, LABEL_W - 516, LABEL_H - 116);
}

function flourish(ctx: CanvasRenderingContext2D, cx: number, y: number, half: number, s: Scheme) {
  ctx.strokeStyle = rgba(s.accent);
  ctx.fillStyle = rgba(s.accent);
  ctx.lineWidth = 3;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * 26, y);
    ctx.lineTo(cx + dir * half, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + dir * 40, y);
    ctx.bezierCurveTo(cx + dir * 70, y - 34, cx + dir * 110, y - 34, cx + dir * 130, y - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + dir * half, y, 5, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-10, -10, 20, 20);
  ctx.restore();
}

function bgWedding(ctx: CanvasRenderingContext2D, s: Scheme) {
  const g = ctx.createRadialGradient(LABEL_W / 2, LABEL_H / 2, 60, LABEL_W / 2, LABEL_H / 2, LABEL_W * 0.6);
  g.addColorStop(0, rgba(s.bgLight));
  g.addColorStop(1, rgba(mix(s.bg, s.bgDark, 0.5)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  // tiny diamond lattice
  ctx.fillStyle = rgba(s.accent, 0.08);
  for (let y = 20; y < LABEL_H; y += 44) {
    for (let x = (y / 44) % 2 ? 22 : 0; x < LABEL_W; x += 44) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
  }
  // top & bottom gilded bands
  ctx.fillStyle = rgba(s.accent);
  ctx.fillRect(0, 22, LABEL_W, 6);
  ctx.fillRect(0, LABEL_H - 28, LABEL_W, 6);
  // front panel ornate double frame
  const x0 = 220;
  const y0 = 56;
  const w = LABEL_W - 440;
  const h = LABEL_H - 112;
  ctx.strokeStyle = rgba(s.accent);
  ctx.lineWidth = 5;
  ctx.strokeRect(x0, y0, w, h);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 18, y0 + 18, w - 36, h - 36);
  ctx.fillStyle = rgba(s.accent);
  for (const [cx, cy] of [
    [x0, y0],
    [x0 + w, y0],
    [x0, y0 + h],
    [x0 + w, y0 + h],
  ]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-16, -16, 32, 32);
    ctx.restore();
  }
  flourish(ctx, LABEL_W / 2, 150, 230, s);
  flourish(ctx, LABEL_W / 2, LABEL_H - 170, 230, s);
}

function bgBirthday(ctx: CanvasRenderingContext2D, s: Scheme) {
  const g = ctx.createLinearGradient(0, 0, LABEL_W, LABEL_H);
  g.addColorStop(0, rgba(s.bgLight));
  g.addColorStop(1, rgba(s.bgDark));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);

  const rand = seeded(7);
  const palette = [s.accent, mix(s.accent, WHITE, 0.45), s.ink, mix(s.bg, WHITE, s.dark ? 0.35 : 0)];
  for (let i = 0; i < 110; i++) {
    const x = rand() * LABEL_W;
    const y = 150 + rand() * (LABEL_H - 330);
    const inCentre = x > 330 && x < LABEL_W - 330 && y > 190 && y < LABEL_H - 210;
    const c = palette[Math.floor(rand() * palette.length)];
    const rot = rand() * Math.PI;
    const kind = rand();
    if (inCentre) continue;
    ctx.fillStyle = rgba(c, 0.85);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (kind < 0.5) {
      ctx.beginPath();
      ctx.arc(0, 0, 5 + rand() * 7, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillRect(-5, -11, 10, 22);
    }
    ctx.restore();
  }
  // bunting
  const flags = 24;
  const flagColours = [s.accent, s.ink, mix(s.accent, WHITE, 0.45)];
  ctx.strokeStyle = rgba(s.ink, 0.6);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = t * LABEL_W;
    const y = 30 + Math.sin(t * Math.PI) * 50;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < flags; i++) {
    const t0 = (i + 0.1) / flags;
    const t1 = (i + 0.9) / flags;
    const tm = (t0 + t1) / 2;
    const y0 = 30 + Math.sin(t0 * Math.PI) * 50;
    const y1 = 30 + Math.sin(t1 * Math.PI) * 50;
    const ym = 30 + Math.sin(tm * Math.PI) * 50;
    ctx.fillStyle = rgba(flagColours[i % flagColours.length]);
    ctx.beginPath();
    ctx.moveTo(t0 * LABEL_W, y0);
    ctx.lineTo(t1 * LABEL_W, y1);
    ctx.lineTo(tm * LABEL_W, ym + 70);
    ctx.closePath();
    ctx.fill();
  }
  // waves
  const wave = (yBase: number, amp: number, phase: number, c: RGB, a: number) => {
    ctx.fillStyle = rgba(c, a);
    ctx.beginPath();
    ctx.moveTo(0, LABEL_H);
    for (let x = 0; x <= LABEL_W; x += 10) {
      ctx.lineTo(x, yBase + Math.sin((x / LABEL_W) * TAU * 2 + phase) * amp);
    }
    ctx.lineTo(LABEL_W, LABEL_H);
    ctx.closePath();
    ctx.fill();
  };
  wave(LABEL_H - 150, 20, 0.6, s.accent, 0.35);
  wave(LABEL_H - 110, 16, 2.2, s.accent, 1);
}

function bgPromo(ctx: CanvasRenderingContext2D, s: Scheme) {
  ctx.fillStyle = rgba(s.bg);
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  // sunburst
  const cx = LABEL_W / 2;
  const cy = LABEL_H * 0.44;
  const rays = 36;
  ctx.fillStyle = rgba(s.dark ? WHITE : s.bgDark, s.dark ? 0.05 : 0.22);
  for (let i = 0; i < rays; i += 2) {
    const a0 = (i / rays) * TAU;
    const a1 = ((i + 1) / rays) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * 1400, cy + Math.sin(a0) * 1400);
    ctx.lineTo(cx + Math.cos(a1) * 1400, cy + Math.sin(a1) * 1400);
    ctx.closePath();
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(cx, cy, 30, cx, cy, 520);
  glow.addColorStop(0, rgba(s.bgLight, 0.9));
  glow.addColorStop(1, rgba(s.bg, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  // diagonal sashes
  ctx.fillStyle = rgba(s.ink, 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(300, 0);
  ctx.lineTo(0, 300);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(s.accent);
  ctx.beginPath();
  ctx.moveTo(340, 0);
  ctx.lineTo(380, 0);
  ctx.lineTo(0, 380);
  ctx.lineTo(0, 340);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(s.ink, 0.9);
  ctx.beginPath();
  ctx.moveTo(LABEL_W, LABEL_H - 400);
  ctx.lineTo(LABEL_W, LABEL_H - 130);
  ctx.lineTo(LABEL_W - 270, LABEL_H - 130);
  ctx.closePath();
  ctx.fill();
  // bottom ribbon
  ctx.fillStyle = rgba(s.accent);
  ctx.fillRect(0, LABEL_H - 130, LABEL_W, 90);
  ctx.fillStyle = rgba(s.ink, 0.9);
  ctx.fillRect(0, LABEL_H - 40, LABEL_W, 40);
}

const BACKGROUNDS: Record<TemplateId, (ctx: CanvasRenderingContext2D, s: Scheme) => void> = {
  corporate: bgCorporate,
  personal: bgPersonal,
  wedding: bgWedding,
  birthday: bgBirthday,
  promo: bgPromo,
};

function drawSeparator(ctx: CanvasRenderingContext2D, kind: TemplateStyle['separator'], x: number, y: number, align: 'center' | 'left', s: Scheme) {
  ctx.fillStyle = rgba(s.accent);
  ctx.strokeStyle = rgba(s.accent);
  const cx = align === 'center' ? x : x + 90;
  if (kind === 'rule') {
    ctx.fillRect(align === 'center' ? cx - 80 : x, y - 2, 160, 4);
  } else if (kind === 'diamond') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 110, y);
    ctx.lineTo(cx - 22, y);
    ctx.moveTo(cx + 22, y);
    ctx.lineTo(cx + 110, y);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  } else if (kind === 'dots') {
    for (const dx of [-34, 0, 34]) {
      ctx.beginPath();
      ctx.arc(cx + dx, y, dx === 0 ? 9 : 6, 0, TAU);
      ctx.fill();
    }
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, st: TemplateStyle, s: Scheme) {
  const colour = st.footerOnAccent ? s.onAccent : s.accent;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = fontSpec(800, 30, SANS);
  setSpacing(ctx, 6);
  const brand = 'PRIME H₂O';
  const bw = ctx.measureText(brand).width;
  ctx.font = fontSpec(600, 21, SANS);
  setSpacing(ctx, 5);
  const tag = 'PACKAGED DRINKING WATER';
  const tw = ctx.measureText(tag).width;
  const gap = 44;
  let x = LABEL_W / 2 - (bw + gap + tw) / 2;
  ctx.fillStyle = rgba(colour);
  ctx.font = fontSpec(800, 30, SANS);
  setSpacing(ctx, 6);
  ctx.fillText(brand, x, st.footerY);
  x += bw + gap / 2;
  ctx.beginPath();
  ctx.arc(x - 3, st.footerY, 4, 0, TAU);
  ctx.fill();
  x += gap / 2;
  ctx.font = fontSpec(600, 21, SANS);
  setSpacing(ctx, 5);
  ctx.fillText(tag, x, st.footerY + 1);
}

function drawContent(ctx: CanvasRenderingContext2D, d: LabelDesign, s: Scheme, st: TemplateStyle, meta: TemplateMeta) {
  const ghostTitle = !d.title.trim();
  const ghostMsg = !d.message.trim();
  const titleRaw = ghostTitle ? meta.sampleTitle : d.title.trim();
  const msgRaw = ghostMsg ? meta.sampleMessage : d.message.trim();
  const titleText = st.titleUpper ? titleRaw.toUpperCase() : titleRaw;
  const msgText = st.msg.upper ? msgRaw.toUpperCase() : msgRaw;

  const hasLogo = !!d.logo && d.layout !== 'text';
  const inline = hasLogo && d.layout === 'inline';
  const isSerif = d.font === 'serif';
  const family = isSerif ? SERIF : SANS;
  const italic = isSerif && st.serifItalic;
  const weight = isSerif ? (italic ? 600 : 700) : 800;
  const spacing = isSerif ? st.titleSpacing * 0.4 : st.titleSpacing;
  const boost = hasLogo ? 1 : 1.15;
  const [aTop, aBot] = st.area;

  // Lay out logo, title and message at a given scale; shrink until the block fits the template's safe area.
  const plan = (fit: number) => {
    const titleBase = st.titleBase * d.textScale * boost * (isSerif ? 1.12 : 1) * fit;
    const logoBox = (inline ? st.logoSize * 1.05 : st.logoSize) * Math.min(1, fit * 1.05);
    const logoGap = (inline ? 56 : 44) * fit;
    const textMaxW = inline ? st.maxW - logoBox - logoGap : st.maxW;

    const title = layoutTitle(ctx, titleText, family, weight, italic, spacing, titleBase, textMaxW);
    const titleLineH = title.size * (isSerif ? 1.04 : 1.1);
    const titleH = title.lines.length * titleLineH;

    // message: shrink until it fits in at most 3 lines
    const msgMaxW = st.msgPill ? textMaxW - 90 : textMaxW;
    let msgSize = st.msg.base * Math.sqrt(d.textScale) * Math.max(0.75, fit);
    let msgLines: string[] = [];
    for (let i = 0; i < 8; i++) {
      ctx.font = fontSpec(st.msg.weight, msgSize, st.msg.family, st.msg.italic);
      setSpacing(ctx, st.msg.spacing);
      msgLines = wrapLines(ctx, msgText, msgMaxW);
      const widest = Math.max(0, ...msgLines.map((l) => ctx.measureText(l).width));
      if (msgLines.length <= 3 && widest <= msgMaxW) break;
      msgSize *= 0.9;
    }
    ctx.font = fontSpec(st.msg.weight, msgSize, st.msg.family, st.msg.italic);
    setSpacing(ctx, st.msg.spacing);
    const msgWidth = Math.max(0, ...msgLines.map((l) => ctx.measureText(l).width));
    const msgLineH = msgSize * 1.4;
    const msgH = msgLines.length * msgLineH + (st.msgPill ? pillPadY * 2 : 0);
    const sepH = (st.separator === 'none' ? 40 : 76) * Math.max(0.7, fit);
    const textBlockH = titleH + (msgLines.length ? sepH + msgH : 0);
    const blockH = inline ? Math.max(logoBox, textBlockH) : (hasLogo ? logoBox + logoGap : 0) + textBlockH;
    return { logoBox, logoGap, textMaxW, title, titleLineH, titleH, msgSize, msgLines, msgWidth, msgLineH, msgH, sepH, textBlockH, blockH };
  };
  const pillPadY = 26;
  let fit = 1;
  let p = plan(fit);
  while (p.blockH > aBot - aTop && fit > 0.55) {
    fit *= 0.92;
    p = plan(fit);
  }
  const { logoBox, logoGap, textMaxW, title, titleLineH, titleH, msgSize, msgLines, msgWidth, msgLineH, msgH, sepH, textBlockH, blockH } = p;
  const setMsgFont = () => {
    ctx.font = fontSpec(st.msg.weight, msgSize, st.msg.family, st.msg.italic);
    setSpacing(ctx, st.msg.spacing);
  };

  let y0 = (aTop + aBot) / 2 - blockH / 2 + d.offsetY * 150;
  const minY = aTop - 30;
  const maxY = Math.max(minY, aBot + 30 - blockH);
  y0 = clamp(y0, minY, maxY);

  const cx = LABEL_W / 2;
  let textX = cx;
  let align: 'center' | 'left' = 'center';
  let ty = y0;

  if (inline && d.logo) {
    const textW = Math.min(textMaxW, Math.max(title.width, msgWidth + (st.msgPill ? 90 : 0)));
    const groupW = logoBox + logoGap + textW;
    const gx = cx - groupW / 2;
    drawLogo(ctx, d.logo, gx, y0 + (blockH - logoBox) / 2, logoBox, logoBox, st.logoShape, d.logoBacking, s);
    textX = gx + logoBox + logoGap;
    align = 'left';
    ty = y0 + (blockH - textBlockH) / 2;
  } else if (hasLogo && d.logo) {
    const boxW = st.logoShape === 'circle' ? logoBox : Math.min(st.maxW * 0.75, logoBox * 2.2);
    drawLogo(ctx, d.logo, cx - boxW / 2, y0, boxW, logoBox, st.logoShape, d.logoBacking, s);
    ty = y0 + logoBox + logoGap;
  }

  // title
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.font = fontSpec(weight, title.size, family, italic);
  setSpacing(ctx, (spacing * title.size) / 150);
  ctx.fillStyle = rgba(s.ink, ghostTitle ? 0.42 : 1);
  title.lines.forEach((line, i) => ctx.fillText(line, textX, ty + titleLineH * (i + 0.5)));
  ty += titleH;

  if (!msgLines.length) return;
  drawSeparator(ctx, st.separator, textX, ty + sepH / 2, align, s);
  ty += sepH;

  setMsgFont();
  ctx.textAlign = align;
  if (st.msgPill) {
    const pw = msgWidth + 90;
    const px = align === 'center' ? textX - pw / 2 : textX;
    roundRectPath(ctx, px, ty, pw, msgH, msgH / 2);
    ctx.fillStyle = rgba(s.accent, ghostMsg ? 0.5 : 1);
    ctx.fill();
    ctx.fillStyle = rgba(s.onAccent, ghostMsg ? 0.6 : 1);
    const lx = align === 'center' ? textX : textX + 45;
    msgLines.forEach((line, i) => ctx.fillText(line, lx, ty + pillPadY + msgLineH * (i + 0.5)));
  } else {
    ctx.fillStyle = rgba(st.msgColor === 'accent' ? s.accent : s.soft, ghostMsg ? 0.45 : 1);
    msgLines.forEach((line, i) => ctx.fillText(line, textX, ty + msgLineH * (i + 0.5)));
  }
}

/** Paints the flat label artwork onto `canvas` (resized to LABEL_W × LABEL_H). */
export function renderLabel(canvas: HTMLCanvasElement, d: LabelDesign) {
  if (canvas.width !== LABEL_W) canvas.width = LABEL_W;
  if (canvas.height !== LABEL_H) canvas.height = LABEL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, LABEL_W, LABEL_H);
  const s = makeScheme(d.color);
  const st = STYLES[d.template];
  ctx.save();
  BACKGROUNDS[d.template](ctx, s);
  ctx.restore();
  ctx.save();
  drawContent(ctx, d, s, st, templateMeta(d.template));
  ctx.restore();
  ctx.save();
  drawFooter(ctx, st, s);
  ctx.restore();
  setSpacing(ctx, 0);
}

/** Draws the product photo with the label artwork wrapped around its label band. */
export function renderBottle(
  canvas: HTMLCanvasElement,
  bottle: HTMLImageElement,
  spec: BottleSpec,
  label: HTMLCanvasElement,
  scale = 2,
) {
  const outW = Math.round(spec.w * scale);
  const outH = Math.round((spec.cropBottom - spec.cropTop) * scale);
  if (canvas.width !== outW) canvas.width = outW;
  if (canvas.height !== outH) canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outW, outH);
  ctx.setTransform(scale, 0, 0, scale, 0, -spec.cropTop * scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bottle, 0, 0, spec.w, spec.h);

  const { left, right, top, bottom } = spec.label;
  const width = right - left;
  const height = bottom - top;
  const r = width / 2;
  const cx = left + r;
  const toU = (x: number) => (Math.asin(clamp((x - cx) / r, -1, 1)) + Math.PI / 2) / Math.PI;

  ctx.save();
  roundRectPath(ctx, left, top, width, height, 2.5);
  ctx.clip();

  // cylindrical projection, one device-pixel column at a time
  const cols = Math.ceil(width * scale);
  for (let i = 0; i < cols; i++) {
    const xa = left + i / scale;
    const xb = Math.min(right, left + (i + 1) / scale);
    const ua = toU(xa) * LABEL_W;
    const ub = toU(xb) * LABEL_W;
    ctx.drawImage(label, ua, 0, Math.max(0.5, ub - ua), LABEL_H, xa, top, xb - xa + 0.6 / scale, height);
  }

  // cylindrical shading
  const shade = ctx.createLinearGradient(left, 0, right, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(0.06, 'rgba(0,0,0,0.3)');
  shade.addColorStop(0.18, 'rgba(0,0,0,0.08)');
  shade.addColorStop(0.32, 'rgba(0,0,0,0)');
  shade.addColorStop(0.62, 'rgba(0,0,0,0)');
  shade.addColorStop(0.82, 'rgba(0,0,0,0.14)');
  shade.addColorStop(0.94, 'rgba(0,0,0,0.38)');
  shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(left, top, width, height);

  // specular highlights from the studio light
  const spec1 = ctx.createLinearGradient(left, 0, right, 0);
  spec1.addColorStop(0.2, 'rgba(255,255,255,0)');
  spec1.addColorStop(0.28, 'rgba(255,255,255,0.18)');
  spec1.addColorStop(0.32, 'rgba(255,255,255,0.3)');
  spec1.addColorStop(0.36, 'rgba(255,255,255,0.12)');
  spec1.addColorStop(0.45, 'rgba(255,255,255,0)');
  spec1.addColorStop(0.7, 'rgba(255,255,255,0)');
  spec1.addColorStop(0.76, 'rgba(255,255,255,0.07)');
  spec1.addColorStop(0.82, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec1;
  ctx.fillRect(left, top, width, height);

  // printed edge definition
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(left, top, width, 1.1);
  ctx.fillRect(left, bottom - 1.1, width, 1.1);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(left, top + 1.1, width, 0.8);
  ctx.restore();
}

/** Builds a shareable PNG: bottle mockup + flat artwork + design summary. */
export function composePreview(bottleCanvas: HTMLCanvasElement, labelCanvas: HTMLCanvasElement, lines: string[]): Promise<Blob | null> {
  const W = 1800;
  const H = 1100;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#F8EFE5';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#500D18';
  ctx.fillRect(0, 0, W, 120);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FBF7F2';
  ctx.font = fontSpec(800, 40, SANS);
  setSpacing(ctx, 8);
  ctx.fillText('PRIME H₂O', 70, 60);
  ctx.fillStyle = '#C69A70';
  ctx.font = fontSpec(600, 22, SANS);
  setSpacing(ctx, 5);
  ctx.textAlign = 'right';
  ctx.fillText('CUSTOM LABEL PREVIEW', W - 70, 60);
  ctx.textAlign = 'left';

  // bottle
  const glow = ctx.createRadialGradient(380, 620, 40, 380, 620, 420);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 120, 800, H - 120);
  const maxBH = 880;
  const k = Math.min(maxBH / bottleCanvas.height, 520 / bottleCanvas.width);
  const bw = bottleCanvas.width * k;
  const bh = bottleCanvas.height * k;
  ctx.drawImage(bottleCanvas, 380 - bw / 2, H - 60 - bh, bw, bh);

  // flat artwork
  const lx = 800;
  const lw = 920;
  const lh = (lw * LABEL_H) / LABEL_W;
  const ly = 200;
  ctx.save();
  ctx.shadowColor = 'rgba(80,13,24,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(labelCanvas, lx, ly, lw, lh);
  ctx.restore();
  ctx.strokeStyle = '#C69A70';
  ctx.lineWidth = 2;
  ctx.strokeRect(lx, ly, lw, lh);

  ctx.fillStyle = '#500D18';
  ctx.font = fontSpec(700, 26, SANS);
  setSpacing(ctx, 1);
  lines.forEach((l, i) => ctx.fillText(l, lx, ly + lh + 60 + i * 40));
  ctx.fillStyle = 'rgba(73,48,43,0.75)';
  ctx.font = fontSpec(500, 20, SANS);
  ctx.fillText('Preview for reference only. Final artwork, pricing and availability are confirmed by PRIME H₂O.', lx, H - 50);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
