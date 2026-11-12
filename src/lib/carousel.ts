// Carruseles de tips para Instagram: portada + láminas numeradas con checklist + cierre.
// Todo se dibuja en Canvas 2D: los textos salen exactamente como se escriben.
import { COND, FLYER_ICON_PATHS_REF, HEAD, SERIF, ensureFlyerFonts, hexA, roundRect, wrap } from '@/lib/flyer';

export { ensureFlyerFonts };

export interface TipSlide {
  heading: string;
  items: string[];
  icons: string[];
  source: string;
  note: string;
}

export interface CarouselData {
  kicker: string;
  title: string;
  subtitle: string;
  slides: TipSlide[];
  closingTitle: string;
  closingText: string;
  handle: string;
  agency: string;
  saveText: string;
}

export const EMPTY_CAROUSEL: CarouselData = {
  kicker: 'Tips',
  title: '',
  subtitle: '',
  slides: [],
  closingTitle: '¿Más tips?',
  closingText: '¡Dejanos tu comentario o contactanos y te asesoramos!',
  handle: '',
  agency: 'Agencia de Viajes Mariana',
  saveText: '¡GUARDÁ ESTE POST PARA MÁS TARDE!',
};

export type CarouselFormat = 'post' | 'story';
export const CAROUSEL_FORMATS: Record<CarouselFormat, { w: number; h: number; label: string }> = {
  post: { w: 1080, h: 1350, label: 'Posteo 4:5' },
  story: { w: 1080, h: 1920, label: 'Historia 9:16' },
};

export const CAROUSEL_PALETTES: Record<string, { label: string; c: string }> = {
  naranja: { label: 'Naranja', c: '#ff8416' },
  azul: { label: 'Azul', c: '#1b3a5c' },
  turquesa: { label: 'Turquesa', c: '#0e8fa0' },
  verde: { label: 'Verde', c: '#16795f' },
  bordo: { label: 'Bordó', c: '#8a2346' },
  violeta: { label: 'Violeta', c: '#5b3a9e' },
};

export const CAROUSEL_STYLES: Record<string, string> = {
  solido: 'Color sólido',
  editorial: 'Editorial',
  noche: 'Noche',
};

// ───────────────────────── texto ↔ datos ─────────────────────────
// Formato de texto (una línea en blanco separa cada lámina):
//   Palabra grande            ← portada: 1ª línea (opcional si hay una sola)
//   Título de la portada
//   Subtítulo
//
//   Encabezado de la lámina
//   Una línea por punto (usá **negrita** para resaltar)
//   > Sitio oficial: ejemplo.gov
//   ! Aviso destacado
//
//   Cierre: ¿Más tips?
//   Texto del cierre

const CLEAN_BULLET = /^[-•*✓✔►▪]\s*/;

export function parseCarouselText(raw: string): Partial<CarouselData> {
  const blocks = raw
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  const out: Partial<CarouselData> = { slides: [] };
  if (!blocks.length) return out;
  const first = blocks.shift() as string[];
  if (first.length === 1) {
    out.kicker = 'Tips';
    out.title = first[0];
    out.subtitle = '';
  } else {
    out.kicker = first[0];
    out.title = first[1];
    out.subtitle = first.slice(2).join(' ');
  }
  const slides: TipSlide[] = [];
  for (const b of blocks) {
    const m = /^cierre\s*:\s*(.*)$/i.exec(b[0]);
    if (m) {
      out.closingTitle = m[1].trim() || undefined;
      if (b[1]) out.closingText = b.slice(1).join(' ');
      continue;
    }
    const slide: TipSlide = { heading: b[0], items: [], icons: [], source: '', note: '' };
    for (const line of b.slice(1)) {
      if (line.startsWith('>')) slide.source = line.slice(1).trim();
      else if (line.startsWith('!')) slide.note = line.slice(1).trim();
      else {
        const t = line.replace(CLEAN_BULLET, '');
        slide.items.push(t);
        slide.icons.push(iconForTip(t));
      }
    }
    slides.push(slide);
  }
  out.slides = slides;
  return out;
}

