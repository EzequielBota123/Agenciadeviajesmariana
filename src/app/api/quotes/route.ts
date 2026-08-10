import { isAuthorizedRequest, unauthorized } from '@/lib/auth';
import { parseCustomerMessage } from '@/lib/agent/parse';
import { isKnownIata } from '@/lib/agent/airports';
import { isValidDate } from '@/lib/dates';
import { store } from '@/lib/store';
import { quoteUrl } from '@/lib/urls';
import { DEFAULT_PARAMS, type QuoteParams } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const quotes = await store().listQuotes({ limit: 200 });
  return Response.json({ quotes });
}

interface Body {
  /** Texto libre del cliente. Si viene, el agente extrae los parámetros. */
  message?: string;
  /** Parámetros explícitos (formulario). Se aplican sobre lo extraído. */
  params?: Partial<QuoteParams>;
  packageId?: string | null;
  customerName?: string | null;
  customerContact?: string | null;
  channel?: string;
}

/**
 * Alta de consulta. Es el punto de entrada público: lo usa el formulario de la
 * web y es el que hay que colgar de un webhook de WhatsApp / Instagram.
 *
 * Acepta texto libre, parámetros estructurados, o ambos. Los parámetros
 * explícitos ganan sobre lo que interpretó el agente.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  if (!body.message?.trim() && !body.params) {
    return Response.json(
      { error: 'Mandá al menos `message` (texto del cliente) o `params`.' },
      { status: 400 },
    );
  }

  // Un paquete elegido siembra ruta y fechas: el cliente ya vio la publicación.
  let seed: QuoteParams = { ...DEFAULT_PARAMS };
  if (body.packageId) {
    const pkg = await store().getPackage(body.packageId);
    if (!pkg) return Response.json({ error: 'El paquete indicado no existe.' }, { status: 404 });
    seed = {
      ...seed,
      origin: pkg.origin,
      destination: pkg.destination,
      departDate: pkg.departDate,
      returnDate: pkg.returnDate,
      paxAdults: pkg.paxBase,
    };
  }

  let parsed: Awaited<ReturnType<typeof parseCustomerMessage>> | null = null;
  if (body.message?.trim()) {
    parsed = await parseCustomerMessage(body.message.trim(), seed);
    seed = parsed.params;
  }

  const merged = applyExplicitParams(seed, body.params);
  if ('error' in merged) return Response.json({ error: merged.error }, { status: 400 });

  const quote = await store().createQuote({
    packageId: body.packageId ?? null,
    customerName: body.customerName ?? null,
    customerContact: body.customerContact ?? null,
    channel: body.channel ?? 'web',
    params: merged.params,
  });

  if (body.message?.trim()) {
    await store().addEvent({
      quoteId: quote.id,
      kind: 'mensaje',
      actor: 'cliente',
      text: body.message.trim(),
      data: parsed
        ? { engine: parsed.engine, extracted: parsed.extracted, degradedReason: parsed.degradedReason }
        : null,
    });
    if (parsed && parsed.changes.length > 0) {
      await store().addEvent({
        quoteId: quote.id,
        kind: 'revision',
        actor: 'sistema',
        text: parsed.changes.join(' · '),
        data: { changes: parsed.changes },
      });
    }
  }

  return Response.json(
    {
      quote,
      url: quoteUrl(quote.token),
      agent: parsed
        ? { engine: parsed.engine, changes: parsed.changes, extracted: parsed.extracted }
        : null,
    },
    { status: 201 },
  );
}

/** Valida y aplica los campos que llegaron explícitos desde un formulario. */
function applyExplicitParams(
  base: QuoteParams,
  explicit: Partial<QuoteParams> | undefined,
): { params: QuoteParams } | { error: string } {
  const next = { ...base };
  if (!explicit) return { params: next };

  if (explicit.origin !== undefined) {
    const o = explicit.origin.toUpperCase();
    if (!isKnownIata(o)) return { error: `Origen no reconocido: ${explicit.origin}` };
    next.origin = o;
  }
  if (explicit.destination !== undefined) {
    const d = explicit.destination.toUpperCase();
    if (!isKnownIata(d)) return { error: `Destino no reconocido: ${explicit.destination}` };
    next.destination = d;
  }
  if (next.origin === next.destination) {
    return { error: 'El origen y el destino no pueden ser el mismo.' };
  }
  if (explicit.departDate !== undefined && explicit.departDate !== null) {
    if (!isValidDate(explicit.departDate)) return { error: 'Fecha de salida inválida.' };
    next.departDate = explicit.departDate;
  }
  if (explicit.returnDate !== undefined) {
    if (explicit.returnDate !== null && !isValidDate(explicit.returnDate)) {
      return { error: 'Fecha de regreso inválida.' };
    }
    next.returnDate = explicit.returnDate;
  }
  if (next.returnDate && next.departDate && next.returnDate < next.departDate) {
    return { error: 'El regreso no puede ser anterior a la salida.' };
  }
  if (explicit.paxAdults !== undefined) {
    if (!Number.isInteger(explicit.paxAdults) || explicit.paxAdults < 1 || explicit.paxAdults > 20) {
      return { error: 'Los adultos tienen que ser un entero entre 1 y 20.' };
    }
    next.paxAdults = explicit.paxAdults;
  }
  if (explicit.paxChildren !== undefined) {
    if (
      !Number.isInteger(explicit.paxChildren) ||
      explicit.paxChildren < 0 ||
      explicit.paxChildren > 10
    ) {
      return { error: 'Los menores tienen que ser un entero entre 0 y 10.' };
    }
    next.paxChildren = explicit.paxChildren;
  }
  if (explicit.timePreference !== undefined) next.timePreference = explicit.timePreference;
  if (explicit.cabin !== undefined) next.cabin = explicit.cabin;

  return { params: next };
}
