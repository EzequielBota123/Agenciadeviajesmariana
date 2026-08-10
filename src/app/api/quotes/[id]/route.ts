import { isAuthorizedRequest, unauthorized } from '@/lib/auth';
import { store } from '@/lib/store';
import { quoteUrl } from '@/lib/urls';
import type { QuoteStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const STATUSES: QuoteStatus[] = ['abierta', 'cotizada', 'cerrada', 'perdida'];

export async function GET(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  const quote = await store().getQuote(id);
  if (!quote) return Response.json({ error: 'Consulta no encontrada.' }, { status: 404 });

  const [events, snapshots, pkg] = await Promise.all([
    store().listEvents(quote.id),
    store().listSnapshots({ quoteId: quote.id, limit: 30 }),
    quote.packageId ? store().getPackage(quote.packageId) : Promise.resolve(null),
  ]);

  return Response.json({ quote, events, snapshots, package: pkg, url: quoteUrl(quote.token) });
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  let body: { status?: QuoteStatus; customerName?: string | null; customerContact?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  if (body.status && !STATUSES.includes(body.status)) {
    return Response.json({ error: `Estado no válido. Opciones: ${STATUSES.join(', ')}` }, { status: 400 });
  }

  const updated = await store().updateQuote(id, body);
  if (!updated) return Response.json({ error: 'Consulta no encontrada.' }, { status: 404 });

  if (body.status) {
    await store().addEvent({
      quoteId: id,
      kind: 'estado',
      actor: 'agente',
      text: `Estado de la consulta: ${body.status}`,
      data: null,
    });
  }

  return Response.json({ quote: updated });
}
