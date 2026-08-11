export interface FareQuery {
  origin: string; // IATA
  destination: string; // IATA
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null;
  pax: number;
  cabin?: string;
  timePreference?: string;
}

export type FareCurrency = 'USD' | 'ARS';

export interface FareResult {
  provider: string;
  /** Moneda en la que la aerolínea/proveedor cotizó originalmente. */
  nativeCurrency: FareCurrency;
  /** Precio por pasajero en la moneda nativa, impuestos incluidos. */
  pricePerPaxNative: number;
  /** pricePerPaxNative * pax. */
  totalNative: number;
  /** Siempre en USD: igual al nativo si ya era USD, o convertido si era ARS. */
  pricePerPaxUsd: number;
  totalUsd: number;
  /** Cotización usada para convertir ARS→USD. null si nativeCurrency ya era USD. */
  exchangeRate: number | null;
  /** Asientos que la aerolínea declara disponibles en esa clase tarifaria. */
  seatsLeft: number | null;
  carrier: string | null;
  cabin: string;
  outboundDeparture: string | null; // ISO o "HH:mm"
  fetchedAt: string; // ISO
  /** Fin del día en hora argentina: después de esto no prometemos nada. */
  validUntil: string; // ISO
  raw?: unknown;
}

export interface FareProvider {
  readonly name: string;
  /** Si es false, el proveedor no está configurado y hay que caer al mock. */
  readonly configured: boolean;
  search(query: FareQuery): Promise<FareResult>;
}

export class FareProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FareProviderError';
  }
}
