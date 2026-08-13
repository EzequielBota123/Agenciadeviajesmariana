import { lookupFare, type FareResult } from './fares';
import { compareFares } from './fares/compare';
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

export interface QuoteFareCheckResult {
  /** Un snapshot por proveedor que respondió (Aerolíneas, JetSMART, Kayak...). */
  snapshots: FareSnapshot[];
  errors: Array<{ carrier: string; message: string }>;
  simulated: boolean;
  fallbackReason: string | null;
}

/**
 * Consulta la tarifa del día para una cotización comparando entre todas las
 * fuentes disponibles (Aerolíneas, JetSMART, Kayak) y guarda un snapshot por
 * cada una, con constancia en el timeline. Es el único camino por el que se
 * crea un snapshot ligado a una consulta: así el historial nunca queda con
 * huecos.
 */
export async function checkFareForQuote(quote: Quote): Promise<QuoteFareCheckResult> {
  const { params } = quote;

  if (!isValidDate(params.departDate)) {
    throw new QuotingError(
      'La consulta todavía no tiene fecha de salida. Pedísela al cliente antes de cotizar.',
    );
  }

  const pax = totalPax(params);
  const query = {
    origin: params.origin,
    destination: params.destination,
    departDate: params.departDate,
    returnDate: params.returnDate,
    pax,
    cabin: params.cabin,
    timePreference: params.timePreference,
  };

  let results: FareResult[] = [];
  let errors: Array<{ carrier: string; message: string }> = [];
  let simulated = false;
  let fallbackReason: string | null = null;

  try {
    const compared = await compareFares(query);
    results = compared.results;
    errors = compared.errors;
  } catch (err) {
    fallbackReason = err instanceof Error ? err.message : String(err);
  }

  // Sin worker de comparación configurado (dev local) o los 3 proveedores
  // fallaron: red de contención con el proveedor único de siempre, que a su
  // vez cae al simulador si hace falta.
  if (results.length === 0) {
    const fare = await lookupFare(query);
    results = [fare];
    simulated = fare.simulated;
    fallbackReason = fare.fallbackReason ?? fallbackReason;
  }

  const snapshots: FareSnapshot[] = [];
  for (const fare of results) {
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
    snapshots.push(snapshot);
  }

  const cheapest = [...snapshots].sort((a, b) => a.totalUsd - b.totalUsd)[0];

  await store().addEvent({
    quoteId: quote.id,
    kind: 'tarifa',
    actor: 'sistema',
    text: composeFareNote(cheapest),
    data: {
      snapshotIds: snapshots.map((s) => s.id),
      providersChecked: snapshots.length,
      errors,
      simulated,
      fallbackReason,
    },
  });

  if (quote.status === 'abierta') {
    await store().updateQuote(quote.id, { status: 'cotizada' });
  }

  return { snapshots, errors, simulated, fallbackReason };
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

  return { snapshot, simulated: fare.simulated, fallbackReason: fare.fallbackReason };
}

/** Umbral a partir del cual conviene avisarle a la agencia que revise la pieza. */
export const ALERT_DELTA_PCT = 8;

export function needsAttention(snapshot: FareSnapshot): boolean {
  if (snapshot.deltaPct !== null && Math.abs(snapshot.deltaPct) >= ALERT_DELTA_PCT) return true;
  if (snapshot.seatsLeft !== null && snapshot.seatsLeft <= 3) return true;
  return false;
}
