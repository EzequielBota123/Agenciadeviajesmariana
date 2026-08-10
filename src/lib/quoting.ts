import { lookupFare } from './fares';
import { store } from './store';
import { composeFareNote } from './agent/reply';
import { isValidDate } from './dates';
import { totalPax, type FareSnapshot, type Quote, type TravelPackage } from './types';

export class QuotingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'QuotingError';
  }
}

export interface FareCheckResult {
  snapshot: FareSnapshot;
  simulated: boolean;
  fallbackReason: string | null;
}

/**
 * Consulta la tarifa del día para una cotización, la guarda y deja constancia
 * en el timeline. Es el único camino por el que se crea un snapshot ligado a
 * una consulta: así el historial nunca queda con huecos.
 */
export async function checkFareForQuote(quote: Quote): Promise<FareCheckResult> {
  const { params } = quote;

  if (!isValidDate(params.departDate)) {
    throw new QuotingError(
      'La consulta todavía no tiene fecha de salida. Pedísela al cliente antes de cotizar.',
    );
  }

  const pax = totalPax(params);
  const fare = await lookupFare({
    origin: params.origin,
    destination: params.destination,
    departDate: params.departDate,
    returnDate: params.returnDate,
    pax,
    cabin: params.cabin,
    timePreference: params.timePreference,
  });

  const snapshot = await store().addSnapshot({
    quoteId: quote.id,
    packageId: quote.packageId,
    origin: params.origin,
    destination: params.destination,
    departDate: params.departDate,
    returnDate: params.returnDate,
    pax,
    provider: fare.provider,
    carrier: fare.carrier,
    cabin: fare.cabin,
    pricePerPaxUsd: fare.pricePerPaxUsd,
    totalUsd: fare.totalUsd,
    seatsLeft: fare.seatsLeft,
    fetchedAt: fare.fetchedAt,
    validUntil: fare.validUntil,
    raw: fare.raw ?? null,
  });

  await store().addEvent({
    quoteId: quote.id,
    kind: 'tarifa',
    actor: 'sistema',
    text: composeFareNote(snapshot),
    data: {
      snapshotId: snapshot.id,
      simulated: fare.simulated,
      fallbackReason: fare.fallbackReason,
    },
  });

  if (quote.status === 'abierta') {
    await store().updateQuote(quote.id, { status: 'cotizada' });
  }

  return { snapshot, simulated: fare.simulated, fallbackReason: fare.fallbackReason };
}

/**
 * Revisa la tarifa de un paquete publicado. No hay cliente todavía: esto es lo
 * que corre el cron todos los días para que la agencia se entere de que la
 * pieza que tiene pauteada en redes ya no cierra con el precio publicado.
 */
export async function checkFareForPackage(pkg: TravelPackage): Promise<FareCheckResult> {
  const fare = await lookupFare({
    origin: pkg.origin,
    destination: pkg.destination,
    departDate: pkg.departDate,
    returnDate: pkg.returnDate,
    pax: pkg.paxBase,
    cabin: 'ECONOMY',
  });

  const snapshot = await store().addSnapshot({
    quoteId: null,
    packageId: pkg.id,
    origin: pkg.origin,
    destination: pkg.destination,
    departDate: pkg.departDate,
    returnDate: pkg.returnDate,
    pax: pkg.paxBase,
    provider: fare.provider,
    carrier: fare.carrier,
    cabin: fare.cabin,
    pricePerPaxUsd: fare.pricePerPaxUsd,
    totalUsd: fare.totalUsd,
    seatsLeft: fare.seatsLeft,
    fetchedAt: fare.fetchedAt,
    validUntil: fare.validUntil,
    raw: fare.raw ?? null,
  });

  return { snapshot, simulated: fare.simulated, fallbackReason: fare.fallbackReason };
}

/** Umbral a partir del cual conviene avisarle a la agencia que revise la pieza. */
export const ALERT_DELTA_PCT = 8;

export function needsAttention(snapshot: FareSnapshot): boolean {
  if (snapshot.deltaPct !== null && Math.abs(snapshot.deltaPct) >= ALERT_DELTA_PCT) return true;
  if (snapshot.seatsLeft !== null && snapshot.seatsLeft <= 3) return true;
  return false;
}
