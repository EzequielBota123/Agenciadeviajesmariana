import { endOfArDay } from '@/lib/dates';
import { FareProviderError, type FareProvider, type FareQuery, type FareResult } from './types';

// Proveedor "traé lo tuyo": delega la consulta a un worker propio.
//
// Este es el enganche para el caso que no entra en una función serverless:
// un proceso tuyo (Railway, Fly, un VPS, una Cloud Run) que abre un navegador
// headless o habla con un GDS, mantiene sesión y cookies, y expone un endpoint
// HTTP. La app le manda el FareQuery y espera un FareResult.
//
// Contrato mínimo que tu worker tiene que devolver:
//   { "pricePerPaxUsd": 742, "seatsLeft": 4, "carrier": "Aerolíneas Argentinas" }
// El resto (totalUsd, validUntil, fetchedAt) lo completa esta clase.
//
// Si el worker cotiza en una moneda que no es dólares (ej. tarifas de
// cabotaje en pesos), puede mandar además `nativeCurrency`, `pricePerPaxNative`,
// `totalNative` y `exchangeRate` — la conversión a USD la hace el worker mismo,
// porque es quien sabe con qué cotización trabajó.

export class HttpFareProvider implements FareProvider {
  readonly name = 'http';

  private readonly url = process.env.FARE_WORKER_URL ?? '';
  private readonly token = process.env.FARE_WORKER_TOKEN ?? '';

  get configured(): boolean {
    return Boolean(this.url);
  }

  async search(q: FareQuery): Promise<FareResult> {
    const controller = new AbortController();
    // Generoso a propósito: un worker con navegador headless en un host
    // gratuito (Render free tier) puede tardar 20-30s por tramo, más el
    // "cold start" de 30-60s si estuvo inactivo. Ida y vuelta son dos tramos
    // seguidos — el peor caso ronda el minuto y medio.
    const timeout = setTimeout(() => controller.abort(), 100_000);

    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(q),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      throw new FareProviderError(
        err instanceof Error && err.name === 'AbortError'
          ? 'El worker de tarifas no respondió en 100 s'
          : `No se pudo contactar al worker de tarifas: ${String(err)}`,
        this.name,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new FareProviderError(
        `El worker respondió ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status,
      );
    }

    const raw = (await res.json()) as Partial<FareResult> & { pricePerPaxUsd?: number };
    const perPax = Number(raw.pricePerPaxUsd);
    if (!Number.isFinite(perPax) || perPax <= 0) {
      throw new FareProviderError(
        'El worker no devolvió un `pricePerPaxUsd` numérico válido',
        this.name,
      );
    }

    const now = new Date();
    const perPaxUsd = Math.round(perPax * 100) / 100;
    const totalUsd = Math.round((raw.totalUsd ?? perPax * q.pax) * 100) / 100;

    return {
      provider: raw.provider ?? this.name,
      nativeCurrency: raw.nativeCurrency ?? 'USD',
      pricePerPaxNative: raw.pricePerPaxNative ?? perPaxUsd,
      totalNative: raw.totalNative ?? totalUsd,
      pricePerPaxUsd: perPaxUsd,
      totalUsd,
      exchangeRate: raw.exchangeRate ?? null,
      seatsLeft: raw.seatsLeft ?? null,
      carrier: raw.carrier ?? null,
      cabin: raw.cabin ?? q.cabin ?? 'ECONOMY',
      outboundDeparture: raw.outboundDeparture ?? null,
      fetchedAt: raw.fetchedAt ?? now.toISOString(),
      validUntil: raw.validUntil ?? endOfArDay(now).toISOString(),
      raw: raw.raw ?? raw,
    };
  }
}
