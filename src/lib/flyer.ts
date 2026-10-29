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

// ───────────────────────── dibujo ─────────────────────────

const HEAD = "'Manrope', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";

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

function coverImage(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, W: number, H: number) {
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
      document.fonts.load(`800 60px Manrope`),
      document.fonts.load(`700 30px Manrope`),
      document.fonts.load(`500 30px Manrope`),
      document.fonts.load(`700 34px 'Playfair Display'`),
    ]);
  } catch {
    // si las fuentes no cargan, se usa la tipografía de respaldo
  }
}

export function drawFlyer(
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

  const M = 72;
  const inner = W - 2 * M;
  const isStory = format === 'story';
  const safeTop = isStory ? 200 : 76;
  const bottomSafe = isStory ? 120 : 0;
  const minGap = isStory ? 300 : format === 'post' ? 150 : 40;
  const titleBase = isStory ? 128 : format === 'post' ? 112 : 96;
  const priceBase = isStory ? 210 : format === 'post' ? 180 : 150;
  const items = data.includes.filter((i) => i.trim());
  const cols = format === 'story' ? (items.length > 8 ? 2 : 1) : items.length > 3 ? 2 : 1;
  const colGap = 36;
  const colW = (inner - colGap * (cols - 1)) / cols;
  const title = data.title.trim().toUpperCase();

  // ── medir con una escala; se achica hasta que entre todo ──
  interface Metrics {
    s: number;
    titleLines: string[];
    titleSize: number;
    taglineSize: number;
    datesLines: string[];
    datesSize: number;
    priceSize: number;
    noteSize: number;
    itemLines: string[][];
    itemSize: number;
    itemLH: number;
    colHeights: number[];
    legalLines: string[];
    topEnd: number;
    panelH: number;
    footerH: number;
    exLines: string[];
    routeLines: string[];
  }

  const measure = (s: number): Metrics => {
    const titleSize = titleBase * s;
    ctx.font = `800 ${titleSize}px ${HEAD}`;
    const titleLines = wrap(ctx, title, inner);
    const taglineSize = 64 * s;
    const datesSize = 34 * s;
    ctx.font = `700 ${datesSize}px ${HEAD}`;
    const datesLines = data.dates.trim() ? wrap(ctx, data.dates.trim(), inner - 64) : [];
    ctx.font = `800 ${priceBase * s}px ${HEAD}`;
    const priceW = ctx.measureText(data.price.trim()).width;
    const priceSize = priceW > inner ? priceBase * s * (inner / priceW) : priceBase * s;
    const noteSize = 40 * s;

    let y = safeTop;
    if (data.label.trim()) y += 58 * s + 30 * s;
    y += titleLines.length * titleSize * 1.04;
    if (data.tagline.trim()) y += taglineSize * 1.25 + 8 * s;
    if (datesLines.length) y += 46 * s + datesLines.length * datesSize * 1.3 + 30 * s;
    if (data.price.trim()) {
      y += 34 * s + (data.currency.trim() ? 62 * s : 0) + priceSize * 0.98;
      if (data.priceNote.trim()) y += 14 * s + noteSize * 1.3;
    }
    const topEnd = y + 20;

    const itemSize = 31 * s;
    const itemLH = itemSize * 1.32;
    ctx.font = `600 ${itemSize}px ${HEAD}`;
    const itemLines = items.map((it) => wrap(ctx, it, colW - 54));
    const colHeights: number[] = Array(cols).fill(0);
    itemLines.forEach((ls, i) => {
      colHeights[i % cols] += ls.length * itemLH + 18 * s;
    });
    ctx.font = `600 ${27 * s}px ${HEAD}`;
    const exLines = data.excludes.trim() ? wrap(ctx, `No incluye: ${data.excludes.trim()}`, inner) : [];
    ctx.font = `700 ${28 * s}px ${HEAD}`;
    const routeLines = data.route.trim() ? wrap(ctx, data.route.trim(), inner) : [];

    let panelH = 0;
    if (items.length) {
      panelH = 52 + 26 * s + 28 + Math.max(...colHeights) + 10;
      if (exLines.length) panelH += 12 + exLines.length * 27 * s * 1.35;
      if (routeLines.length) panelH += 18 + routeLines.length * 28 * s * 1.35;
      panelH += 40;
    }

    ctx.font = `500 ${20}px ${HEAD}`;
    const legalLines = data.footer.trim() ? wrap(ctx, data.footer.trim(), inner).slice(0, 3) : [];
    const footerH = 30 + 46 + (legalLines.length ? 10 + legalLines.length * 27 : 0) + 28 + bottomSafe;

    return {
      s,
      titleLines,
      titleSize,
      taglineSize,
      datesLines,
      datesSize,
      priceSize,
      noteSize,
      itemLines,
      itemSize,
      itemLH,
      colHeights,
      legalLines,
      topEnd,
      panelH,
      footerH,
      exLines,
      routeLines,
    };
  };

  const maxScale = isStory ? 1.6 : 1.08;
  let m = measure(maxScale);
  for (let s = maxScale; s >= 0.5; s -= 0.04) {
    m = measure(s);
    if (m.topEnd + minGap + m.panelH + m.footerH <= H) break;
  }
  const s = m.s;
  const panelTop = H - m.footerH - m.panelH;

  // ── fondo ──
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, theme.bg1);
  g.addColorStop(1, theme.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (photo) {
    coverImage(ctx, photo, W, H);
    const ov = ctx.createLinearGradient(0, 0, 0, panelTop);
    ov.addColorStop(0, hexA(theme.bg1, 0.93));
    ov.addColorStop(Math.min(0.95, Math.max(0.2, m.topEnd / panelTop)), hexA(theme.bg1, 0.62));
    ov.addColorStop(1, hexA(theme.bg1, 0.12));
    ctx.fillStyle = ov;
    ctx.fillRect(0, 0, W, panelTop + 2);
  } else {
    ctx.fillStyle = hexA('#ffffff', theme.title === '#ffffff' ? 0.06 : 0.35);
    ctx.beginPath();
    ctx.arc(W * 0.86, panelTop * 0.62, W * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W * 0.1, panelTop * 0.95, W * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  if (photo && data.photoCredit.trim()) {
    ctx.font = `500 18px ${HEAD}`;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.fillText(data.photoCredit.trim(), W - M, panelTop - 18);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left';
  }

  // ── bloque superior ──
  const shadow = (on: boolean) => {
    ctx.shadowColor = on && photo ? 'rgba(0,0,0,0.35)' : 'transparent';
    ctx.shadowBlur = on && photo ? 14 : 0;
    ctx.shadowOffsetY = on && photo ? 3 : 0;
  };
  ctx.textBaseline = 'alphabetic';
  let y = safeTop;

  if (data.label.trim()) {
    const fs = 30 * s;
    ctx.font = `700 ${fs}px ${HEAD}`;
    const tw = ctx.measureText(data.label.trim()).width;
    const ph = 58 * s;
    roundRect(ctx, M, y, tw + 56, ph, ph / 2);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.fillStyle = theme.accentInk;
    ctx.fillText(data.label.trim(), M + 28, y + ph / 2 + fs * 0.35);
    y += ph + 30 * s;
  }

  shadow(true);
  ctx.fillStyle = theme.title;
  ctx.font = `800 ${m.titleSize}px ${HEAD}`;
  for (const line of m.titleLines) {
    y += m.titleSize * 0.92;
    ctx.fillText(line, M, y);
    y += m.titleSize * 0.12;
  }

  if (data.tagline.trim()) {
    ctx.font = `500 ${m.taglineSize}px ${HEAD}`;
    ctx.fillStyle = theme.accent;
    y += m.taglineSize * 0.95 + 8 * s;
    ctx.fillText(data.tagline.trim(), M, y);
    y += m.taglineSize * 0.3;
  }
  shadow(false);

  if (m.datesLines.length) {
    y += 46 * s;
    const lh = m.datesSize * 1.3;
    const ph = m.datesLines.length * lh + 22 * s;
    ctx.font = `700 ${m.datesSize}px ${HEAD}`;
    const pw = Math.max(...m.datesLines.map((l) => ctx.measureText(l).width)) + 64;
    roundRect(ctx, M, y, pw, ph, Math.min(ph / 2, 40));
    ctx.fillStyle = theme.pillBg;
    ctx.fill();
    ctx.fillStyle = theme.pillInk;
    m.datesLines.forEach((l, i) => ctx.fillText(l, M + 32, y + 11 * s + (i + 0.78) * lh));
    y += ph + 30 * s;
  }

  if (data.price.trim()) {
    shadow(true);
    y += 34 * s;
    ctx.fillStyle = theme.title;
    if (data.currency.trim()) {
      ctx.font = `800 ${58 * s}px ${HEAD}`;
      y += 52 * s;
      ctx.fillText(data.currency.trim(), M, y);
      y += 10 * s;
    }
    ctx.font = `800 ${m.priceSize}px ${HEAD}`;
    y += m.priceSize * 0.82;
    ctx.fillText(data.price.trim(), M, y);
    y += m.priceSize * 0.14;
    if (data.priceNote.trim()) {
      ctx.font = `700 ${m.noteSize}px ${HEAD}`;
      ctx.fillStyle = theme.accent;
      y += 14 * s + m.noteSize * 0.95;
      ctx.fillText(data.priceNote.trim(), M, y);
    }
    shadow(false);
  }

  // ── panel inferior ──
  if (m.panelH) {
    roundRect(ctx, 0, panelTop, W, m.panelH + 60, [44, 44, 0, 0]);
    ctx.fillStyle = theme.panel;
    ctx.fill();

    let py = panelTop + 52;
    ctx.fillStyle = theme.accent === theme.panel ? theme.panelInk : theme.accent;
    ctx.font = `800 ${26 * s}px ${HEAD}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '4px';
    ctx.fillText('EL PROGRAMA INCLUYE', M, py + 18 * s);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    py += 26 * s + 28;

    const ys: number[] = Array(cols).fill(py);
    m.itemLines.forEach((ls, i) => {
      const c = i % cols;
      const x = M + c * (colW + colGap);
      let iy = ys[c];
      const r = 17 * s;
      ctx.beginPath();
      ctx.arc(x + r, iy + m.itemSize * 0.62, r, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.strokeStyle = theme.accentInk;
      ctx.lineWidth = 3.4 * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.5, iy + m.itemSize * 0.62);
      ctx.lineTo(x + r * 0.9, iy + m.itemSize * 0.62 + r * 0.38);
      ctx.lineTo(x + r * 1.55, iy + m.itemSize * 0.62 - r * 0.42);
      ctx.stroke();
      ctx.fillStyle = theme.panelInk;
      ctx.font = `600 ${m.itemSize}px ${HEAD}`;
      ls.forEach((l, k) => ctx.fillText(l, x + 2 * r + 20, iy + m.itemSize * 0.95 + k * m.itemLH));
      iy += ls.length * m.itemLH + 18 * s;
      ys[c] = iy;
    });
    py = Math.max(...ys) + 10;

    if (m.exLines.length) {
      py += 12;
      ctx.fillStyle = theme.muted;
      ctx.font = `600 ${27 * s}px ${HEAD}`;
      m.exLines.forEach((l) => {
        py += 27 * s * 1.35;
        ctx.fillText(l, M, py - 6);
      });
    }
    if (m.routeLines.length) {
      py += 18;
      ctx.fillStyle = theme.panelInk;
      ctx.font = `700 ${28 * s}px ${HEAD}`;
      m.routeLines.forEach((l) => {
        py += 28 * s * 1.35;
        ctx.fillText(l, M, py - 6);
      });
    }
  }

  // ── pie ──
  const fy = H - m.footerH;
  ctx.fillStyle = theme.footer;
  ctx.fillRect(0, fy, W, m.footerH);
  let ty = fy + 30 + 34;
  ctx.fillStyle = theme.footerInk;
  ctx.font = `700 34px ${SERIF}`;
  ctx.fillText(data.agency.trim() || 'Agencia de Viajes', M, ty);
  if (data.contact.trim()) {
    ctx.font = `700 28px ${HEAD}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.accent;
    ctx.fillText(data.contact.trim(), W - M, ty - 2);
    ctx.textAlign = 'left';
  }
  if (m.legalLines.length) {
    ctx.font = `500 20px ${HEAD}`;
    ctx.fillStyle = hexA(theme.footerInk, 0.7);
    ty += 10;
    m.legalLines.forEach((l) => {
      ty += 27;
      ctx.fillText(l, M, ty);
    });
  }
}
