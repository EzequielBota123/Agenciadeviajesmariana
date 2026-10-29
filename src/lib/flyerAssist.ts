import Anthropic from '@anthropic-ai/sdk';
import { FLYER_ICONS, iconFor, parseFlyerText, type FlyerData } from '@/lib/flyer';

export interface AssistResult {
  fields: Partial<FlyerData>;
  /** Búsquedas de foto sugeridas (en inglés, pensadas para un banco de imágenes). */
  photoQueries: string[];
  place: string;
  engine: 'claude' | 'reglas';
  note: string | null;
}

const MODEL = 'claude-opus-5';

const SYSTEM = `Sos el asistente de diseño de una agencia de viajes argentina. Recibís el texto crudo de un programa turístico y lo convertís en los datos de un flyer para Instagram.

Reglas:
- Respetá TEXTUALMENTE precios, monedas, cuotas, fechas y cantidades. Nunca inventes ni cambies un número. Si algo no está en el texto, devolvé "" (o [] para listas).
- title: nombre del producto en mayúsculas, corto (ej: "EXPERIENCIA IGUAZÚ").
- label: etiqueta corta sobre el título ("Salida grupal", "Paquete", "Escapada"...). Si el texto dice salida grupal, usalo.
- tagline: frase destacada solo si el texto la trae (ej: "¡En oferta!"); si no, "".
- currency: "$" o "USD" tal cual figura. price: solo el número con su formato (ej: "890.000").
- priceNote: cuotas / impuestos / condición junto al precio, corto (ej: "6 cuotas sin interés").
- dates: fechas o rango de salidas, en una frase corta.
- includes: una línea por prestación, redactada breve, sin viñetas. Podés quitar ceros a la izquierda ("03 noches" → "3 noches").
- icons: un ícono por cada línea de includes, en el mismo orden, elegido solo de esta lista: ${FLYER_ICONS.join(', ')}.
- excludes: lo que no incluye, en una línea.
- route: recorrido o ciudades si el texto las menciona (separadas por " · "), si no "".
- place: el destino principal, solo el nombre del lugar.
- photoQueries: 2 o 3 búsquedas EN INGLÉS para encontrar una foto vertical, impactante y turística de ese destino en un banco de fotos (lugares emblemáticos o paisajes, nunca personas ni edificios comunes). Ej: "Iguazu Falls", "Iguazu Falls aerial".`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    label: { type: 'string' },
    tagline: { type: 'string' },
    dates: { type: 'string' },
    currency: { type: 'string' },
    price: { type: 'string' },
    priceNote: { type: 'string' },
    includes: { type: 'array', items: { type: 'string' } },
    icons: { type: 'array', items: { type: 'string', enum: FLYER_ICONS } },
    excludes: { type: 'string' },
    route: { type: 'string' },
    place: { type: 'string' },
    photoQueries: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title', 'label', 'tagline', 'dates', 'currency', 'price', 'priceNote',
    'includes', 'icons', 'excludes', 'route', 'place', 'photoQueries',
  ],
  additionalProperties: false,
} as const;

interface Raw {
  title: string;
  label: string;
  tagline: string;
  dates: string;
  currency: string;
  price: string;
  priceNote: string;
  includes: string[];
  icons: string[];
  excludes: string;
  route: string;
  place: string;
  photoQueries: string[];
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Los números del texto original no pueden cambiar: se comprueba que el precio siga ahí. */
function priceIsFaithful(text: string, price: string): boolean {
  if (!price) return true;
  const digits = (x: string) => x.replace(/\D/g, '');
  return digits(text).includes(digits(price));
}

function fromRules(text: string, note: string | null): AssistResult {
  const fields = parseFlyerText(text);
  const includes = fields.includes ?? [];
  fields.icons = includes.map(iconFor);
  const place = (fields.title ?? '').replace(/^(EXPERIENCIA|ESCAPADA|VIAJE A)\s+/i, '');
  return { fields, photoQueries: [], place, engine: 'reglas', note };
}

export async function assistFlyer(text: string): Promise<AssistResult> {
  if (!process.env.ANTHROPIC_API_KEY) return fromRules(text, null);

  try {
    const api = new Anthropic();
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: text }],
    });
    if (response.stop_reason === 'refusal') throw new Error('El modelo declinó procesar el texto');
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Respuesta vacía del modelo');
    const raw = JSON.parse(block.text) as Raw;

    if (!priceIsFaithful(text, str(raw.price, 20))) throw new Error('El precio interpretado no coincide con el texto');

    const includes = (Array.isArray(raw.includes) ? raw.includes : []).map((i) => str(i, 140)).filter(Boolean).slice(0, 10);
    const icons = includes.map((inc, i) =>
      FLYER_ICONS.includes(raw.icons?.[i] as never) ? raw.icons[i] : iconFor(inc),
    );
    const fields: Partial<FlyerData> = {
      title: str(raw.title, 60).toUpperCase(),
      label: str(raw.label, 30),
      tagline: str(raw.tagline, 30),
      dates: str(raw.dates, 140),
      currency: str(raw.currency, 4),
      price: str(raw.price, 20),
      priceNote: str(raw.priceNote, 80),
      includes,
      icons,
      excludes: str(raw.excludes, 160),
      route: str(raw.route, 200),
    };
    return {
      fields,
      photoQueries: (Array.isArray(raw.photoQueries) ? raw.photoQueries : []).map((q) => str(q, 60)).filter(Boolean).slice(0, 3),
      place: str(raw.place, 60),
      engine: 'claude',
      note: null,
    };
  } catch (e) {
    return fromRules(text, e instanceof Error ? `Claude no respondió (${e.message}); se usaron reglas.` : null);
  }
}
