import { AmadeusFareProvider } from './amadeus';
import { HttpFareProvider } from './http';
import { MockFareProvider } from './mock';
import { FareProviderError, type FareProvider, type FareQuery, type FareResult } from './types';

export * from './types';

const mock = new MockFareProvider();

function selectProvider(): FareProvider {
  const configured = (process.env.FARE_PROVIDER ?? 'mock').toLowerCase();
  switch (configured) {
    case 'amadeus': {
      const p = new AmadeusFareProvider();
      return p.configured ? p : mock;
    }
    case 'http': {
      const p = new HttpFareProvider();
      return p.configured ? p : mock;
    }
    default:
      return mock;
  }
}

export interface FareLookup extends FareResult {
  /** true si el proveedor real falló y devolvimos una tarifa simulada. */
  simulated: boolean;
  /** Motivo del fallback, para mostrarlo en el panel en vez de esconderlo. */
  fallbackReason: string | null;
}

/**
 * Busca la tarifa del día. Si el proveedor real falla, cae al simulador y lo
 * dice: preferimos una cotización marcada como simulada antes que un 500 que
 * deja al agente sin nada que responderle al cliente.
 */
export async function lookupFare(query: FareQuery): Promise<FareLookup> {
  const provider = selectProvider();

  try {
    const result = await provider.search(query);
    return { ...result, simulated: provider.name === 'mock', fallbackReason: null };
  } catch (err) {
    if (provider.name === 'mock') throw err;

    const reason =
      err instanceof FareProviderError
        ? err.message
        : `Error inesperado del proveedor ${provider.name}: ${String(err)}`;

    console.error('[tarifas] proveedor real falló, usando simulador:', reason);
    const fallback = await mock.search(query);
    return { ...fallback, simulated: true, fallbackReason: reason };
  }
}

export function activeProviderName(): string {
  return selectProvider().name;
}