export function serializeCarousel(d: Partial<CarouselData>): string {
  const parts: string[] = [];
  parts.push([d.kicker, d.title, d.subtitle].filter(Boolean).join('\n'));
  for (const s of d.slides ?? []) {
    const lines = [s.heading, ...s.items];
    if (s.source) lines.push(`> ${s.source}`);
    if (s.note) lines.push(`! ${s.note}`);
    parts.push(lines.join('\n'));
  }
  if (d.closingTitle || d.closingText) parts.push(`Cierre: ${d.closingTitle ?? ''}\n${d.closingText ?? ''}`.trim());
  return parts.join('\n\n');
}

// ───────────────────────── íconos ─────────────────────────

const TIP_PATHS: Record<string, string> = {
  doc: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h7',
  clock: 'M12 3a9 9 0 1 0 .01 0z M12 7v5l3 2',
  x: 'M12 3a9 9 0 1 0 .01 0z M9 9l6 6 M15 9l-6 6',
  syringe: 'M17 3l4 4 M15 5l4 4 M18 8l-9 9-3 1 1-3 9-9 M7 17l-4 4 M12 8l4 4',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  passport: 'M6 3h12v18H6z M12 9a3 3 0 1 0 .01 0z M9 17h6',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  warning: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  info: 'M12 3a9 9 0 1 0 .01 0z M12 11v6 M12 7.5h.01',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  money:
    'M12 3a9 9 0 1 0 .01 0z M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5 M12 6v1.5 M12 16.5V18',
  luggage: 'M7 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M9 7V4h6v3 M9 11v6 M15 11v6',
  globe: 'M12 3a9 9 0 1 0 .01 0z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  comment: 'M4 5h16v11H9l-5 4z',
  send: 'M21 3L3 10l7 3 3 7z M10 13l11-10',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  arrow: 'M4 12h15 M13 6l6 6-6 6',
};

function pathFor(name: string): string {
  return TIP_PATHS[name] ?? FLYER_ICON_PATHS_REF()[name as never] ?? FLYER_ICON_PATHS_REF().check;
}

export const CAROUSEL_ICONS: string[] = [
  'check', 'doc', 'clock', 'x', 'syringe', 'calendar', 'passport', 'mail', 'warning', 'info', 'bulb', 'money',
  'luggage', 'globe', 'plane', 'hotel', 'shield', 'pin', 'ticket', 'camera', 'sun', 'star', 'compass', 'utensils', 'bus',
];

const TIP_RULES: Array<[RegExp, string]> = [
  [/no reemplaza|prohibid|no se permite|no incluye|no aceptan/, 'x'],
  [/vacuna|sanitari|fiebre|salud|certificado de vacun/, 'syringe'],
  [/pasaporte|dni|documento de identidad/, 'passport'],
  [/formulario|documentaci|certificado|tramita|visa\b|e-visa|declaraci/, 'doc'],
  [/dias|horas|\d+\s*hs|antes del|anticipaci|validez|plazo|demora/, 'clock'],
  [/fecha|calendario|temporada|mes\b|meses/, 'calendar'],
  [/mail|correo|email/, 'mail'],
  [/seguro|asistencia|cobertura/, 'shield'],
  [/hotel|alojamiento|direccion|hospedaje/, 'hotel'],
  [/vuelo|pasaje|aerolinea|embarque|aeropuerto/, 'plane'],
  [/equipaje|valija|maleta/, 'luggage'],
  [/dolar|efectivo|dinero|tarjeta|moneda|cambio|precio|pago|costo/, 'money'],
  [/sitio oficial|web|pagina|link/, 'globe'],
  [/consejo|tip\b|recomend/, 'bulb'],
];

export function iconForTip(text: string): string {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, ic] of TIP_RULES) if (re.test(t)) return ic;
  return 'check';
}

