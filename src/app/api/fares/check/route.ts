import { activeProviderName, lookupFare } from '@/lib/fares';
import { DISCLAIMER, fareDeltaLabel } from '@/lib/agent/reply';
import { isValidDate } from '@/lib/dates';
import { isKnownIata } from '@/lib/agent/airports';
import { store } from '@/lib/store';
import { fareKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string | null;
  pax?: number;
  cabin?: string;
  timePreference?: string;
}

/**
 * Consulta suelta de tarifa: la usa el simulador de la home y sirve como
 * endpoint de prueba. No persiste nada ligado a una cotización, pero sí compara
 * contra el último snapshot de la misma ruta/fecha/pax para poder decir si subió.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  const origin = (body.origin ?? '').toUpperCase();
  const destination = (body.destination ?? '').toUpperCase();
  const departDate = body.departDate ?? '';
  const pax = Number(body.pax ?? 1);

  if (!isKnownIata(origin) || !isKnownIata(destination)) {
    return Response.json(
      { error: 'Origen o destino no reconocido. Usá un código IATA de la lista de destinos.' },
      { status: 400 },
    );
  }
  if (origin === destination) {
    return Response.json({ error: 'El origen y el destino no pueden ser el mismo.' }, { status: 400 });
  }
  if (!isValidDate(departDate)) {
    return Response.json({ error: 'Fecha de salida inválida. Formato esperado: YYYY-MM-DD.' }, { status: 400 });
  }
  if (!Number.isInteger(pax) || pax < 1 || pax > 20) {
    return Response.json({ error: 'La cantidad de pasajeros tiene que estar entre 1 y 20.' }, { status: 400 });
  }
  if (body.returnDate && !isValidDate(body.returnDate)) {
    return Response.json({ error: 'Fecha de regreso inválida.' }, { status: 400 });
  }
  if (body.returnDate && body.returnDate < departDate) {
    return Response.json({ error: 'El regreso no puede ser anterior a la salida.' }, { status: 400 });
  }

  try {
    const previous = await store().latestSnapshotForKey({
      origin,
      destination,
      departDate,
      returnDate: body.returnDate ?? null,
      pax,
    });

    const fare = await lookupFare({
      origin,
      destination,
      departDate,
      returnDate: body.returnDate ?? null,
      pax,
      cabin: body.cabin ?? 'ECONOMY',
      timePreference: body.timePreference,
    });

    const snapshot = await store().addSnapshot({
      quoteId: null,
      packageId: null,
      origin,
      destination,
      departDate,
      returnDate: body.returnDate ?? null,
      pax,
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
      raw: fare.raw ?? null,
    });

    return Response.json({
      snapshot,
      key: fareKey(snapshot),
      deltaLabel: fareDeltaLabel(snapshot),
      previousCheckedAt: previous?.fetchedAt ?? null,
      provider: activeProviderName(),
      simulated: fare.simulated,
      fallbackReason: fare.fallbackReason,
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    console.error('[api/fares/check]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'No se pudo consultar la tarifa.' },
      { status: 502 },
    );
  }
}
