import Anthropic from '@anthropic-ai/sdk';
import { CAROUSEL_ICONS, iconForTip, parseCarouselText, serializeCarousel, type CarouselData } from '@/lib/carousel';

const MODEL = 'claude-opus-5';

const SYSTEM = `Sos el asistente de contenido de una agencia de viajes argentina. Recibís notas sueltas (requisitos, consejos, información de un destino) y las ordenás en un carrusel de Instagram: portada + varias láminas + cierre.

Reglas:
- Usá SOLO la información del texto. No inventes requisitos, plazos, cifras, sitios web ni datos legales. Si el texto trae poco, hacé menos láminas.
- Respetá TEXTUALMENTE números, plazos, montos y direcciones web.
- kicker: 1 o 2 palabras grandes para la portada (ej: "Mil tips", "Guía", "Tips").
- title: título de la portada (ej: "Requisitos para ingresar a India").
- subtitle: frase corta de gancho (ej: "Todo lo que necesitás saber antes de viajar"), o "".
- slides: de 2 a 6 láminas. heading corto (2-4 palabras). items: 2 a 4 puntos MUY breves; en cada uno poné entre ** ** las 1 a 3 palabras clave (ej: "Solicitala entre **15 y 30 días** antes del viaje."). icons: un ícono por punto, en orden, de esta lista: ${CAROUSEL_ICONS.join(', ')}.
- source: sitio oficial si el texto lo menciona (ej: "Sitio oficial: indianvisaonline.gov.in"), si no "".
- note: un aviso importante corto si corresponde, si no "".
- closingTitle: ej "¿Más tips?" y closingText: invitación a comentar o consultar.`;

const SCHEMA = {
  type: 'object',
  properties: {
    kicker: { type: 'string' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
          icons: { type: 'array', items: { type: 'string', enum: CAROUSEL_ICONS } },
          source: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['heading', 'items', 'icons', 'source', 'note'],
        additionalProperties: false,
      },
    },
    closingTitle: { type: 'string' },
    closingText: { type: 'string' },
  },
  required: ['kicker', 'title', 'subtitle', 'slides', 'closingTitle', 'closingText'],
  additionalProperties: false,
} as const;

export interface CarouselAssistResult {
  text: string;
  engine: 'claude' | 'reglas';
  note: string | null;
}

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function assistCarousel(text: string): Promise<CarouselAssistResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { text, engine: 'reglas', note: null };
  try {
    const api = new Anthropic();
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: text }],
    });
    if (response.stop_reason === 'refusal') throw new Error('El modelo declinó procesar el texto');
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Respuesta vacía del modelo');
    const raw = JSON.parse(block.text) as Partial<CarouselData> & { slides?: Array<Record<string, unknown>> };
    const slides = (Array.isArray(raw.slides) ? raw.slides : []).slice(0, 8).map((sl) => {
      const items = (Array.isArray(sl.items) ? (sl.items as unknown[]) : []).map((i) => s(i, 160)).filter(Boolean).slice(0, 5);
      const icons = items.map((it, i) => {
        const ic = (sl.icons as string[] | undefined)?.[i];
        return ic && CAROUSEL_ICONS.includes(ic) ? ic : iconForTip(it);
      });
      return { heading: s(sl.heading, 50), items, icons, source: s(sl.source, 100), note: s(sl.note, 160) };
    });
    const data: Partial<CarouselData> = {
      kicker: s(raw.kicker, 24),
      title: s(raw.title, 80),
      subtitle: s(raw.subtitle, 100),
      slides,
      closingTitle: s(raw.closingTitle, 24),
      closingText: s(raw.closingText, 120),
    };
    return { text: serializeCarousel(data), engine: 'claude', note: 'Ordenado con Claude' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido';
    return { text, engine: 'reglas', note: `Claude no respondió (${msg}); se usa el texto tal cual.` };
  }
}

export { parseCarouselText };
