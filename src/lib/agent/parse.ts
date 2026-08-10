import Anthropic from '@anthropic-ai/sdk';
import { addDays, arToday, isValidDate } from '@/lib/dates';
import { DEFAULT_PARAMS, type QuoteParams, type TimePreference } from '@/lib/types';
import { AIRPORT_HINT, findAirport, isKnownIata } from './airports';
import { extractByRules } from './rules';

export interface ExtractedParams {
  originIata: string | null;
  destinationIata: string | null;
  departDate: string | null;
  returnDate: string | null;
  paxAdults: number | null;
  paxChildren: number | null;
  timePreference: TimePreference | null;
  confidence: number;
  summary: string;
}

export interface ParseOutcome {
  /** Parámetros nuevos, ya fusionados con los que ya tenía la consulta. */
  params: QuoteParams;
  /** Qué cambió respecto de lo anterior, en castellano, para el timeline. */
  changes: string[];
  extracted: ExtractedParams;
  engine: 'claude' | 'reglas';
  /** Se completa si el modelo falló y hubo que caer al parser por reglas. */
  degradedReason: string | null;
}

const MODEL = 'claude-opus-5';

const SYSTEM_PROMPT = `Sos el motor de extracción de una agencia de viajes argentina. Recibís un mensaje de WhatsApp de un cliente y devolvés los parámetros del viaje que menciona.

Reglas:
- Extraé SOLO lo que el mensaje dice. Si algo no se menciona, devolvé null. No completes con valores por defecto ni con lo que te parezca probable.
- Las fechas van en formato YYYY-MM-DD. Si el cliente dice un día y mes sin año, elegí la próxima ocurrencia de esa fecha a partir de hoy.
- Los aeropuertos van en código IATA, elegidos de esta lista: ${AIRPORT_HINT}. Si el destino que menciona no está en la lista, devolvé null.
- El origen por defecto de la agencia es Buenos Aires; devolvé un origen solo si el cliente lo dice explícitamente ("salgo desde Córdoba").
- Si el mensaje corrige algo dicho antes ("mejor el 15", "somos 2 no 1"), extraé el valor CORREGIDO.
- timePreference solo puede ser: mañana, tarde, noche, indistinto.
- confidence es 0 a 1: qué tan seguro estás de haber entendido el pedido.
- summary: una línea en castellano rioplatense describiendo qué pidió el cliente.`;

const SCHEMA = {
  type: 'object',
  properties: {
    originIata: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Código IATA del aeropuerto de salida, o null si no se menciona.',
    },
    destinationIata: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Código IATA del destino, o null si no se menciona o no está en la lista.',
    },
    departDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Fecha de ida en formato YYYY-MM-DD, o null.',
    },
    returnDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Fecha de vuelta en formato YYYY-MM-DD, o null.',
    },
    paxAdults: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Cantidad de adultos, o null.',
    },
    paxChildren: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'Cantidad de menores, o null.',
    },
    timePreference: {
      anyOf: [{ type: 'string', enum: ['mañana', 'tarde', 'noche', 'indistinto'] }, { type: 'null' }],
      description: 'Franja horaria preferida para el vuelo, o null.',
    },
    confidence: { type: 'number', description: 'Confianza de 0 a 1.' },
    summary: { type: 'string', description: 'Resumen de una línea del pedido.' },
  },
  required: [
    'originIata',
    'destinationIata',
    'departDate',
    'returnDate',
    'paxAdults',
    'paxChildren',
    'timePreference',
    'confidence',
    'summary',
  ],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export function agentEngine(): 'claude' | 'reglas' {
  return process.env.ANTHROPIC_API_KEY ? 'claude' : 'reglas';
}

async function extractWithClaude(message: string, current: QuoteParams): Promise<ExtractedParams> {
  const api = anthropic();
  if (!api) throw new Error('ANTHROPIC_API_KEY no configurada');

  const response = await api.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    output_config: {
      // Extracción estructurada: no hace falta razonamiento profundo, y el
      // esfuerzo bajo mantiene la latencia dentro de lo que tolera un chat.
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          `Hoy es ${arToday()} (hora argentina).`,
          '',
          'Estado actual de la consulta (lo que ya sabíamos):',
          JSON.stringify(
            {
              origen: current.origin,
              destino: current.destination,
              fechaIda: current.departDate,
              fechaVuelta: current.returnDate,
              adultos: current.paxAdults,
              menores: current.paxChildren,
              horario: current.timePreference,
            },
            null,
            2,
          ),
          '',
          'Mensaje nuevo del cliente:',
          message,
        ].join('\n'),
      },
    ],
  });

  // En Claude Opus 5 los clasificadores pueden declinar un pedido: llega un
  // 200 con stop_reason "refusal" y content vacío. Hay que mirarlo antes de
  // tocar content, si no rompe con un índice indefinido.
  if (response.stop_reason === 'refusal') {
    throw new Error('El modelo declinó procesar el mensaje');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('El modelo no devolvió contenido de texto');
  }

  return JSON.parse(textBlock.text) as ExtractedParams;
}