function strokePath(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, lw = 1.7) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(pathFor(name)));
  ctx.restore();
}

// ───────────────────────── colores y utilidades ─────────────────────────

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

interface Look {
  style: string;
  c: string;
  bg: string;
  bg2: string;
  ink: string;
  soft: string;
  accent: string;
  pillBg: string;
  pillInk: string;
  display: string;
  displayWeight: string;
  body: string;
  dark: boolean;
}

function look(style: string, c: string): Look {
  if (style === 'editorial') {
    return {
      style, c, bg: '#f7f2e8', bg2: '#efe7d6', ink: '#1d2433', soft: 'rgba(29,36,51,0.7)', accent: c,
      pillBg: c, pillInk: '#ffffff', display: SERIF, displayWeight: '700', body: HEAD, dark: false,
    };
  }
  if (style === 'noche') {
    const deep = mixHex(c, '#000000', 0.72);
    return {
      style, c, bg: deep, bg2: mixHex(c, '#000000', 0.9), ink: '#ffffff', soft: 'rgba(255,255,255,0.75)',
      accent: '#e8b75d', pillBg: '#e8b75d', pillInk: mixHex(c, '#000000', 0.75), display: COND, displayWeight: '400', body: HEAD, dark: true,
    };
  }
  return {
    style, c, bg: c, bg2: mixHex(c, '#000000', 0.18), ink: '#ffffff', soft: 'rgba(255,255,255,0.82)',
    accent: '#ffffff', pillBg: '#ffffff', pillInk: c, display: HEAD, displayWeight: '800', body: HEAD, dark: true,
  };
}

