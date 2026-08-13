import { compareFares } from '@/lib/fares/compare';
import { EXPLORE_TAG, exploreDepartDate, todaysExploreBatch } from '@/lib/explore';
import { store } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Barrido de varias rutas en secuencia (una por una, cada una ya compara 3
// fuentes puertas adentro) — generoso a propósito, igual que el cron de
// paquetes: mejor terminar el lote de hoy que cortar a la mitad.
export const maxDuration = 280;

const TIME_BUDGET_MS = 250_000;

/**
 * Precalcula precios para "Explorar destinos" (ver /explorar): un ranking de
 * destinos por precio, tipo Google Flights, que carga instantáneo porque
 * nunca scrapea en vivo — lee lo que este cron va dejando guardado. Como
 * cubrir las ~245 rutas (5 orígenes × 49 destinos) de una sola vez no entra
 * en el tiempo de una función, el cron avanza de a un lote rotativo por día
 * (ver todaysExploreBatch) hasta dar la vuelta completa.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'No autorizado.' }, { status: 401 });
    }
  }

  const departDate = exploreDepartDate();
  const batch = todaysExploreBatch();
  const started = Date.now();

  const results: Array<Record<string, unknown>> = [];

  for (const route of batch) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      results.push({ skipped: 'sin tiempo, sigue en el próximo barrido', remaining: batch.length - results.length });
      break;
    }

    try {
      const { results: fares, errors } = await compareFares({
        origin: route.origin,
        destination: route.destination,
        departDate,
        pax: 2,
        cabin: 'ECONOMY',
      });

      for (const fare of fares) {
        await store().addSnapshot({
          quoteId: null,
          packageId: null,
          origin: route.origin,
          destination: route.destination,
          departDate,
          returnDate: null,
          pax: 2,
          provider: fare.provider,
          carrier: fare.carrier,
          cabin: fare.cabin,
          nativeCurrency: fare.nativeCurrency,
          pricePerPaxNative: fare.pricePerPaxNative,
          totalNative: fare.totalNative,
          pricePerPaxUsd: fare.pricePerPaxUsd,
          totalUsd: fare.totalUsd,
          exchangeRate: fare.exchangeRate,
          seatsLeft: fare.seatsLeft,
          fetchedAt: fare.fetchedAt,
          validUntil: fare.validUntil,
          raw: { ...(fare.raw && typeof fare.raw === 'object' ? fare.raw : {}), [EXPLORE_TAG]: true },
        });
      }

      results.push({
        origin: route.origin,
        destination: route.destination,
        ok: fares.length,
        errors: errors.map((e) => e.carrier),
      });
    } catch (err) {
      console.error(`[cron/explore-fares] falló ${route.origin}-${route.destination}:`, err);
      results.push({
        origin: route.origin,
        destination: route.destination,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    ok: true,
    departDate,
    batchSize: batch.length,
    durationMs: Date.now() - started,
    results,
  });
}
