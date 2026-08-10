import { checkFareForPackage, needsAttention } from '@/lib/quoting';
import { store } from '@/lib/store';
import { storageMode } from '@/lib/store';
import { activeProviderName } from '@/lib/fares';
import { daysUntil } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron diario (ver vercel.json). Revisa la tarifa real de cada paquete
 * publicado y marca los que se movieron lo suficiente como para que la pieza
 * que está pauteada en redes ya no cierre.
 *
 * Este es el paso que hace que el sistema escale: nadie reconsulta a mano
 * cada aerolínea por cada fecha publicada, todos los días.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'No autorizado.' }, { status: 401 });
    }
  }

  if (storageMode() === 'memoria') {
    // Sin base de datos el resultado del cron se pierde apenas termina la
    // función. Decirlo es más útil que escribir en el vacío.
    console.warn('[cron] Corriendo sin DATABASE_URL: los snapshots no persisten.');
  }

  const packages = await store().listPackages({ status: 'publicado' });
  const started = Date.now();

  const results: Array<Record<string, unknown>> = [];
  const alerts: Array<Record<string, unknown>> = [];

  for (const pkg of packages) {
    // Un paquete cuya fecha ya pasó no se consulta más.
    if (daysUntil(pkg.departDate) < 0) {
      results.push({ packageId: pkg.id, title: pkg.title, skipped: 'fecha pasada' });
      continue;
    }

    try {
      const { snapshot, simulated } = await checkFareForPackage(pkg);
      const attention = needsAttention(snapshot);

      results.push({
        packageId: pkg.id,
        title: pkg.title,
        totalUsd: snapshot.totalUsd,
        deltaPct: snapshot.deltaPct,
        seatsLeft: snapshot.seatsLeft,
        simulated,
      });

      if (attention) {
        alerts.push({
          packageId: pkg.id,
          title: pkg.title,
          deltaPct: snapshot.deltaPct,
          seatsLeft: snapshot.seatsLeft,
          listedPriceUsd: pkg.listedPriceUsd,
          totalUsd: snapshot.totalUsd,
          motivo:
            snapshot.seatsLeft !== null && snapshot.seatsLeft <= 3
              ? 'quedan pocos lugares en la tarifa'
              : 'la tarifa se movió por encima del umbral',
        });
      }
    } catch (err) {
      console.error(`[cron] falló el paquete ${pkg.id}:`, err);
      results.push({
        packageId: pkg.id,
        title: pkg.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    ok: true,
    provider: activeProviderName(),
    storage: storageMode(),
    checked: results.length,
    durationMs: Date.now() - started,
    alerts,
    results,
  });
}
