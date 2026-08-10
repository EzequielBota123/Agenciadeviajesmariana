import { isAuthorizedRequest, unauthorized } from '@/lib/auth';
import { parseCustomerMessage } from '@/lib/agent/parse';
import { store } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * El corazón del problema: el cliente cambia el pedido a mitad de la charla.
 *
 * Cada mensaje nuevo entra por acá. El agente lo interpreta, calcula qué cambió
 * respecto del estado anterior, actualiza los parámetros y deja los dos eventos
 * en el timeline (el mensaje crudo y la revisión). No se pisa nada: la consulta
 * anterior sigue siendo reconstruible desde el log.
 */
export async function POST(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: 'Falta `message` con el texto del cliente.' }, { status: 400 });
  }

  const quote = await store().getQuote(id);
  if (!quote) return Response.json({ error: 'Consulta no encontrada.' }, { status: 404 });

  const parsed = await parseCustomerMessage(message, quote.params);

  await store().addEvent({
    quoteId: quote.id,
    kind: 'mensaje',
    actor: 'cliente',
    text: message,
    data: {
      engine: parsed.engine,
      extracted: parsed.extracted,
      degradedReason: parsed.degradedReason,
    },
  });

  if (parsed.changes.length === 0) {
    return Response.json({
      quote,
      changes: [],
      agent: { engine: parsed.engine, extracted: parsed.extracted },
      note: 'El mensaje no cambió ningún parámetro de la consulta.',
    });
  }

  await store().addEvent({
    quoteId: quote.id,
    kind: 'revision',
    actor: 'sistema',
    text: parsed.changes.join(' · '),
    data: { changes: parsed.changes, previous: quote.params, next: parsed.params },
  });

  const updated = await store().updateQuote(
    quote.id,
    { params: parsed.params },
    { bumpRevision: true },
  );

  return Response.json({
    quote: updated,
    changes: parsed.changes,
    agent: { engine: parsed.engine, extracted: parsed.extracted },
    note: 'Los parámetros cambiaron: conviene volver a consultar la tarifa antes de responder.',
  });
}
