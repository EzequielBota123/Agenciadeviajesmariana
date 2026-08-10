import { addDays, arToday, isValidDate } from '@/lib/dates';
import { findAirport } from './airports';
import type { ExtractedParams } from './parse';

// Parser por reglas. Es el que corre cuando no hay ANTHROPIC_API_KEY, y también
// el que valida/completa lo que devuelve el modelo. Cubre las formas en que la
// gente escribe fechas y pasajeros por WhatsApp en Argentina.

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9, sept: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10,
};

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Si el mes ya pasó y no se aclaró el año, se asume el año que viene.
 * Es lo que quiere decir alguien que en agosto escribe "para el 15 de marzo".
 */
function resolveYear(month: number, day: number, explicitYear: number | null, today: string): number {
  if (explicitYear) return explicitYear < 100 ? 2000 + explicitYear : explicitYear;
  const [ty, tm, td] = today.split('-').map(Number);
  if (month > tm || (month === tm && day >= td)) return ty;
  return ty + 1;
}

function toIso(year: number, month: number, day: number): string | null {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isValidDate(iso)) return null;
  // Rechaza cosas tipo 31 de febrero, que el regex deja pasar.
  const d = new Date(`${iso}T00:00:00Z`);
  if (d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return iso;
}

/** Extrae todas las fechas mencionadas, en orden de aparición. */
export function extractDates(text: string, today = arToday()): string[] {
  const t = normalize(text);
  const found: Array<{ index: number; iso: string }> = [];

  // "15 de noviembre", "15 de nov del 2026", "15 nov"
  const monthNames = Object.keys(MONTHS).join('|');
  const reWords = new RegExp(
    `\\b(\\d{1,2})\\s*(?:de\\s+)?(${monthNames})\\b(?:\\s*(?:de[l]?\\s*)?(\\d{2,4}))?`,
    'g',
  );
  for (const m of t.matchAll(reWords)) {
    const day = Number(m[1]);
    const month = MONTHS[m[2]];
    const year = resolveYear(month, day, m[3] ? Number(m[3]) : null, today);
    const iso = toIso(year, month, day);
    if (iso) found.push({ index: m.index ?? 0, iso });
  }

  // "15/11", "15/11/2026", "15-11-26"
  const reNumeric = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/g;
  for (const m of t.matchAll(reNumeric)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = resolveYear(month, day, m[3] ? Number(m[3]) : null, today);
    const iso = toIso(year, month, day);
    if (iso) found.push({ index: m.index ?? 0, iso });
  }

  // ISO explícito
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) found.push({ index: m.index ?? 0, iso });
  }

  return [...new Map(found.sort((a, b) => a.index - b.index).map((f) => [f.iso, f])).values()].map(
    (f) => f.iso,
  );
}

/** Cantidad de pasajeros: "somos 2", "2 adultos y 1 menor", "para tres personas". */
export function extractPax(text: string): { adults: number | null; children: number | null } {
  const t = normalize(text);
  let adults: number | null = null;
  let children: number | null = null;

  const numberToken = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;

  const readNumber = (raw: string): number => NUMBER_WORDS[raw] ?? Number(raw);

  const childRe = new RegExp(`\\b${numberToken}\\s*(menor(?:es)?|nino?s?|ninos?|chicos?|kids?)\\b`);
  const childMatch = t.match(childRe);
  if (childMatch) children = readNumber(childMatch[1]);

  const adultRe = new RegExp(`\\b${numberToken}\\s*(adultos?|personas?|pasajeros?|pax)\\b`);
  const adultMatch = t.match(adultRe);
  if (adultMatch) adults = readNumber(adultMatch[1]);

  if (adults === null) {
    const somosRe = new RegExp(`\\bsomos\\s+${numberToken}\\b`);
    const somos = t.match(somosRe);
    if (somos) adults = readNumber(somos[1]);
  }

  if (adults === null && /\bsolo\s*(yo|una persona)\b|\bviajo solo\b|\bviajo sola\b/.test(t)) {
    adults = 1;
  }
  // "con mi señora", "en pareja", "los dos" — todas quieren decir 2.
  if (
    adults === null &&
    /\bpareja\b|\blos dos\b|\bmi (esposo|esposa|novio|novia|marido|mujer|senora|senor|pareja)\b/.test(t)
  ) {
    adults = 2;
  }

  const valid = (n: number | null) => (n !== null && n >= 1 && n <= 20 ? n : null);
  const validChild = (n: number | null) => (n !== null && n >= 0 && n <= 10 ? n : null);

  return { adults: valid(adults), children: validChild(children) };
}

export function extractTimePreference(text: string): ExtractedParams['timePreference'] {
  const t = normalize(text);
  if (/\b(a la manana|por la manana|temprano|matutino|de manana)\b/.test(t)) return 'mañana';
  if (/\b(a la tarde|por la tarde|de tarde|vespertino)\b/.test(t)) return 'tarde';
  if (/\b(a la noche|por la noche|de noche|nocturno|nochero)\b/.test(t)) return 'noche';
  if (/\b(cualquier horario|me da igual|indistinto|no importa el horario)\b/.test(t)) return 'indistinto';
  return null;
}

/** Duración: "7 noches", "una semana", "10 dias". */
export function extractNights(text: string): number | null {
  const t = normalize(text);
  const weeks = t.match(/\b(\d{1,2})\s*semanas?\b/);
  if (weeks) return Number(weeks[1]) * 7;
  if (/\buna semana\b/.test(t)) return 7;
  if (/\bquince dias\b|\b15 dias\b/.test(t)) return 15;
  const nights = t.match(/\b(\d{1,2})\s*(noches?|dias?)\b/);
  if (nights) {
    const n = Number(nights[1]);
    return n >= 1 && n <= 60 ? n : null;
  }
  return null;
}

/**
 * Extracción completa por reglas. Devuelve solo lo que encontró: los campos en
 * null significan "el cliente no lo dijo", no "borralo".
 */
export function extractByRules(text: string, today = arToday()): ExtractedParams {
  const dates = extractDates(text, today);
  const pax = extractPax(text);
  const nights = extractNights(text);

  // "desde Córdoba a Cancún" — si hay un "desde/de X", ese es el origen.
  let originIata: string | null = null;
  let destinationIata: string | null = null;

  const fromMatch = text.match(/\b(?:desde|saliendo de|partiendo de)\s+([\p{L}\s]{3,30})/iu);
  if (fromMatch) originIata = findAirport(fromMatch[1])?.iata ?? null;

  const toMatch = text.match(/\b(?:a|para|hacia|hasta|destino)\s+([\p{L}\s]{3,30})/iu);
  if (toMatch) destinationIata = findAirport(toMatch[1])?.iata ?? null;

  if (!destinationIata) {
    const anywhere = findAirport(text);
    if (anywhere && anywhere.iata !== originIata) destinationIata = anywhere.iata;
  }

  const departDate = dates[0] ?? null;
  let returnDate = dates[1] ?? null;
  if (!returnDate && departDate && nights) returnDate = addDays(departDate, nights);

  return {
    originIata,
    destinationIata,
    departDate,
    returnDate,
    paxAdults: pax.adults,
    paxChildren: pax.children,
    timePreference: extractTimePreference(text),
    confidence: departDate || pax.adults || destinationIata ? 0.6 : 0.2,
    summary: 'Extraído con el parser por reglas (sin modelo de lenguaje).',
  };
}
