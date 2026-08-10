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

export class HttpFareProvider implements FareProvider {
  readonly name = 'http';

  private readonly url = process.env.FARE_WORKER_URL ?? '';
  private readonly token = process.env.FARE_WORKER_TOKEN ?? '';

  get configured(): boolean {
    return Boolean(this.url);
  }

  async search(q: FareQuery): Promise<FareResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

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
          ? 'El worker de tarifas no respondió en 25 s'
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
    return {
      provider: raw.provider ?? this.name,
      currency: 'USD',
      pricePerPaxUsd: Math.round(perPax * 100) / 100,
      totalUsd: Math.round((raw.totalUsd ?? perPax * q.pax) * 100) / 100,
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
