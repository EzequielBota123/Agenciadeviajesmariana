// Cotización ARS→USD, para convertir tarifas de cabotaje (que salen en pesos)
// a un equivalente en dólares y mostrar las dos monedas juntas.
//
// Fuente: DolarAPI (dolarapi.com), gratuita y sin registro. Usamos el dólar
// "oficial" — es el tipo de cambio de referencia, no el blue.

export interface ExchangeRate {
  rate: number; // pesos por dólar (venta)
  source: string;
  fetchedAt: string;
}

interface CachedRate extends ExchangeRate {
  expiresAt: number;
}

let cache: CachedRate | null = null;
const CACHE_MS = 5 * 60_000; // 5 minutos: alcanza para no golpear la API en cada request sin quedar desactualizado

/** Cotización de referencia para convertir ARS a USD. Cachea 5 minutos en memoria. */
export async function usdArsRate(): Promise<ExchangeRate> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`DolarAPI respondió ${res.status}`);

    const json = (await res.json()) as { venta: number; fechaActualizacion: string };
    const rate = Number(json.venta);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('DolarAPI devolvió una cotización inválida');

    const result: ExchangeRate = { rate, source: 'dolarapi.com (oficial)', fetchedAt: new Date().toISOString() };
    cache = { ...result, expiresAt: now + CACHE_MS };
    return result;
  } catch (err) {
    // Si la cotización falla, no tiramos toda la consulta de tarifa por eso.
    // Usamos el último valor cacheado aunque haya vencido, o un piso conservador.
    if (cache) {
      console.warn('[currency] DolarAPI falló, reuso la última cotización conocida:', err);
      return cache;
    }
    console.error('[currency] DolarAPI falló y no hay cotización previa, uso valor de respaldo:', err);
    return { rate: 1500, source: 'valor de respaldo (DolarAPI no respondió)', fetchedAt: new Date().toISOString() };
  }
}

export function arsToUsd(ars: number, rate: number): number {
  return Math.round((ars / rate) * 100) / 100;
}
