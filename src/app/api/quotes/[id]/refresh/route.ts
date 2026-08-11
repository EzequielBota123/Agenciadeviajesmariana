import { isAuthorizedRequest, unauthorized } from '@/lib/auth';
import { checkFareForQuote, QuotingError } from '@/lib/quoting';
import { composeQuoteMessage, DISCLAIMER, fareDeltaLabel } from '@/lib/agent/reply';
import { store } from '@/lib/store';
import { quoteUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// El worker de scraping puede tardar hasta ~100s (cold start + navegador).
export const maxDuration = 110;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Consulta la tarifa del día para esta cotización y devuelve, además del
 * snapshot, el mensaje ya redactado para mandarle al cliente — con la fecha de
 * consulta y el aviso de vigencia incluidos, que es el punto de todo esto.
 */
export async function POST(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  const quote = await store().getQuote(id);
  if (!quote) return Response.json({ error: 'Consulta no encontrada.' }, { status: 404 });

  try {
    const { snapshot, simulated, fallbackReason } = await checkFareForQuote(quote);
    const pkg = quote.packageId ? await store().getPackage(quote.packageId) : null;
    const url = quoteUrl(quote.token);

    return Response.json({
      snapshot,
      deltaLabel: fareDeltaLabel(snapshot),
      simulated,
      fallbackReason,
      disclaimer: DISCLAIMER,
      url,
      message: composeQuoteMessage({ quote, snapshot, pkg, publicUrl: url }),
    });
  } catch (err) {
    if (err instanceof QuotingError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/quotes/:id/refresh]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'No se pudo consultar la tarifa.' },
      { status: 502 },
    );
  }
}
