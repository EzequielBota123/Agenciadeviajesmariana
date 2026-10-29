// Generador de flyers: parsea el texto del programa y lo dibuja en un <canvas>.
// El texto lo dibuja el código (no una IA de imágenes), así precios y fechas salen exactos.

export interface FlyerData {
  label: string;
  title: string;
  tagline: string;
  dates: string;
  currency: string;
  price: string;
  priceNote: string;
  includes: string[];
  excludes: string;
  route: string;
  footer: string;
  agency: string;
  contact: string;
  photoCredit: string;
  /** Insignia opcional, ej: "15 años". */
  badge: string;
  /** Ícono por línea de "incluye" (si falta, se deduce del texto). */
  icons: string[];
}

export type FlyerFormat = 'story' | 'post' | 'cuadrado';

export const FLYER_FORMATS: Record<FlyerFormat, { w: number; h: number; label: string; file: string }> = {
  story: { w: 1080, h: 1920, label: 'Historia IG (9:16)', file: 'historia' },
  post: { w: 1080, h: 1350, label: 'Posteo IG (4:5)', file: 'posteo' },
  cuadrado: { w: 1080, h: 1080, label: 'Cuadrado (1:1)', file: 'cuadrado' },
};

export interface FlyerTheme {
  name: string;
  bg1: string;
  bg2: string;
  accent: string;
  accentInk: string;
  title: string;
  text: string;
  pillBg: string;
  pillInk: string;
  panel: string;
  panelInk: string;
  muted: string;
  footer: string;
  footerInk: string;
}

export const FLYER_THEMES: Record<string, FlyerTheme> = {
  azul: {
    name: 'Azul y naranja',
    bg1: '#10294a',
    bg2: '#1f4f8a',
    accent: '#f28a3b',
    accentInk: '#ffffff',
    title: '#ffffff',
    text: '#ffffff',
    pillBg: '#ffffff',
    pillInk: '#10294a',
    panel: '#f4f2ee',
    panelInk: '#1c2433',
    muted: '#5d6676',
    footer: '#0c1f38',
    footerInk: '#ffffff',
  },
  verde: {
    name: 'Verde selva',
    bg1: '#0e3b30',
    bg2: '#1f7a5c',
    accent: '#f2b84b',
    accentInk: '#2a1d02',
    title: '#ffffff',
    text: '#ffffff',
    pillBg: '#ffffff',
    pillInk: '#0e3b30',
    panel: '#f3f5ef',
    panelInk: '#1b2a24',
    muted: '#5a6a62',
    footer: '#0a2c24',
    footerInk: '#ffffff',
  },
  bordo: {
    name: 'Bordó y dorado',
    bg1: '#47122a',
    bg2: '#8a2c4d',
    accent: '#f1c27d',
    accentInk: '#3a1020',
    title: '#ffffff',
    text: '#ffffff',
    pillBg: '#ffffff',
    pillInk: '#47122a',
    panel: '#f7f2ee',
    panelInk: '#2a1620',
    muted: '#6d5a62',
    footer: '#350d20',
    footerInk: '#ffffff',
  },
  claro: {
    name: 'Claro clásico',
    bg1: '#f7f2e8',
    bg2: '#e4d8be',
    accent: '#1b3a5c',
    accentInk: '#ffffff',
    title: '#12283f',
    text: '#12283f',
    pillBg: '#12283f',
    pillInk: '#ffffff',
    panel: '#ffffff',
    panelInk: '#1c2433',
    muted: '#667085',
    footer: '#12283f',
    footerInk: '#ffffff',
  },
};