/** Descarta lo que el modelo se pudo haber inventado. */
function sanitize(raw: ExtractedParams): ExtractedParams {
  const clampPax = (n: number | null, min: number, max: number) =>
    typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;

  const iata = (code: string | null) => {
    if (!code) return null;
    const upper = code.toUpperCase();
    if (isKnownIata(upper)) return upper;
    // Puede haber devuelto el nombre de la ciudad en vez del código.
    return findAirport(code)?.iata ?? null;
  };

  const validTimes: TimePreference[] = ['mañana', 'tarde', 'noche', 'indistinto'];

  return {
    originIata: iata(raw.originIata),
    destinationIata: iata(raw.destinationIata),
    departDate: isValidDate(raw.departDate) ? raw.departDate : null,
    returnDate: isValidDate(raw.returnDate) ? raw.returnDate : null,
    paxAdults: clampPax(raw.paxAdults, 1, 20),
    paxChildren: clampPax(raw.paxChildren, 0, 10),
    timePreference:
      raw.timePreference && validTimes.includes(raw.timePreference) ? raw.timePreference : null,
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : '',
  };
}

function nightsBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** Fusiona lo extraído sobre lo que ya sabíamos, y describe qué cambió. */
function merge(current: QuoteParams, e: ExtractedParams): { params: QuoteParams; changes: string[] } {
  const changes: string[] = [];
  const next: QuoteParams = { ...current };

  if (e.originIata && e.originIata !== current.origin) {
    changes.push(`Origen: ${current.origin} → ${e.originIata}`);
    next.origin = e.originIata;
  }
  if (e.destinationIata && e.destinationIata !== current.destination) {
    changes.push(`Destino: ${current.destination} → ${e.destinationIata}`);
    next.destination = e.destinationIata;
  }

  // Largo del viaje antes del cambio, para poder arrastrar la vuelta.
  const previousNights =
    current.departDate && current.returnDate
      ? nightsBetween(current.departDate, current.returnDate)
      : null;

  if (e.departDate && e.departDate !== current.departDate) {
    changes.push(`Fecha de ida: ${current.departDate ?? 'sin definir'} → ${e.departDate}`);
    next.departDate = e.departDate;
  }
  if (e.returnDate && e.returnDate !== current.returnDate) {
    changes.push(`Fecha de vuelta: ${current.returnDate ?? 'sin definir'} → ${e.returnDate}`);
    next.returnDate = e.returnDate;
  }

  // "Mejor el 22" quiere decir correr el viaje entero, no dejar la vuelta
  // clavada donde estaba. Si el cliente movió la ida sin decir nada de la
  // vuelta, la arrastramos manteniendo la cantidad de noches.
  if (
    next.departDate &&
    next.returnDate &&
    e.departDate &&
    !e.returnDate &&
    previousNights !== null &&
    previousNights > 0
  ) {
    const shifted = addDays(next.departDate, previousNights);
    if (shifted !== next.returnDate) {
      changes.push(
        `Fecha de vuelta: ${next.returnDate} → ${shifted} (se mantienen ${previousNights} noches)`,
      );
      next.returnDate = shifted;
    }
  }

  // Red de seguridad: una vuelta anterior o igual a la ida no se cotiza.
  if (next.departDate && next.returnDate && next.returnDate <= next.departDate) {
    changes.push(
      `Fecha de vuelta: ${next.returnDate} quedó antes de la ida, se borra hasta confirmarla`,
    );
    next.returnDate = null;
  }
  if (e.paxAdults !== null && e.paxAdults !== current.paxAdults) {
    changes.push(`Adultos: ${current.paxAdults} → ${e.paxAdults}`);
    next.paxAdults = e.paxAdults;
  }
  if (e.paxChildren !== null && e.paxChildren !== current.paxChildren) {
    changes.push(`Menores: ${current.paxChildren} → ${e.paxChildren}`);
    next.paxChildren = e.paxChildren;
  }
  if (e.timePreference && e.timePreference !== current.timePreference) {
    changes.push(`Horario preferido: ${current.timePreference} → ${e.timePreference}`);
    next.timePreference = e.timePreference;
  }

  return { params: next, changes };
}

/**
 * Toma un mensaje libre del cliente y lo convierte en parámetros de cotización.
 *
 * Si hay ANTHROPIC_API_KEY usa Claude; si el modelo falla o no está configurado,
 * cae al parser por reglas. Nunca tira la consulta: en el peor caso devuelve los
 * parámetros que ya tenía y una lista de cambios vacía.
 */
export async function parseCustomerMessage(
  message: string,
  current: QuoteParams = DEFAULT_PARAMS,
): Promise<ParseOutcome> {
  const today = arToday();

  if (agentEngine() === 'claude') {
    try {
      const extracted = sanitize(await extractWithClaude(message, current));
      const { params, changes } = merge(current, extracted);
      return { params, changes, extracted, engine: 'claude', degradedReason: null };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[agente] Claude falló, uso el parser por reglas:', reason);
      const extracted = extractByRules(message, today);
      const { params, changes } = merge(current, extracted);
      return { params, changes, extracted, engine: 'reglas', degradedReason: reason };
    }
  }

  const extracted = extractByRules(message, today);
  const { params, changes } = merge(current, extracted);
  return { params, changes, extracted, engine: 'reglas', degradedReason: null };
}