function paintBackground(ctx: CanvasRenderingContext2D, L: Look, W: number, H: number) {
  if (L.style === 'noche') {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, L.bg);
    g.addColorStop(1, L.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = ctx.createRadialGradient(W * 0.9, H * 0.12, 0, W * 0.9, H * 0.12, W * 0.8);
    r.addColorStop(0, hexA(L.c, 0.55));
    r.addColorStop(1, hexA(L.c, 0));
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = L.bg;
  ctx.fillRect(0, 0, W, H);
  if (L.style === 'editorial') {
    ctx.fillStyle = L.bg2;
    ctx.beginPath();
    ctx.arc(W, H, W * 0.55, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.arc(W * 1.02, H * 0.08, W * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(-W * 0.05, H * 1.0, W * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Texto con **negrita**.
interface Tok {
  w: string;
  b: boolean;
}
interface RLine {
  toks: Tok[];
  w: number;
}

function richLayout(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, fam: string, reg: string, bold: string): RLine[] {
  const toks: Tok[] = [];
  text.split('**').forEach((part, i) => part.split(/\s+/).filter(Boolean).forEach((w) => toks.push({ w, b: i % 2 === 1 })));
  ctx.font = `${reg} ${size}px ${fam}`;
  const space = ctx.measureText(' ').width;
  const lines: RLine[] = [];
  let cur: Tok[] = [];
  let curW = 0;
  for (const t of toks) {
    ctx.font = `${t.b ? bold : reg} ${size}px ${fam}`;
    const w = ctx.measureText(t.w).width;
    if (cur.length && curW + space + w > maxW) {
      lines.push({ toks: cur, w: curW });
      cur = [t];
      curW = w;
    } else {
      curW += (cur.length ? space : 0) + w;
      cur.push(t);
    }
  }
  if (cur.length) lines.push({ toks: cur, w: curW });
  return lines;
}

function richDraw(
  ctx: CanvasRenderingContext2D,
  lines: RLine[],
  x: number,
  y: number,
  size: number,
  lh: number,
  color: string,
  fam: string,
  reg: string,
  bold: string,
  align: 'left' | 'center' = 'left',
) {
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `${reg} ${size}px ${fam}`;
  const space = ctx.measureText(' ').width;
  lines.forEach((ln, i) => {
    let cx = align === 'center' ? x - ln.w / 2 : x;
    for (const t of ln.toks) {
      ctx.font = `${t.b ? bold : reg} ${size}px ${fam}`;
      ctx.fillText(t.w, cx, y + i * lh);
      cx += ctx.measureText(t.w).width + space;
    }
  });
}

/** Mayor tamaño de fuente (entre max y min) con el que el texto cabe en maxW × maxLines. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number, max: number, min: number, fam: string, weight: string): number {
  for (let s = max; s >= min; s -= 2) {
    ctx.font = `${weight} ${s}px ${fam}`;
    if (wrap(ctx, text, maxW).length <= maxLines) return s;
  }
  return min;
}

function planePath(ctx: CanvasRenderingContext2D, L: Look, W: number, H: number) {
  ctx.save();
  ctx.strokeStyle = L.dark ? 'rgba(255,255,255,0.55)' : hexA(L.c, 0.6);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 14]);
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.46);
  ctx.bezierCurveTo(W * 0.38, H * 0.56, W * 0.7, H * 0.55, W * 0.8, H * 0.46);
  ctx.bezierCurveTo(W * 0.92, H * 0.36, W * 0.76, H * 0.28, W * 0.86, H * 0.2);
  ctx.stroke();
  ctx.restore();
  strokePath(ctx, 'plane', W * 0.86 - 4, H * 0.2 - 44, 60, L.dark ? '#ffffff' : L.c, 1.6);
}

function dots(ctx: CanvasRenderingContext2D, L: Look, W: number, y: number, n: number, active: number) {
  const gap = 26;
  const x0 = W / 2 - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.fillStyle = i === active ? (L.dark ? '#ffffff' : L.c) : L.dark ? 'rgba(255,255,255,0.35)' : hexA(L.c, 0.3);
    ctx.arc(x0 + i * gap, y, i === active ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rules(ctx: CanvasRenderingContext2D, L: Look, W: number, H: number, M: number) {
  ctx.strokeStyle = L.dark ? 'rgba(255,255,255,0.7)' : hexA(L.c, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, 96);
  ctx.lineTo(W - M, 96);
  ctx.moveTo(M, H - 96);
  ctx.lineTo(W - M, H - 96);
  ctx.stroke();
}

/** Título dentro de una "píldora" (o con barra de color en el estilo editorial). Devuelve el alto usado. */
function pill(ctx: CanvasRenderingContext2D, L: Look, text: string, x: number, y: number, w: number, maxSize: number, upper = true): number {
  const t = upper ? text.toUpperCase() : text;
  const padX = 40;
  const padY = 26;
  const fam = L.style === 'editorial' ? SERIF : HEAD;
  const weight = '800';
  const size = fitText(ctx, t, w - padX * 2, 2, maxSize, 30, fam, weight);
  ctx.font = `${weight} ${size}px ${fam}`;
  const lines = wrap(ctx, t, w - padX * 2);
  const lh = size * 1.12;
  const h = lines.length * lh + padY * 2;
  if (L.style === 'editorial') {
    ctx.fillStyle = L.accent;
    ctx.fillRect(x, y, 10, h);
  } else {
    ctx.fillStyle = L.pillBg;
    roundRect(ctx, x, y, w, h, Math.min(44, h / 2));
    ctx.fill();
  }
  ctx.fillStyle = L.style === 'editorial' ? L.ink : L.pillInk;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `${weight} ${size}px ${fam}`;
  lines.forEach((ln, i) => ctx.fillText(ln, x + (L.style === 'editorial' ? 36 : padX), y + padY + i * lh + size * 0.04));
  return h;
}

function outlineBox(ctx: CanvasRenderingContext2D, L: Look, text: string, cx: number, y: number, w: number, size: number, icon?: string): number {
  const pad = 26;
  const iconW = icon ? 80 : 0;
  const lines = richLayout(ctx, text, size, w - pad * 2 - iconW, L.body, '500', '800');
  const lh = size * 1.25;
  const h = Math.max(lines.length * lh, icon ? 60 : 0) + pad * 2;
  ctx.strokeStyle = L.dark ? '#ffffff' : L.c;
  ctx.lineWidth = 3;
  roundRect(ctx, cx - w / 2, y, w, h, 28);
  ctx.stroke();
  const textH = lines.length * lh;
  if (icon) strokePath(ctx, icon, cx - w / 2 + pad, y + h / 2 - 30, 60, L.dark ? '#ffffff' : L.c, 1.5);
  richDraw(ctx, lines, cx + iconW / 2, y + (h - textH) / 2, size, lh, L.ink, L.body, '500', '800', 'center');
  return h;
}

// ───────────────────────── láminas ─────────────────────────

function header(ctx: CanvasRenderingContext2D, L: Look, d: CarouselData, W: number, M: number) {
  ctx.textBaseline = 'top';
  ctx.fillStyle = L.soft;
  ctx.font = `700 28px ${HEAD}`;
  ctx.textAlign = 'left';
  ctx.fillText(d.agency, M, 80);
  if (d.handle) {
    ctx.textAlign = 'right';
    ctx.font = `500 28px ${HEAD}`;
    ctx.fillText(d.handle, W - M, 80);
  }
}

function drawCover(ctx: CanvasRenderingContext2D, L: Look, d: CarouselData, W: number, H: number, n: number) {
  const M = 90;
  rules(ctx, L, W, H, M);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = L.ink;
  ctx.font = `800 40px ${HEAD}`;
  ctx.fillText(d.agency, W / 2, 150);
  planePath(ctx, L, W, H);

  const words = d.kicker.trim().split(/\s+/).slice(0, 2);
  let y = H * 0.15;
  const factor = L.style === 'noche' ? 0.88 : 0.9;
  const budget = (H * 0.32) / (words.length * factor);
  ctx.textAlign = 'left';
  words.forEach((wd, i) => {
    const text = L.style === 'noche' ? wd.toUpperCase() : wd;
    const max = Math.min(L.style === 'noche' ? 460 : 340, budget);
    const size = fitText(ctx, text, W - M * 2 - 20, 1, max, 80, L.display, L.displayWeight);
    ctx.font = `${L.displayWeight} ${size}px ${L.display}`;
    ctx.fillStyle = i === 1 && L.style !== 'solido' ? L.accent : L.ink;
    ctx.fillText(text, M, y);
    y += size * factor;
  });

  const pillY = y + 50;
  const ph = pill(ctx, L, d.title || 'Título', M, pillY, W - M * 2, 74);
  if (d.subtitle) {
    ctx.fillStyle = L.ink;
    outlineBox(ctx, L, d.subtitle, W / 2, pillY + ph + 60, W - M * 2 - 140, 40);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = L.ink;
  ctx.font = `800 30px ${HEAD}`;
  ctx.fillText(d.saveText, W / 2, H - 215);
  if (d.handle) {
    ctx.fillStyle = L.soft;
    ctx.font = `500 34px ${HEAD}`;
    ctx.fillText(d.handle, W / 2, H - 170);
  }
  dots(ctx, L, W, H - 56, n, 0);
}

function drawTip(ctx: CanvasRenderingContext2D, L: Look, d: CarouselData, s: TipSlide, num: number, idx: number, n: number, W: number, H: number) {
  const M = 90;
  header(ctx, L, d, W, M);
  const label = String(num).padStart(2, '0');
  let y = 190;

  if (L.style === 'editorial') {
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = L.accent;
    ctx.font = `800 40px ${HEAD}`;
    ctx.fillText(`${label} —`, M, y);
    const size = fitText(ctx, s.heading, W - M * 2, 2, 92, 52, SERIF, '700');
    ctx.font = `700 ${size}px ${SERIF}`;
    const lines = wrap(ctx, s.heading, W - M * 2);
    ctx.fillStyle = L.ink;
    lines.forEach((ln, i) => ctx.fillText(ln, M, y + 66 + i * size * 1.1));
    y += 66 + lines.length * size * 1.1 + 18;
    ctx.fillStyle = L.accent;
    ctx.fillRect(M, y, 140, 6);
    y += 56;
  } else {
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = L.ink;
    const numFont = L.style === 'noche' ? COND : HEAD;
    const numSize = L.style === 'noche' ? 190 : 150;
    ctx.font = `${L.style === 'noche' ? '400' : '800'} ${numSize}px ${numFont}`;
    const numW = ctx.measureText(`${label}.`).width;
    ctx.fillText(`${label}.`, M, y - 14);
    const px = M + numW + 36;
    const ph = pill(ctx, L, s.heading, px, y + 4, W - M - px, 56);
    y += Math.max(numSize * 0.78, ph + 8) + 50;
  }

  // Zona de abajo: sitio oficial + aviso
  let bottom = H - 150;
  if (s.note) {
    const warn = /^[¡!]*\s*(no|ojo|atenci|importante|cuidado)/i.test(s.note) ? 'warning' : 'info';
    const probe = richLayout(ctx, s.note, 38, W - M * 2 - 52 - 80, L.body, '500', '800');
    const h = Math.max(probe.length * 38 * 1.25, 60) + 52;
    outlineBox(ctx, L, s.note, W / 2, bottom - h, W - M * 2, 38, warn);
    bottom -= h + 36;
  }
  if (s.source) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const m = /^([^:]{1,30}:)\s*(.*)$/.exec(s.source);
    const label2 = m ? `${m[1]} ` : '';
    const rest = m ? m[2] : s.source;
    ctx.font = `800 34px ${HEAD}`;
    const w1 = ctx.measureText(label2).width;
    ctx.font = `500 34px ${HEAD}`;
    const w2 = ctx.measureText(rest).width;
    const sx = W / 2 - (w1 + w2) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = L.ink;
    ctx.font = `800 34px ${HEAD}`;
    ctx.fillText(label2, sx, bottom - 48);
    ctx.font = `500 34px ${HEAD}`;
    ctx.fillText(rest, sx + w1, bottom - 48);
    ctx.fillRect(sx + w1, bottom - 48 + 42, w2, 3);
    bottom -= 80;
  }

  // Puntos: se agranda el texto hasta llenar el espacio.
  const avail = bottom - y;
  const cap = H > 1600 ? 64 : 56;
  let chosen = 26;
  let layout: RLine[][] = [];
  for (let size = cap; size >= 26; size -= 2) {
    const iconD = size * 1.3;
    const textW = W - M * 2 - iconD - 30;
    const ls = s.items.map((it) => richLayout(ctx, it, size, textW, L.body, '500', '800'));
    const total = ls.reduce((a, l) => a + Math.max(iconD, l.length * size * 1.22), 0) + size * 0.6 * Math.max(0, ls.length - 1);
    chosen = size;
    layout = ls;
    if (total <= avail) break;
  }
  const iconD = chosen * 1.3;
  let cy = y;
  s.items.forEach((_, i) => {
    const lines = layout[i];
    const rowH = Math.max(iconD, lines.length * chosen * 1.22);
    const ic = s.icons[i] || 'check';
    const iy = cy + (rowH - iconD) / 2;
    if (ic === 'check') {
      ctx.beginPath();
      ctx.fillStyle = L.style === 'editorial' ? L.accent : L.dark ? '#ffffff' : L.c;
      ctx.arc(M + iconD / 2, iy + iconD / 2, iconD / 2, 0, Math.PI * 2);
      ctx.fill();
      strokePath(ctx, 'check', M + iconD * 0.2, iy + iconD * 0.2, iconD * 0.6, L.style === 'editorial' ? '#ffffff' : L.dark ? (L.style === 'noche' ? L.bg : L.c) : '#ffffff', 2.6);
    } else {
      strokePath(ctx, ic, M, iy, iconD, L.style === 'editorial' ? L.accent : L.style === 'noche' ? L.accent : '#ffffff', 1.5);
    }
    const th = lines.length * chosen * 1.22;
    richDraw(ctx, lines, M + iconD + 30, cy + (rowH - th) / 2, chosen, chosen * 1.22, L.ink, L.body, '500', '800');
    cy += rowH + chosen * 0.6;
  });

  // Pie: puntos + "Deslizá"
  dots(ctx, L, W, H - 56, n, idx);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = L.soft;
  ctx.font = `700 26px ${HEAD}`;
  ctx.fillText('Deslizá', W - M - 44, H - 56);
  strokePath(ctx, 'arrow', W - M - 36, H - 68, 24, L.dark ? '#ffffff' : L.c, 2);
}

function drawClosing(ctx: CanvasRenderingContext2D, L: Look, d: CarouselData, W: number, H: number, n: number) {
  const M = 90;
  rules(ctx, L, W, H, M);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = L.ink;
  ctx.font = `800 40px ${HEAD}`;
  ctx.fillText(d.agency, W / 2, 150);
  const text = L.style === 'noche' ? d.closingTitle.toUpperCase() : d.closingTitle;
  const size = fitText(ctx, text, W - M * 2, 1, L.style === 'noche' ? 380 : 260, 90, L.display, L.displayWeight);
  ctx.font = `${L.displayWeight} ${size}px ${L.display}`;
  ctx.fillStyle = L.ink;
  const ty = H * 0.3;
  ctx.fillText(text, W / 2, ty);
  const lines = richLayout(ctx, d.closingText, 44, W - M * 2 - 80, L.body, '500', '800');
  richDraw(ctx, lines, W / 2, ty + size * 1.05 + 30, 44, 56, L.soft, L.body, '500', '800', 'center');
  // acciones
  const by = H * 0.68;
  const labels: Array<[string, string]> = [['heart', 'Me gusta'], ['comment', 'Comentá'], ['send', 'Compartí'], ['bookmark', 'Guardá']];
  const bw = 150;
  const gap = 24;
  const x0 = W / 2 - (labels.length * bw + (labels.length - 1) * gap) / 2;
  labels.forEach(([ic, lb], i) => {
    const x = x0 + i * (bw + gap);
    ctx.strokeStyle = L.dark ? '#ffffff' : L.c;
    ctx.lineWidth = 3;
    roundRect(ctx, x, by, bw, 150, 30);
    ctx.stroke();
    strokePath(ctx, ic, x + bw / 2 - 30, by + 24, 60, L.dark ? '#ffffff' : L.c, 1.5);
    ctx.fillStyle = L.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 24px ${HEAD}`;
    ctx.fillText(lb, x + bw / 2, by + 104);
  });
  if (d.handle) {
    ctx.fillStyle = L.soft;
    ctx.font = `500 36px ${HEAD}`;
    ctx.textAlign = 'center';
    ctx.fillText(d.handle, W / 2, H - 190);
  }
  dots(ctx, L, W, H - 56, n, n - 1);
}

export function carouselCount(d: CarouselData): number {
  return d.slides.length + 2;
}

/** Dibuja la lámina `index` (0 = portada, última = cierre). */
export function drawCarouselSlide(
  canvas: HTMLCanvasElement,
  d: CarouselData,
  index: number,
  styleKey: string,
  paletteKey: string,
  format: CarouselFormat,
) {
  const { w: W, h: H } = CAROUSEL_FORMATS[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const L = look(styleKey, (CAROUSEL_PALETTES[paletteKey] ?? CAROUSEL_PALETTES.naranja).c);
  const n = carouselCount(d);
  paintBackground(ctx, L, W, H);
  if (index === 0) drawCover(ctx, L, d, W, H, n);
  else if (index === n - 1) drawClosing(ctx, L, d, W, H, n);
  else drawTip(ctx, L, d, d.slides[index - 1], index, index, n, W, H);
}
