import { endOfArDay } from '@/lib/dates';
import { FareProviderError, type FareProvider, type FareQuery, type FareResult } from './types';

// Amadeus Self-Service (Flight Offers Search). Es la vía legal y estable para
// obtener tarifas reales de Aerolíneas Argentinas, LATAM, Copa, etc.
//
// Por qué esta API y no scrapear aerolineas.com.ar directamente:
//  - el scraping de la web de la aerolínea rompe sus términos de uso;
//  - las funciones serverless de Vercel no pueden sostener un navegador
//    headless con los tiempos y la memoria que hace falta;
//  - la web cambia sin aviso y te deja sin cotizaciones un lunes a la mañana.
// Si aun así necesitás scrapear, hacelo en un worker propio y conectalo con el
// proveedor `http` (ver ./http.ts): esta app no cambia.

interface AmadeusToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: AmadeusToken | null = null;

export class AmadeusFareProvider implements FareProvider {
  readonly name = 'amadeus';

  private readonly clientId = process.env.AMADEUS_CLIENT_ID ?? '';
  private readonly clientSecret = process.env.AMADEUS_CLIENT_SECRET ?? '';
  private readonly host = process.env.AMADEUS_HOSTNAME ?? 'test.api.amadeus.com';

  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async token(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expires_at > now + 30_000) return cachedToken.access_token;

    const res = await fetch(`https://${this.host}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new FareProviderError(
        `No se pudo autenticar contra Amadeus (${res.status})`,
        this.name,
        res.status,
      );
    }

    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      access_token: json.access_token,
      expires_at: now + json.expires_in * 1000,
    };
    return cachedToken.access_token;
  }

  async search(q: FareQuery): Promise<FareResult> {
    const token = await this.token();

    const params = new URLSearchParams({
      originLocationCode: q.origin,
      destinationLocationCode: q.destination,
      departureDate: q.departDate,
      adults: String(q.pax),
      currencyCode: 'USD',
      max: '20',
      travelClass: q.cabin ?? 'ECONOMY',
    });
    if (q.returnDate) params.set('returnDate', q.returnDate);

    const res = await fetch(`https://${this.host}/v2/shopping/flight-offers?${params}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new FareProviderError(
        `Amadeus respondió ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status,
      );
    }

    const json = (await res.json()) as AmadeusResponse;
    const offers = json.data ?? [];
    if (offers.length === 0) {
      throw new FareProviderError(
        `Sin disponibilidad publicada para ${q.origin}→${q.destination} el ${q.departDate}`,
        this.name,
        404,
      );
    }

    // Filtro por franja horaria si el cliente la pidió; si no queda nada, no
    // descartamos la consulta: devolvemos la más barata y que el agente avise.
    const preferred = filterByTimePreference(offers, q.timePreference);
    const pool = preferred.length > 0 ? preferred : offers;

    const cheapest = pool.reduce((best, offer) =>
      Number(offer.price.grandTotal) < Number(best.price.grandTotal) ? offer : best,
    );

    const total = Number(cheapest.price.grandTotal);
    const perPax = total / Math.max(1, q.pax);
    const firstSegment = cheapest.itineraries?.[0]?.segments?.[0];
    const now = new Date();

    return {
      provider: this.name,
      currency: 'USD',
      pricePerPaxUsd: Math.round(perPax * 100) / 100,
      totalUsd: Math.round(total * 100) / 100,
      seatsLeft: cheapest.numberOfBookableSeats ?? null,
      carrier: resolveCarrier(json, cheapest),
      cabin:
        cheapest.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ?? q.cabin ?? 'ECONOMY',
      outboundDeparture: firstSegment?.departure?.at ?? null,
      fetchedAt: now.toISOString(),
      validUntil: endOfArDay(now).toISOString(),
      raw: {
        offerId: cheapest.id,
        lastTicketingDate: cheapest.lastTicketingDate,
        oneWay: cheapest.oneWay,
        offersEvaluated: offers.length,
        matchedTimePreference: preferred.length > 0,
      },
    };
  }
}

function filterByTimePreference(offers: AmadeusOffer[], pref?: string): AmadeusOffer[] {
  if (!pref || pref === 'indistinto') return offers;
  const ranges: Record<string, [number, number]> = {
    'mañana': [5, 11],
    tarde: [12, 18],
    noche: [19, 23],
  };
  const range = ranges[pref];
  if (!range) return offers;
  return offers.filter((o) => {
    const at = o.itineraries?.[0]?.segments?.[0]?.departure?.at;
    if (!at) return false;
    const hour = Number(at.slice(11, 13));
    return hour >= range[0] && hour <= range[1];
  });
}

function resolveCarrier(json: AmadeusResponse, offer: AmadeusOffer): string | null {
  const code = offer.validatingAirlineCodes?.[0] ?? offer.itineraries?.[0]?.segments?.[0]?.carrierCode;
  if (!code) return null;
  return json.dictionaries?.carriers?.[code] ?? code;
}

interface AmadeusResponse {
  data?: AmadeusOffer[];
  dictionaries?: { carriers?: Record<string, string> };
}

interface AmadeusOffer {
  id: string;
  oneWay?: boolean;
  lastTicketingDate?: string;
  numberOfBookableSeats?: number;
  validatingAirlineCodes?: string[];
  price: { grandTotal: string; currency: string };
  itineraries?: Array<{
    segments?: Array<{
      carrierCode?: string;
      departure?: { at?: string; iataCode?: string };
      arrival?: { at?: string; iataCode?: string };
    }>;
  }>;
  travelerPricings?: Array<{
    fareDetailsBySegment?: Array<{ cabin?: string }>;
  }>;
}
