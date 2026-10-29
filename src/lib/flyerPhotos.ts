// Sugerencias de foto de fondo: busca en Wikimedia Commons (gratis, sin clave, con CORS abierto).
// Las fotos son de licencia libre, pero casi todas piden dar crédito: se devuelve el texto listo.

export interface PhotoSuggestion {
  id: string;
  title: string;
  thumb: string;
  full: string;
  credit: string;
  page: string;
}

const STOP_WORDS =
  /^(experiencia|escapada|aventura|viaje|viajes|paquete|salida|salidas|grupal|tour|circuito|especial|oferta|a|al|en|de|del|la|el|las|los|y)\s+/i;

function plain(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const TAIL_WORDS =
  /\s+(all inclusive|todo incluido|fin de semana largo|fin de semana|con desayuno|con media pension|con pension completa|solo alojamiento|en oferta|imperdible|\d.*)$/i;

/** Saca del título las palabras de relleno ("EXPERIENCIA IGUAZÚ" → "Iguazú"). */
export function placeFromTitle(title: string): string {
  // Lo que viene después de un guion largo, barra o "|" suele ser la fecha o el régimen.
  let t = title.split(/\s[-–—|]\s|\s[-–—|]|[–—|]/)[0].trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i++) {
    const next = t.replace(STOP_WORDS, '').replace(TAIL_WORDS, '');
    if (next === t) break;
    t = next;
  }
  t = t.replace(/[!¡¿?.,]+/g, '').trim();
  return t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// Destinos frecuentes: el nombre en español rara vez coincide con cómo está titulada la foto.
const ALIASES: Array<[RegExp, string[]]> = [
  [/iguazu|cataratas/, ['Iguazu Falls']],
  [/bariloche/, ['Bariloche Lago Nahuel Huapi', 'Cerro Catedral Bariloche']],
  [/ushuaia|fin del mundo|tierra del fuego/, ['Ushuaia Beagle Channel']],
  [/calafate|perito moreno/, ['Perito Moreno Glacier']],
  [/mendoza/, ['Mendoza vineyards Andes', 'Aconcagua']],
  [/salta/, ['Salta Argentina landscape']],
  [/jujuy|humahuaca/, ['Quebrada de Humahuaca']],
  [/cordoba/, ['Sierras de Cordoba Argentina']],
  [/mar del plata/, ['Mar del Plata beach']],
  [/turquia|capadocia|estambul|istanbul/, ['Cappadocia hot air balloons', 'Istanbul Galata Tower']],
  [/cancun/, ['Cancun beach']],
  [/punta cana/, ['Punta Cana beach']],
  [/rio de janeiro|\brio\b/, ['Rio de Janeiro Christ the Redeemer', 'Rio de Janeiro Sugarloaf']],
  [/florianopolis/, ['Florianopolis beach']],
  [/salvador|bahia/, ['Salvador Bahia Pelourinho']],
  [/miami/, ['Miami Beach']],
  [/nueva york|new york/, ['New York City skyline']],
  [/orlando/, ['Orlando Florida']],
  [/madrid/, ['Madrid Plaza Mayor']],
  [/paris/, ['Paris Eiffel Tower']],
  [/roma/, ['Rome Colosseum']],
  [/italia/, ['Italy Amalfi Coast']],
  [/egipto/, ['Pyramids of Giza']],
  [/peru|machu picchu|cusco/, ['Machu Picchu']],
  [/cartagena/, ['Cartagena de Indias']],
  [/aruba/, ['Aruba beach']],
  [/santiago de chile|chile/, ['Santiago de Chile']],
  [/grecia|santorini/, ['Santorini Oia']],
];

const SCENIC =
  /(beach|playa|falls|cataratas|waterfall|mountain|montana|lake|lago|landscape|paisaje|sunset|sunrise|atardecer|amanecer|aerial|skyline|bay|coast|costa|panoram|glacier|glaciar|cathedral|catedral|tower|torre|monument|cerro|laguna|valley|valle|island|isla|canyon|desert|river|rio|forest|selva|balloon|globo|temple|templo|palace|palacio|bridge|puente|vineyard|bodega|nature|naturaleza|national park|parque nacional|view|vista)/;
const UNSCENIC =
  /(tugboat|remolcador|vessel|walmart|seller|vendedor|statue|estatua|construction|obra|edificio|building|consulado|consulate|hotel|room|suite|lobby|street|calle|bus|car |coche|store|shop|tienda|market|feria|mercado|portrait|retrato|sign|cartel|airport|aeropuerto|menu|food|comida|restaurant|school|escuela|hospital|bank|banco|office|oficina|gas station|parking|candy|selfie|graffiti|protest|stadium|estadio|bicycle|bike|train|tren|garden gnome|billboard)/;

// Nunca se sugiere contenido para adultos.
const ADULT = /(nude|nudist|naked|topless|nudism|nudista|desnud|erotic|porn|sexy|\bsex\b|explicit|lingerie|fetish|genital|breast)/;

const BAD_TITLE = /(map|mapa|flag|logo|coat of arms|locator|diagram|chart|plan |poster|stamp|panorama of|\.svg)/i;

interface ApiPage {
  title: string;
  imageinfo?: Array<{
    width: number;
    height: number;
    mime: string;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function keywords(query: string): string[] {
  return plain(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !['beach', 'landscape', 'skyline', 'view'].includes(w));
}

async function searchOnce(query: string, bonus: number, signal?: AbortSignal): Promise<Array<PhotoSuggestion & { score: number }>> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '40',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName|ImageDescription|Categories',
    iiurlwidth: '1920',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!res.ok) throw new Error(`Commons respondió ${res.status}`);
  const json = (await res.json()) as { query?: { pages?: Record<string, ApiPage> } };
  const pages = Object.values(json.query?.pages ?? {});

  const words = keywords(query);
  const out: Array<PhotoSuggestion & { score: number }> = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info || info.mime !== 'image/jpeg' || !info.thumburl) continue;
    if (info.width < 1400 || BAD_TITLE.test(p.title)) continue;
    const ratio = info.width / info.height;
    if (ratio > 2.2) continue;
    const meta = info.extmetadata ?? {};
    // La búsqueda de Commons devuelve cosas sueltas: se exige que el título o la descripción nombren el lugar.
    const haystack = plain(`${p.title} ${stripTags(meta.ImageDescription?.value ?? '')} ${stripTags(meta.Categories?.value ?? '')}`);
    if (words.length && !words.some((w) => haystack.includes(w))) continue;
    if (ADULT.test(haystack)) continue;
    const artist = stripTags(meta.Artist?.value ?? '') || 'Autor desconocido';
    const license = stripTags(meta.LicenseShortName?.value ?? '') || 'licencia libre';
    // Se prioriza lo vertical (rinde mejor en historias) y lo grande.
    const scenic = (haystack.match(new RegExp(SCENIC.source, 'g')) ?? []).length;
    const unscenic = (haystack.match(new RegExp(UNSCENIC.source, 'g')) ?? []).length;
    const score =
      (ratio < 1 ? 3 : ratio < 1.5 ? 1.5 : 0) +
      Math.min(info.width, 4500) / 4500 +
      Math.min(scenic, 3) * 2 -
      Math.min(unscenic, 2) * 5 +
      bonus;
    out.push({
      id: p.title,
      title: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
      thumb: info.thumburl.replace(/\/\d+px-/, '/330px-'),
      full: info.thumburl,
      credit: `Foto: ${artist.slice(0, 40)} · ${license} · Wikimedia Commons`,
      page: info.descriptionurl ?? '',
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Busca fotos para un destino. Mezcla variantes (alias conocidos + el nombre tal cual). */
const cache = new Map<string, PhotoSuggestion[]>();

export async function searchPhotos(place: string, signal?: AbortSignal): Promise<PhotoSuggestion[]> {
  const q = place.trim();
  if (!q) return [];
  const hit = cache.get(plain(q));
  if (hit) return hit;
  const key = plain(q);
  const queries: Array<{ q: string; bonus: number }> = [];
  for (const [re, qs] of ALIASES) if (re.test(key)) queries.push(...qs.map((x) => ({ q: x, bonus: 4 })));
  queries.push({ q, bonus: 0 });
  if (queries.length === 1) queries.push({ q: `${q} landscape`, bonus: 1 });

  const batches = await Promise.allSettled(queries.slice(0, 3).map((x) => searchOnce(x.q, x.bonus, signal)));
  const all = batches
    .flatMap((b) => (b.status === 'fulfilled' ? b.value : []))
    .sort((x, y) => (y as PhotoSuggestion & { score: number }).score - (x as PhotoSuggestion & { score: number }).score);
  const seen = new Set<string>();
  const baseSeen = new Set<string>();
  const merged: PhotoSuggestion[] = [];
  for (const sg of all) {
    if (seen.has(sg.id)) continue;
    // Evita 10 fotos casi idénticas de la misma serie ("... 1", "... 2").
    const base = sg.title.replace(/[\d\s_-]+$/g, '').slice(0, 28).toLowerCase();
    if (baseSeen.has(base)) continue;
    seen.add(sg.id);
    baseSeen.add(base);
    merged.push(sg);
    if (merged.length >= 12) break;
  }
  if (!merged.length && batches.every((b) => b.status === 'rejected')) {
    throw new Error('El banco de fotos no respondió. Probá de nuevo en un minuto.');
  }
  const result = merged.slice(0, 12);
  if (result.length) cache.set(plain(q), result);
  return result;
}
