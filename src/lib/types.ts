// Modelo de dominio de TARIFA·VIVA.
//
// La idea central: una consulta NO es un dato fijo. El cliente la va
// reescribiendo (fecha, pasajeros, horario) mientras la tarifa se mueve
// del otro lado. Por eso `Quote` guarda el estado actual de los parámetros
// y `QuoteEvent` guarda el historial completo de cómo se llegó ahí.

export type PackageStatus = 'borrador' | 'publicado' | 'pausado';

export type Board =
  | 'all_inclusive'
  | 'media_pension'
  | 'desayuno'
  | 'solo_alojamiento'
  | 'solo_vuelo';

export const BOARD_LABEL: Record<Board, string> = {
  all_inclusive: 'All inclusive',
  media_pension: 'Media pensión',
  desayuno: 'Con desayuno',
  solo_alojamiento: 'Solo alojamiento',
  solo_vuelo: 'Solo vuelo',
};

export interface TravelPackage {
  id: string;
  slug: string;
  title: string;
  origin: string; // IATA, ej. EZE
  destination: string; // IATA, ej. CUN
  destinationName: string; // "Cancún"
  departDate: string; // YYYY-MM-DD
  returnDate: string | null;
  nights: number | null;
  board: Board;
  paxBase: number;
  listedPriceUsd: number | null; // precio publicado en la pieza de redes
  status: PackageStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TimePreference = 'mañana' | 'tarde' | 'noche' | 'indistinto';

export interface QuoteParams {
  origin: string;
  destination: string;
  departDate: string | null; // YYYY-MM-DD
  returnDate: string | null;
  paxAdults: number;
  paxChildren: number;
  timePreference: TimePreference;
  cabin: string;
}

export type QuoteStatus = 'abierta' | 'cotizada' | 'cerrada' | 'perdida';

export interface Quote {
  id: string;
  token: string; // para el link público /q/[token]
  packageId: string | null;
  customerName: string | null;
  customerContact: string | null;
  channel: string; // whatsapp | instagram | web | ...
  status: QuoteStatus;
  params: QuoteParams;
  revision: number; // cuántas veces cambió el pedido
  createdAt: string;
  updatedAt: string;
}

export type QuoteEventKind = 'mensaje' | 'revision' | 'tarifa' | 'nota' | 'estado';
export type QuoteEventActor = 'cliente' | 'agente' | 'sistema';

export interface QuoteEvent {
  id: string;
  quoteId: string;
  kind: QuoteEventKind;
  actor: QuoteEventActor;
  text: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export type FareCurrency = 'USD' | 'ARS';

export interface FareSnapshot {
  id: string;
  quoteId: string | null;
  packageId: string | null;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  pax: number;
  provider: string;
  carrier: string | null;
  cabin: string;
  /** Moneda en la que cotizó la aerolínea. */
  nativeCurrency: FareCurrency;
  pricePerPaxNative: number;
  totalNative: number;
  /** Siempre en USD (igual al nativo si ya era USD, o convertido). */
  pricePerPaxUsd: number;
  totalUsd: number;
  /** Cotización ARS→USD usada, si hubo conversión. */
  exchangeRate: number | null;
  seatsLeft: number | null;
  fetchedAt: string; // ISO
  validUntil: string; // ISO — fin del día en hora argentina
  deltaPct: number | null; // vs. el último chequeo de la misma combinación, medido en USD
  previousTotalUsd: number | null;
  raw: unknown;
}

/**
 * Clave de comparación de una tarifa: misma ruta, misma fecha de ida, misma
 * fecha de vuelta (o "solo ida" si no hay) y mismos pax. Sin la vuelta en la
 * clave, un chequeo solo-ida y uno ida-y-vuelta de la misma fecha de salida
 * se comparan como si fueran la misma tarifa — el delta sale falso.
 */
export function fareKey(s: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  pax: number;
}): string {
  return `${s.origin}-${s.destination}|${s.departDate}|${s.returnDate ?? 'solo-ida'}|${s.pax}`;
}

export function totalPax(p: Pick<QuoteParams, 'paxAdults' | 'paxChildren'>): number {
  return Math.max(1, p.paxAdults + p.paxChildren);
}

export const DEFAULT_PARAMS: QuoteParams = {
  origin: 'EZE',
  destination: 'CUN',
  departDate: null,
  returnDate: null,
  paxAdults: 1,
  paxChildren: 0,
  timePreference: 'indistinto',
  cabin: 'ECONOMY',
};