export const EMPTY_FLYER: FlyerData = {
  label: 'Paquete',
  title: 'EXPERIENCIA IGUAZÚ',
  tagline: '',
  dates: 'Salidas de diciembre a mayo, consultá fechas posibles',
  currency: '$',
  price: '890.000',
  priceNote: '6 cuotas sin interés',
  includes: [
    'Vuelos ida y vuelta, equipaje carry on',
    'Traslados aeropuerto / hotel / aeropuerto',
    '3 noches de alojamiento con desayuno en base doble',
    'Excursión Cataratas Argentinas + Cataratas Brasil + Parque de Aves',
    'Traslados a excursiones + guía',
  ],
  excludes: 'Entradas a Parques Nacionales',
  route: '',
  footer: '',
  agency: 'Agencia de Viajes Mariana',
  contact: '',
  photoCredit: '',
  badge: '',
  icons: [],
};

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Lee un texto libre con título, precio, cuotas, fechas, "incluye" y "no incluye". */
export function parseFlyerText(raw: string): Partial<FlyerData> {
  const text = raw.replace(/\r/g, '').trim();
  if (!text) return {};
  const out: Partial<FlyerData> = {};

  const priceRe = /(USD|U\$S|US\$|\$)\s*([0-9][0-9.,]*)/i;
  const pm = priceRe.exec(text);
  if (pm) {
    out.currency = pm[1] === '$' ? '$' : 'USD';
    out.price = pm[2].replace(/[.,]$/, '');
  }

  const incIdx = text.search(/(^|[^a-záéíóú])incluye\b/i);
  const noIncRe = /no\s+incluye\s*:?/i;
  const noInc = noIncRe.exec(text);

  // Título: lo que está antes del precio (o la primera línea).
  const firstLine = text.split('\n')[0];
  let title = pm ? text.slice(0, pm.index) : firstLine;
  title = title.split('\n')[0].trim();
  if (title) out.title = title.toUpperCase();

  // Todo lo que está entre el precio y "El programa incluye".
  const headEnd = (() => {
    const progIdx = text.search(/el\s+programa\s+incluye/i);
    if (progIdx >= 0) return progIdx;
    return incIdx >= 0 ? incIdx : text.length;
  })();
  const head = text.slice(pm ? pm.index + pm[0].length : 0, headEnd);

  const notes: string[] = [];
  const cuotas = /(\d+)\s*cuotas?[^-–—\n]*/i.exec(head);
  if (cuotas) notes.push(sentence(cuotas[0].replace(/^0+(?=\d)/, '')));
  const imp = /\+\s*imp[^-–—\n]*/i.exec(head);
  if (imp) notes.push(sentence(imp[0]));
  if (notes.length) out.priceNote = notes.join(' · ');

  const dates = /(?:salidas?|fechas?)[^\n]*?(?=\s*(?:el\s+programa|incluye|\n|$))/i.exec(head);
  if (dates) out.dates = sentence(dates[0]);

  const progStart = text.search(/el\s+programa\s+incluye\s*:?/i);
  const incMatch = /(?:el\s+programa\s+)?incluye\s*:?/i.exec(
    progStart >= 0 ? text.slice(progStart) : text.slice(Math.max(incIdx, 0)),
  );
  if (incMatch && (progStart >= 0 || incIdx >= 0)) {
    const base = progStart >= 0 ? progStart : incIdx;
    const bodyStart = base + incMatch.index + incMatch[0].length;
    const bodyEnd = noInc && noInc.index >= bodyStart ? noInc.index : text.length;
    const items = text
      .slice(bodyStart, bodyEnd)
      .split('\n')
      .map((l) => l.replace(/^\s*[-•*·✓✔]+\s*/, '').trim())
      .filter(Boolean)
      .map(sentence);
    if (items.length) out.includes = items;
  }

  if (noInc) {
    const ex = text
      .slice(noInc.index + noInc[0].length)
      .split('\n')
      .map((l) => l.replace(/^\s*[-•*·]+\s*/, '').trim())
      .filter(Boolean)
      .join(' · ');
    if (ex) out.excludes = sentence(ex);
  }

  out.label = /grupal/i.test(text) ? 'Salida grupal' : 'Paquete';
  return out;
}

/** Prompt para pedirle a Gemini (u otra IA) la foto de fondo, sin texto. */
export function backgroundPrompt(data: FlyerData, format: FlyerFormat): string {
  const place = data.title.replace(/^(experiencia|escapada|viaje a|viaje)\s+/i, '').toLowerCase() || 'destino turístico';
  const ratio = format === 'story' ? '9:16 vertical' : format === 'post' ? '4:5 vertical' : '1:1 cuadrada';
  return `Fotografía ${ratio} de ${place}, destino turístico icónico, luz cálida de atardecer, estilo revista de viajes, colores vivos, alta calidad, composición con espacio libre arriba y abajo, sin texto, sin logos, sin marcas de agua.`;
}

// ───────────────────────── íconos ─────────────────────────

export type FlyerIcon =
  | 'plane'
  | 'bus'
  | 'hotel'
  | 'waves'
  | 'compass'
  | 'utensils'
  | 'shield'
  | 'camera'
  | 'ticket'
  | 'pin'
  | 'sun'
  | 'star'
  | 'check';

export const FLYER_ICONS: FlyerIcon[] = [
  'plane', 'bus', 'hotel', 'waves', 'compass', 'utensils', 'shield', 'camera', 'ticket', 'pin', 'sun', 'star', 'check',
];

// Trazos en una grilla de 24×24 (estilo línea).
const ICON_PATHS: Record<FlyerIcon, string> = {
  plane:
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  bus: 'M4 16V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9 M4 11h16 M3 16h18 M7.5 16v2.5 M16.5 16v2.5 M7.5 13.5h.01 M16.5 13.5h.01',
  hotel: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17 M15 10h3a1 1 0 0 1 1 1v10 M3 21h18 M9 7h2 M9 11h2 M9 15h2',
  waves:
    'M2 7c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2',
  compass: 'M12 2a10 10 0 1 0 .01 0z M16 8l-2 6-6 2 2-6z',
  utensils: 'M6 3v8 M3 3v5a3 3 0 0 0 6 0V3 M6 11v10 M18 3c-2 2-3.5 4-3.5 7 0 2 1 3 3.5 3v8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  camera:
    'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 9.5a3.5 3.5 0 1 0 .01 0z',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z M14 7v10',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 7.5a2.5 2.5 0 1 0 .01 0z',
  sun: 'M12 7a5 5 0 1 0 .01 0z M12 1v3 M12 20v3 M4.2 4.2l2.1 2.1 M17.7 17.7l2.1 2.1 M1 12h3 M20 12h3 M4.2 19.8l2.1-2.1 M17.7 6.3l2.1-2.1',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  check: 'M5 12.5l5 5 9-11',
};

const ICON_RULES: Array<[RegExp, FlyerIcon]> = [
  [/vuelo|aereo|pasaje|avion|aerolinea|equipaje|boleto/, 'plane'],
  [/guia|coordinador/, 'compass'],
  [/traslado|transfer|\bbus\b|micro|\bvan\b/, 'bus'],
  [/alojamiento|noche|hotel|hospedaje|resort|habitacion|estadia/, 'hotel'],
  [/comida|cena|almuerzo|pension|all inclusive|todo incluido|desayuno|bebida/, 'utensils'],
  [/asistencia|seguro|cobertura/, 'shield'],
  [/cataratas|navegacion|catamaran|playa|lago|\brio\b|\bmar\b|crucero|isla/, 'waves'],
  [/excursion|visita|tour|paseo|parque|city/, 'camera'],
  [/entrada|ticket|show|espectaculo|pase/, 'ticket'],
  [/sol\b|pileta|piscina|spa/, 'sun'],
  [/punto|ciudad|destino|recorrido/, 'pin'],
];

