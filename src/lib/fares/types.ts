export interface FareQuery {
  origin: string; // IATA
  destination: string; // IATA
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null;
  pax: number;
  cabin?: string;
  timePreference?: string;
}

export interface FareResult {
  provider: string;
  currency: 'USD';
  /** Precio por pasajero, impuestos incluidos. */
  pricePerPaxUsd: number;
  /** pricePerPaxUsd * pax. */
  totalUsd: number;
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