/** Elige un ícono según lo que dice la línea ("Vuelos ida y vuelta" → avión). */
export function iconFor(text: string): FlyerIcon {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (const [re, icon] of ICON_RULES) if (re.test(t)) return icon;
  return 'check';
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const path = ICON_PATHS[name as FlyerIcon] ?? ICON_PATHS.check;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(path));
  ctx.restore();
}

// ───────────────────────── dibujo ─────────────────────────

const HEAD = "'Manrope', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
const COND = "'Bebas Neue', 'Oswald', 'Arial Narrow', Impact, sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function coverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  W: number,
  H: number,
) {
  const k = Math.max(W / img.width, H / img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export async function ensureFlyerFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`400 100px 'Bebas Neue'`),
      document.fonts.load(`800 40px Manrope`),
      document.fonts.load(`700 30px Manrope`),
      document.fonts.load(`600 30px Manrope`),
      document.fonts.load(`500 30px Manrope`),
      document.fonts.load(`700 34px 'Playfair Display'`),
    ]);
  } catch {
    // si las fuentes no cargan, se usa la tipografía de respaldo
  }
}

function drawFoto(
  canvas: HTMLCanvasElement,
  data: FlyerData,
  themeKey: string,
  format: FlyerFormat,
  photo: HTMLImageElement | null,
): void {
  const theme = FLYER_THEMES[themeKey] ?? FLYER_THEMES.azul;
  const { w: W, h: H } = FLYER_FORMATS[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const M = 64;
  const inner = W - 2 * M;
  const CARD_X = 36;
  const CARD_W = W - 2 * CARD_X;
  const isStory = format === 'story';
  const safeTop = isStory ? 190 : 64;
  const bottomSafe = isStory ? 90 : 0;
  const minGap = isStory ? 260 : format === 'post' ? 120 : 20;
  const smallBase = isStory ? 150 : format === 'post' ? 128 : 100;
  const bigBase = isStory ? 330 : format === 'post' ? 270 : 190;
  const priceBase = isStory ? 250 : format === 'post' ? 210 : 150;
  const items = data.includes.map((t) => t.trim()).filter(Boolean);
  const cols = isStory ? (items.length > 7 ? 2 : 1) : items.length > 3 ? 2 : 1;
  const colGap = 24;
  const title = data.title.trim().toUpperCase();

  const fit = (font: (px: number) => string, text: string, px: number, maxW: number): number => {
    ctx.font = font(px);
    const w = ctx.measureText(text).width;
    return w > maxW ? px * (maxW / w) : px;
  };

  // ───── bloque superior: título, etiqueta, precio ─────
  const layoutTop = (s: number) => {
    const words = title.split(/\s+/).filter(Boolean);
    const lines: Array<{ t: string; size: number }> = [];
    const condFont = (px: number) => `400 ${px}px ${COND}`;
    if (words.length <= 1) {
      lines.push({ t: title, size: fit(condFont, title, bigBase * s, inner) });
    } else {
      const first = words.slice(0, -1).join(' ');
      const last = words[words.length - 1];
      lines.push({ t: first, size: fit(condFont, first, smallBase * s, inner) });
      lines.push({ t: last, size: fit(condFont, last, bigBase * s, inner) });
    }
    let y = safeTop;
    const titleY: number[] = [];
    for (const l of lines) {
      y += l.size * 0.8;
      titleY.push(y);
      y += l.size * 0.1;
    }
    const pillH = 64 * s;
    const label = data.label.trim();
    const tagline = data.tagline.trim();
    let labelY = 0;
    if (label || tagline) {
      y += 26 * s;
      labelY = y;
      y += pillH;
    }
    const priceText = data.price.trim() ? `${data.currency.trim()} ${data.price.trim()}`.trim() : '';
    let ruleY = 0;
    let priceY = 0;
    let priceSize = 0;
    if (priceText) {
      y += 38 * s;
      ruleY = y;
      y += 6 * s + 14 * s;
      priceSize = fit(condFont, priceText, priceBase * s, inner);
      y += priceSize * 0.8;
      priceY = y;
      y += priceSize * 0.08;
    }
    let noteY = 0;
    const noteH = 68 * s;
    if (data.priceNote.trim()) {
      y += 22 * s;
      noteY = y;
      y += noteH;
    }
    ctx.font = `600 ${30 * s}px ${HEAD}`;
    const dateLines = data.dates.trim() ? wrap(ctx, data.dates.trim(), inner) : [];
    let datesY = 0;
    if (dateLines.length) {
      y += 30 * s;
      datesY = y;
      y += dateLines.length * 30 * s * 1.4;
    }
    return { s, lines, titleY, pillH, labelY, ruleY, priceText, priceY, priceSize, noteY, noteH, dateLines, datesY, topEnd: y + 16 };
  };

  // ───── bloque inferior: tarjeta de "incluye", "no incluye" y pie ─────
  const layoutBottom = (s: number) => {
    const tile = 84 * s;
    const textSize = 33 * s;
    const lh = textSize * 1.28;
    const padX = 26 * s;
    const colW = (CARD_W - 2 * padX - colGap * (cols - 1)) / cols;
    const textW = colW - tile - 26 * s;
    ctx.font = `700 ${textSize}px ${HEAD}`;
    const rows = items.map((t) => {
      const ls = wrap(ctx, t, textW);
      return { ls, h: Math.max(tile, ls.length * lh) + 26 * s };
    });
    const colH: number[] = Array(cols).fill(0);
    const place = rows.map((r) => {
      const c = colH.indexOf(Math.min(...colH));
      const y = colH[c];
      colH[c] += r.h;
      return { c, y };
    });
    const tabH = items.length ? 58 * s : 0;
    const cardH = items.length ? 12 * s + Math.max(...colH) + 12 * s : 0;

    ctx.font = `600 ${29 * s}px ${HEAD}`;
    const exLines = data.excludes.trim() ? wrap(ctx, `No incluye: ${data.excludes.trim()}`, CARD_W - 2 * padX) : [];
    const routeLines = data.route.trim() ? wrap(ctx, data.route.trim(), CARD_W - 2 * padX) : [];
    const exLH = 29 * s * 1.35;
    const exH =
      exLines.length || routeLines.length
        ? 24 * s * 2 + (exLines.length + routeLines.length) * exLH + (exLines.length && routeLines.length ? 8 * s : 0)
        : 0;

    ctx.font = `500 20px ${HEAD}`;
    const legalLines = data.footer.trim() ? wrap(ctx, data.footer.trim(), inner).slice(0, 3) : [];
    const footerH = 30 + 42 + (legalLines.length ? 8 + legalLines.length * 26 : 0) + 24 + bottomSafe;

    const gapA = cardH ? 16 : 0;
    const total = tabH + cardH + (exH ? gapA + exH : 0) + footerH;
    return { s, tile, textSize, lh, padX, colW, rows, place, tabH, cardH, exLines, routeLines, exLH, exH, legalLines, footerH, gapA, total };
  };

  const maxScale = isStory ? 1.25 : 1.05;
  let top = layoutTop(maxScale);
  let bot = layoutBottom(maxScale);
  for (let s = maxScale; s >= 0.45; s -= 0.04) {
    top = layoutTop(s);
    bot = layoutBottom(s);
    if (top.topEnd + minGap + bot.total <= H) break;
  }
  const s = top.s;
  const bottomTop = H - bot.total;

  // ── fondo ──
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, theme.bg1);
  g.addColorStop(1, theme.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const stop = (y: number) => Math.min(1, Math.max(0, y / H));
  if (photo) {
    coverImage(ctx, photo, W, H);
    const ov = ctx.createLinearGradient(0, 0, 0, H);
    ov.addColorStop(0, hexA(theme.bg1, 0.9));
    ov.addColorStop(stop(top.topEnd), hexA(theme.bg1, 0.5));
    ov.addColorStop(stop(Math.max(top.topEnd + 40, bottomTop - 160)), hexA(theme.bg1, 0.05));
    ov.addColorStop(stop(bottomTop + 10), hexA(theme.bg1, 0.96));
    ov.addColorStop(1, hexA(theme.bg1, 1));
    ctx.fillStyle = ov;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = hexA('#ffffff', theme.title === '#ffffff' ? 0.06 : 0.35);
    ctx.beginPath();
    ctx.arc(W * 0.84, (top.topEnd + bottomTop) / 2, W * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W * 0.08, bottomTop - 60, W * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── curva decorativa arriba a la derecha ──
  const endY = Math.min(H * 0.2, 340);
  const swoosh = () => {
    ctx.beginPath();
    ctx.moveTo(W * 0.46, -20);
    ctx.bezierCurveTo(W * 0.5, endY * 0.5, W * 0.74, endY * 0.9, W + 20, endY);
  };
  swoosh();
  ctx.lineTo(W + 20, -20);
  ctx.closePath();
  ctx.fillStyle = hexA(theme.bg1, 0.97);
  ctx.fill();
  ctx.save();
  ctx.translate(-18, 14);
  swoosh();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
  swoosh();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 20;
  ctx.stroke();

  // ── título, etiqueta, precio ──
  const shadow = (on: boolean) => {
    ctx.shadowColor = on && photo ? 'rgba(0,0,0,0.4)' : 'transparent';
    ctx.shadowBlur = on && photo ? 16 : 0;
    ctx.shadowOffsetY = on && photo ? 4 : 0;
  };
  ctx.textBaseline = 'alphabetic';
  shadow(true);
  ctx.fillStyle = theme.title;
  top.lines.forEach((l, i) => {
    ctx.font = `400 ${l.size}px ${COND}`;
    ctx.fillText(l.t, M, top.titleY[i]);
  });
  shadow(false);

  if (top.labelY) {
    let x = M;
    const label = data.label.trim();
    if (label) {
      const fs = 31 * s;
      ctx.font = `700 ${fs}px ${HEAD}`;
      const tw = ctx.measureText(label).width;
      roundRect(ctx, x, top.labelY, tw + 64, top.pillH, top.pillH / 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.fillStyle = theme.accentInk;
      ctx.fillText(label, x + 32, top.labelY + top.pillH / 2 + fs * 0.35);
      x += tw + 64 + 26;
    }
    const tagline = data.tagline.trim();
    if (tagline) {
      shadow(true);
      ctx.font = `400 ${68 * s}px ${COND}`;
      ctx.fillStyle = theme.title;
      ctx.fillText(tagline.toUpperCase(), x, top.labelY + top.pillH / 2 + 68 * s * 0.3);
      shadow(false);
    }
  }

  if (top.priceText) {
    roundRect(ctx, M, top.ruleY, 110, 6 * s + 2, 3);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    shadow(true);
    ctx.fillStyle = theme.accent;
    ctx.font = `400 ${top.priceSize}px ${COND}`;
    ctx.fillText(top.priceText, M, top.priceY);
    shadow(false);
  }

  if (data.priceNote.trim()) {
    const fs = 35 * s;
    ctx.font = `700 ${fs}px ${HEAD}`;
    const tw = Math.min(ctx.measureText(data.priceNote.trim()).width, inner - 64);
    roundRect(ctx, M, top.noteY, tw + 64, top.noteH, top.noteH / 2);
    ctx.fillStyle = theme.pillBg;
    ctx.fill();
    ctx.fillStyle = theme.pillInk;
    ctx.fillText(data.priceNote.trim(), M + 32, top.noteY + top.noteH / 2 + fs * 0.35, inner - 64);
  }

  if (top.dateLines.length) {
    shadow(true);
    ctx.font = `600 ${30 * s}px ${HEAD}`;
    ctx.fillStyle = theme.text;
    top.dateLines.forEach((l, i) => ctx.fillText(l, M, top.datesY + (i + 0.95) * 30 * s * 1.4));
    shadow(false);
  }

  // ── fotógrafo ──
  if (photo && data.photoCredit.trim()) {
    ctx.font = `500 18px ${HEAD}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.fillText(data.photoCredit.trim(), W - M, bottomTop - 16);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left';
  }

  // ── tarjeta "El programa incluye" ──
  let y = bottomTop;
  if (items.length) {
    const tabFs = 31 * s;
    ctx.font = `800 ${tabFs}px ${HEAD}`;
    const tabW = ctx.measureText('El programa incluye:').width + 60;
    roundRect(ctx, CARD_X, y, tabW, bot.tabH + 20, [24 * s, 24 * s, 0, 0]);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.fillStyle = theme.accentInk;
    ctx.fillText('El programa incluye:', CARD_X + 30, y + bot.tabH / 2 + tabFs * 0.32);
    y += bot.tabH;

    roundRect(ctx, CARD_X, y, CARD_W, bot.cardH, [0, 30 * s, 30 * s, 30 * s]);
    ctx.fillStyle = theme.panel;
    ctx.fill();

    const gridTop = y + 12 * s;
    bot.rows.forEach((r, i) => {
      const pl = bot.place[i];
      const x = CARD_X + bot.padX + pl.c * (bot.colW + colGap);
      const ry = gridTop + pl.y;
      const ty = ry + (r.h - bot.tile) / 2;
      roundRect(ctx, x, ty, bot.tile, bot.tile, 20 * s);
      ctx.fillStyle = theme.footer;
      ctx.fill();
      drawIcon(ctx, data.icons[i] ?? iconFor(items[i]), x + bot.tile * 0.2, ty + bot.tile * 0.2, bot.tile * 0.6, theme.footerInk);
      ctx.fillStyle = theme.panelInk;
      ctx.font = `700 ${bot.textSize}px ${HEAD}`;
      const blockH = r.ls.length * bot.lh;
      const textTop = ry + (r.h - blockH) / 2;
      r.ls.forEach((l, k) => ctx.fillText(l, x + bot.tile + 26 * s, textTop + bot.textSize * 0.95 + k * bot.lh));
      const nextInCol = bot.place.findIndex((q, j) => j > i && q.c === pl.c);
      if (nextInCol !== -1) {
        ctx.fillStyle = hexA(theme.panelInk, 0.1);
        ctx.fillRect(x, ry + r.h - 1, bot.colW, 2);
      }
    });
    y += bot.cardH + bot.gapA;
  }

  // ── "No incluye" / recorrido ──
  if (bot.exH) {
    roundRect(ctx, CARD_X, y, CARD_W, bot.exH, 26 * s);
    ctx.fillStyle = hexA(theme.panel, 0.88);
    ctx.fill();
    let ey = y + 24 * s;
    ctx.font = `600 ${29 * s}px ${HEAD}`;
    bot.exLines.forEach((l, i) => {
      ey += bot.exLH;
      ctx.fillStyle = theme.panelInk;
      if (i === 0 && l.startsWith('No incluye:')) {
        ctx.font = `800 ${29 * s}px ${HEAD}`;
        ctx.fillText('No incluye:', CARD_X + bot.padX, ey - 8 * s);
        const w0 = ctx.measureText('No incluye: ').width;
        ctx.font = `600 ${29 * s}px ${HEAD}`;
        ctx.fillStyle = theme.muted;
        ctx.fillText(l.slice('No incluye:'.length).trimStart(), CARD_X + bot.padX + w0, ey - 8 * s);
      } else {
        ctx.fillStyle = theme.muted;
        ctx.fillText(l, CARD_X + bot.padX, ey - 8 * s);
      }
    });
    if (bot.routeLines.length) {
      ey += 8 * s;
      ctx.font = `800 ${29 * s}px ${HEAD}`;
      ctx.fillStyle = theme.panelInk;
      bot.routeLines.forEach((l) => {
        ey += bot.exLH;
        ctx.fillText(l, CARD_X + bot.padX, ey - 8 * s);
      });
    }
    y += bot.exH;
  }

  // ── pie ──
  const darkBg = theme.title === '#ffffff';
  let ty = H - bot.footerH + 30 + 32;
  ctx.fillStyle = darkBg ? '#ffffff' : theme.title;
  ctx.font = `700 32px ${SERIF}`;
  ctx.fillText(data.agency.trim() || 'Agencia de Viajes', M, ty);
  if (data.contact.trim()) {
    ctx.font = `700 28px ${HEAD}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.contact.trim(), W - M, ty - 2);
    ctx.textAlign = 'left';
  }
  if (bot.legalLines.length) {
    ctx.font = `500 20px ${HEAD}`;
    ctx.fillStyle = darkBg ? 'rgba(255,255,255,0.7)' : theme.muted;
    ty += 8;
    bot.legalLines.forEach((l) => {
      ty += 26;
      ctx.fillText(l, M, ty);
    });
  }
}

// ───────────────────── plantilla "collage con mapa" ─────────────────────

export type FlyerTemplate = 'foto' | 'collage';

export interface DrawOptions {
  template?: FlyerTemplate;
  /** Logos de partners (aerolínea, operador…), se dibujan abajo a la derecha. */
  logos?: HTMLImageElement[];
}

export function drawFlyer(
  canvas: HTMLCanvasElement,
  data: FlyerData,
  themeKey: string,
  format: FlyerFormat,
  photo: HTMLImageElement | null,
  opts: DrawOptions = {},
): void {
  if (opts.template === 'collage') drawCollage(canvas, data, themeKey, format, photo, opts.logos ?? []);
  else drawFoto(canvas, data, themeKey, format, photo);
}

function drawCollage(
  canvas: HTMLCanvasElement,
  data: FlyerData,
  themeKey: string,
  format: FlyerFormat,
  photo: HTMLImageElement | null,
  logos: HTMLImageElement[],
): void {
  const theme = FLYER_THEMES[themeKey] ?? FLYER_THEMES.azul;
  const { w: W, h: H } = FLYER_FORMATS[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const M = 64;
  const isStory = format === 'story';
  const safeTop = isStory ? 180 : 60;
  const bottomSafe = isStory ? 90 : 0;
  const dark = theme.title === '#ffffff';
  const ovColor = dark ? theme.bg2 : theme.footer;
  const grey = '#ececee';
  const items = data.includes.map((t) => t.trim()).filter(Boolean);
  const title = data.title.trim().toUpperCase();
  const leftW = W * 0.6;
  const listW = W * 0.5 - M;
  const rightX = W * 0.54;
  const rightW = W - M - rightX;

  const fitSize = (weight: number, text: string, px: number, maxW: number, family = HEAD) => {
    ctx.font = `${weight} ${px}px ${family}`;
    const w = ctx.measureText(text).width;
    return w > maxW ? px * (maxW / w) : px;
  };

  const layoutTop = (s: number) => {
    const widest = title.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
    const titleSize = fitSize(800, widest || 'X', (isStory ? 108 : format === 'post' ? 96 : 80) * s, leftW);
    ctx.font = `800 ${titleSize}px ${HEAD}`;
    const titleLines = wrap(ctx, title, leftW);
    let y = safeTop;
    const labelY = y;
    const pillH = 54 * s;
    if (data.label.trim()) y += pillH + 26 * s;
    const titleTop = y;
    y += titleLines.length * titleSize * 1.06;
    const tagSize = 62 * s;
    const tagY = y;
    if (data.tagline.trim()) y += tagSize * 1.1;
    const titleEnd = y;
    ctx.font = `700 ${32 * s}px ${HEAD}`;
    const dateLines = data.dates.trim() ? wrap(ctx, data.dates.trim(), W * 0.42) : [];
    const datesY = y + 22 * s;
    const datesH = dateLines.length ? 24 * s + dateLines.length * 32 * s * 1.25 : 0;
    y = datesY + datesH;

    // Precio: bloque aparte, se ancla cerca de la zona gris.
    const priceMaxW = W * 0.36;
    const cur = data.currency.trim();
    const numSize = fitSize(800, data.price.trim() || '0', (isStory ? 170 : format === 'post' ? 150 : 120) * s, priceMaxW);
    const curSize = Math.min(numSize * 0.62, 104 * s);
    const noteSize = 26 * s;
    const priceH = data.price.trim()
      ? (cur ? curSize * 1.0 : 0) + numSize * 0.98 + (data.priceNote.trim() ? noteSize * 1.8 : 0)
      : 0;
    return {
      s, titleSize, titleLines, labelY, pillH, titleTop, tagSize, tagY, titleEnd, dateLines, datesY, datesH,
      numSize, curSize, noteSize, priceH, blockEnd: y,
    };
  };

  const layoutBottom = (s: number) => {
    const tile = 60 * s;
    const textSize = 27 * s;
    const lh = textSize * 1.3;
    const textW = listW - tile - 22 * s;
    ctx.font = `500 ${textSize}px ${HEAD}`;
    const rows = items.map((t) => {
      const ls = wrap(ctx, t, textW);
      return { ls, h: Math.max(tile, ls.length * lh) + 18 * s };
    });
    const listH = rows.reduce((a, r) => a + r.h, 0);
    ctx.font = `600 ${24 * s}px ${HEAD}`;
    const exLines = data.excludes.trim() ? wrap(ctx, `No incluye: ${data.excludes.trim()}`, listW) : [];
    const exH = exLines.length ? 12 * s + exLines.length * 24 * s * 1.35 : 0;
    ctx.font = `700 ${34 * s}px ${HEAD}`;
    const routeLines = data.route.trim() ? wrap(ctx, data.route.trim(), rightW) : [];
    const routeH = routeLines.length ? 76 * s + 14 * s + routeLines.length * 34 * s * 1.3 : 0;
    const contactH = data.contact.trim() ? 46 * s : 0;
    const logoH = 58 * s;
    const rightNeeded = 0.035 * H + 36 * s + routeH + contactH + 24 * s + logoH;
    ctx.font = `600 19px ${HEAD}`;
    const legalLines = data.footer.trim() ? wrap(ctx, data.footer.trim(), W - 2 * M).slice(0, 3) : [];
    const barH = (legalLines.length ? 22 + legalLines.length * 25 + 18 : 0) + bottomSafe;
    const left = 40 * s + listH + exH;
    const needed = Math.max(left, rightNeeded) + 30 * s + barH;
    return { s, tile, textSize, lh, textW, rows, exLines, routeLines, routeH, contactH, logoH, legalLines, barH, needed };
  };

  const maxScale = isStory ? 1.2 : 1.0;
  let top = layoutTop(maxScale);
  let bot = layoutBottom(maxScale);
  const topNeed = (t: ReturnType<typeof layoutTop>) => t.blockEnd + t.priceH + 70;
  for (let s = maxScale; s >= 0.42; s -= 0.04) {
    top = layoutTop(s);
    bot = layoutBottom(s);
    if (topNeed(top) + bot.needed <= H) break;
  }
  const s = top.s;
  const splitY = H - bot.needed;

  // ── fondo: foto teñida ──
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, theme.bg1);
  g.addColorStop(1, theme.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (photo) {
    coverImage(ctx, photo, W, H);
    ctx.fillStyle = hexA(ovColor, 0.86);
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = hexA('#ffffff', 0.05);
    ctx.beginPath();
    ctx.arc(W * 0.85, splitY * 0.45, W * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── zona gris con "mapa" ──
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, splitY + 40);
  ctx.bezierCurveTo(W * 0.35, splitY + 12, W * 0.7, splitY - 34, W, splitY - 26);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = grey;
  ctx.fill();
  ctx.clip();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.strokeStyle = '#dededf';
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    ctx.lineWidth = i % 5 === 0 ? 9 : 3.5;
    const x = rnd() * W;
    const y = splitY - 40 + rnd() * (H - splitY + 40);
    const len = 120 + rnd() * 380;
    const diag = rnd() < 0.3;
    const horiz = rnd() < 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (diag) ctx.lineTo(x + len * 0.7, y + len * 0.5);
    else if (horiz) ctx.lineTo(x + len, y);
    else ctx.lineTo(x, y + len);
    ctx.stroke();
  }
  ctx.restore();

  // ── forma con la foto (blob inclinado + naranja + azul oscuro) ──
  const bx0 = W * 0.44;
  const bx1 = W - 44;
  const by1 = splitY + 0.035 * H;
  const by0 = Math.max(top.blockEnd + 8, by1 - 0.5 * H);
  const bw = bx1 - bx0;
  const bh = Math.max(by1 - by0, 120);
  const cx = bx0 + bw / 2;
  const cy = by0 + bh / 2;
  const rr = Math.min(bw, bh) * 0.14;
  const shape = (dx: number, dy: number, rot: number, grow = 0) => {
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate((rot * Math.PI) / 180);
    roundRect(ctx, -bw / 2 - grow, -bh / 2 - grow, bw + 2 * grow, bh + 2 * grow, rr);
  };
  shape(-38, 34, 6);
  ctx.fillStyle = theme.footer;
  ctx.fill();
  ctx.restore();
  shape(42, -34, 7);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 24;
  shape(0, 0, -2.5, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-2.5 * Math.PI) / 180);
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rr * 0.85);
  ctx.clip();
  if (photo) {
    ctx.translate(-cx, -cy);
    const k = Math.max((bw + 40) / photo.width, (bh + 40) / photo.height);
    ctx.drawImage(photo, cx - (photo.width * k) / 2, cy - (photo.height * k) / 2, photo.width * k, photo.height * k);
  } else {
    const pg = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
    pg.addColorStop(0, theme.bg2);
    pg.addColorStop(1, theme.accent);
    ctx.fillStyle = pg;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  }
  ctx.restore();

  // ── textos del bloque superior ──
  ctx.textBaseline = 'alphabetic';
  const titleInk = dark ? '#ffffff' : '#ffffff';
  if (data.label.trim()) {
    const fs = 29 * s;
    ctx.font = `700 ${fs}px ${HEAD}`;
    const tw = ctx.measureText(data.label.trim()).width;
    roundRect(ctx, M, top.labelY, tw + 56, top.pillH, top.pillH / 2);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.fillStyle = theme.accentInk;
    ctx.fillText(data.label.trim(), M + 28, top.labelY + top.pillH / 2 + fs * 0.35);
  }
  ctx.fillStyle = titleInk;
  ctx.font = `800 ${top.titleSize}px ${HEAD}`;
  top.titleLines.forEach((l, i) => ctx.fillText(l, M, top.titleTop + (i + 0.86) * top.titleSize * 1.06));
  if (data.tagline.trim()) {
    ctx.font = `500 ${top.tagSize}px ${HEAD}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3px';
    ctx.fillText(data.tagline.trim().toUpperCase(), M, top.tagY + top.tagSize * 0.85);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }
  if (top.dateLines.length) {
    const fs = 32 * s;
    ctx.font = `700 ${fs}px ${HEAD}`;
    const pw = Math.max(...top.dateLines.map((l) => ctx.measureText(l).width)) + 56;
    roundRect(ctx, M, top.datesY, pw, top.datesH, Math.min(top.datesH / 2, 36));
    ctx.fillStyle = '#ececee';
    ctx.fill();
    ctx.fillStyle = '#1c2433';
    top.dateLines.forEach((l, i) => ctx.fillText(l, M + 28, top.datesY + 12 * s + (i + 0.85) * fs * 1.25));
  }

  // precio: arriba de la zona gris
  if (data.price.trim()) {
    let py = Math.max(top.blockEnd + 30, splitY - top.priceH - 34);
    ctx.fillStyle = '#ffffff';
    if (data.currency.trim()) {
      ctx.font = `800 ${top.curSize}px ${HEAD}`;
      py += top.curSize * 0.82;
      ctx.fillText(data.currency.trim(), M, py);
      py += top.curSize * 0.18;
    }
    ctx.font = `800 ${top.numSize}px ${HEAD}`;
    py += top.numSize * 0.82;
    ctx.fillText(data.price.trim(), M, py);
    py += top.numSize * 0.16;
    if (data.priceNote.trim()) {
      ctx.font = `700 ${top.noteSize}px ${HEAD}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      py += top.noteSize * 1.1;
      ctx.fillText(data.priceNote.trim().toUpperCase(), M, py);
    }
  }

  // insignia
  if (data.badge.trim()) {
    const parts = data.badge.trim().split(/\s+/);
    const bs = 150 * Math.min(s, 1);
    ctx.save();
    ctx.translate(W - M - bs / 2 - 6, safeTop + bs / 2);
    ctx.rotate((-8 * Math.PI) / 180);
    roundRect(ctx, -bs / 2, -bs / 2, bs, bs, 16);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `400 ${bs * 0.56}px ${COND}`;
    ctx.fillText(parts[0].toUpperCase(), 0, parts.length > 1 ? 4 : bs * 0.2);
    if (parts.length > 1) {
      ctx.font = `800 ${bs * 0.17}px ${HEAD}`;
      ctx.fillText(parts.slice(1).join(' ').toUpperCase(), 0, bs * 0.34);
    }
    ctx.restore();
  }

  // ── lista con íconos (izquierda) ──
  let ly = splitY + 40 * s + 20;
  bot.rows.forEach((r, i) => {
    const ty = ly + (r.h - bot.tile) / 2;
    ctx.save();
    ctx.translate(M + bot.tile / 2, ty + bot.tile / 2);
    ctx.rotate((-8 * Math.PI) / 180);
    roundRect(ctx, -bot.tile / 2, -bot.tile / 2, bot.tile, bot.tile, 16 * s);
    ctx.fillStyle = theme.footer;
    ctx.fill();
    ctx.restore();
    drawIcon(ctx, data.icons[i] ?? iconFor(items[i]), M + bot.tile * 0.2, ty + bot.tile * 0.2, bot.tile * 0.6, '#ffffff');
    ctx.fillStyle = '#1c2433';
    ctx.font = `500 ${bot.textSize}px ${HEAD}`;
    const blockH = r.ls.length * bot.lh;
    const tt = ly + (r.h - blockH) / 2;
    r.ls.forEach((l, k) => ctx.fillText(l, M + bot.tile + 22 * s, tt + bot.textSize * 0.95 + k * bot.lh));
    ly += r.h;
  });
  if (bot.exLines.length) {
    ly += 12 * s;
    ctx.font = `600 ${24 * s}px ${HEAD}`;
    ctx.fillStyle = '#5d6676';
    bot.exLines.forEach((l) => {
      ly += 24 * s * 1.35;
      ctx.fillText(l, M, ly - 6 * s);
    });
  }

  // ── columna derecha: recorrido, contacto, logos ──
  let ry = by1 + 36 * s;
  if (bot.routeLines.length) {
    const gw = rightW;
    const gy = ry + 34 * s;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push([rightX + t * gw, gy - Math.sin(t * Math.PI * 2.2) * 20 * s - t * 14 * s]);
    }
    ctx.save();
    ctx.setLineDash([9, 7]);
    ctx.strokeStyle = theme.footer;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    [0, 8, 17, 24].forEach((i) => {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 9 * s, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
    });
    ry += 76 * s + 14 * s;
    ctx.fillStyle = theme.footer;
    ctx.font = `700 ${34 * s}px ${HEAD}`;
    ctx.textAlign = 'right';
    bot.routeLines.forEach((l) => {
      ry += 34 * s * 1.3;
      ctx.fillText(l, W - M, ry - 8 * s);
    });
    ctx.textAlign = 'left';
  }
  if (data.contact.trim()) {
    ry += 14 * s;
    ctx.font = `800 ${30 * s}px ${HEAD}`;
    ctx.fillStyle = theme.accent === '#1b3a5c' ? theme.footer : theme.accent;
    ctx.textAlign = 'right';
    ctx.fillText(data.contact.trim(), W - M, ry + 22 * s);
    ctx.textAlign = 'left';
  }
  const logoBottom = H - bot.barH - 24 * s;
  if (logos.length) {
    const h = bot.logoH;
    const widths = logos.map((l) => (l.width / l.height) * h);
    const gap = 30 * s;
    let total = widths.reduce((a, b) => a + b, 0) + gap * (logos.length - 1);
    const k = total > rightW ? rightW / total : 1;
    total *= k;
    let x = W - M - total;
    logos.forEach((l, i) => {
      ctx.drawImage(l, x, logoBottom - h * k, widths[i] * k, h * k);
      x += widths[i] * k + gap * k;
    });
  } else {
    ctx.font = `700 ${34 * s}px ${SERIF}`;
    ctx.fillStyle = theme.footer;
    ctx.textAlign = 'right';
    ctx.fillText(data.agency.trim() || 'Agencia de Viajes', W - M, logoBottom - 6 * s);
    ctx.textAlign = 'left';
  }

  // ── barra legal ──
  if (bot.legalLines.length) {
    ctx.fillStyle = '#8d8d92';
    ctx.fillRect(0, H - bot.barH, W, bot.barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 19px ${HEAD}`;
    ctx.textAlign = 'center';
    bot.legalLines.forEach((l, i) => ctx.fillText(l, W / 2, H - bot.barH + 22 + (i + 0.8) * 25));
    ctx.textAlign = 'left';
  }

  // crédito de foto
  if (photo && data.photoCredit.trim()) {
    ctx.font = `500 17px ${HEAD}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(data.photoCredit.trim(), M, splitY - 12, Math.max(80, bx0 - M - 24));
  }
}
