// Consulta Kayak (metabuscador) en vez de una aerolínea puntual. La diferencia
// con los otros scrapers: acá una sola búsqueda trae ofertas de MUCHAS
// aerolíneas a la vez (incluidas LATAM, Avianca, Copa, Sky Airline... las que
// no pudimos scrapear directo porque bloquean). El precio por avisos:
//
//   Lo que devuelve Kayak casi siempre es el precio de un REVENDEDOR (Kiwi,
//   Decolar, CTrip, Airtickets24, etc.), no necesariamente la tarifa directa
//   de la aerolínea. Por eso todo lo que sale de acá va marcado con
//   `provider: 'kayak'` — la app lo tiene que mostrar distinto de los
//   scrapers directos (Aerolíneas/JetSMART), que sí son la fuente primaria.
//
// Técnicamente: Kayak arma la búsqueda con un GET a /flights/ORIGEN-DESTINO/FECHA
// y va completando resultados con polling a /i/api/search/dynamic/flights/poll
// (JSON, sin auth). Esperamos hasta que ese poll diga status:"complete" o se
// nos acabe el tiempo — lo que venga primero, ese poll ya trae resultados
// reales aunque no sea el 100% final.

import { getBrowser } from './scraper.mjs';
import { endOfArDay, fetchUsdRate } from './util.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const POLL_PATH = '/i/api/search/dynamic/flights/poll';
const MAX_WAIT_MS = 30_000;

async function pollUntilComplete(page, url) {
  let last = null;

  const onResponse = async (res) => {
    if (!res.url().includes(POLL_PATH)) return;
    try {
      const json = await res.json();
      last = json;
    } catch {
      // respuesta no-JSON o cortada a mitad de poll: la ignoramos, no es la final
    }
  };
  page.on('response', onResponse);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      if (last?.status === 'complete') break;
      await page.waitForTimeout(1500);
    }
  } finally {
    page.off('response', onResponse);
  }

  return last;
}

/** Arma origen->destino->fecha en un tramo, opcionalmente con vuelta. */
function buildUrl({ origin, destination, departDate, returnDate }) {
  const parts = [`${origin}-${destination}`, departDate];
  if (returnDate) parts.push(returnDate);
  return `https://www.kayak.com.ar/flights/${parts.join('/')}?sort=price_a`;
}

/**
 * Recorre los resultados y se queda con la oferta más barata por aerolínea
 * (según quién opera el primer segmento del primer tramo). Descarta
 * itinerarios "MULT" (varias aerolíneas combinadas): no representan la
 * oferta de una sola compañía, no tiene sentido compararlos como si lo fueran.
 */
function cheapestPerAirline(data) {
  const byAirline = new Map();

  for (const result of data.results ?? []) {
    const opt = result.bookingOptions?.[0];
    if (!opt) continue;
    const legFaring = opt.legFarings?.[0];
    const leg = legFaring ? data.legs?.[legFaring.legId] : null;
    const firstSegId = leg?.segments?.[0]?.id;
    const seg = firstSegId ? data.segments?.[firstSegId] : null;
    const airlineCode = seg?.airline;
    if (!airlineCode || airlineCode === 'MULT') continue;

    const price = opt.displayPrice?.price;
    const currency = opt.displayPrice?.currency;
    if (typeof price !== 'number' || !currency) continue;

    const existing = byAirline.get(airlineCode);
    if (existing && existing.price <= price) continue;

    byAirline.set(airlineCode, {
      price,
      currency,
      stops: leg.segments.length - 1,
      departure: leg.departure ?? null,
      bookingPath: opt.bookingUrl?.url ?? null,
      providerCode: opt.providerCode ?? null,
    });
  }

  return byAirline;
}

export async function searchKayakFares(query) {
  const { origin, destination, departDate, returnDate, pax } = query;

  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1400, height: 1000 }, locale: 'es-AR' });
  const page = await context.newPage();

  try {
    const url = buildUrl({ origin, destination, departDate, returnDate });
    const data = await pollUntilComplete(page, url);
    if (!data) {
      throw new Error(`Kayak no devolvió resultados para ${origin}-${destination} ${departDate} en ${MAX_WAIT_MS / 1000}s.`);
    }

    const byAirline = cheapestPerAirline(data);
    if (byAirline.size === 0) {
      throw new Error(`Kayak no encontró ofertas por aerolínea para ${origin}-${destination} ${departDate}.`);
    }

    const rate = await fetchUsdRate();
    const now = new Date();
    const paxCount = Math.max(1, pax);

    const results = [];
    for (const [code, info] of byAirline) {
      const airlineName = data.airlines?.[code]?.name ?? code;
      const nativeCurrency = info.currency === 'USD' ? 'USD' : info.currency;
      const pricePerPaxNative = info.price;
      const totalNative = Math.round(pricePerPaxNative * paxCount * 100) / 100;

      let pricePerPaxUsd = pricePerPaxNative;
      let totalUsd = totalNative;
      let exchangeRate = null;
      if (nativeCurrency === 'ARS' && rate) {
        exchangeRate = rate;
        pricePerPaxUsd = Math.round((pricePerPaxNative / rate) * 100) / 100;
        totalUsd = Math.round((totalNative / rate) * 100) / 100;
      } else if (nativeCurrency !== 'USD' && nativeCurrency !== 'ARS') {
        // moneda que no sabemos convertir (no debería pasar buscando desde AR,
        // pero por las dudas no rompemos la consulta entera por esto).
        pricePerPaxUsd = pricePerPaxNative;
        totalUsd = totalNative;
      }

      results.push({
        provider: 'kayak',
        nativeCurrency: nativeCurrency === 'USD' ? 'USD' : 'ARS',
        pricePerPaxNative,
        totalNative,
        pricePerPaxUsd,
        totalUsd,
        exchangeRate,
        seatsLeft: null,
        carrier: airlineName,
        cabin: query.cabin ?? 'ECONOMY',
        outboundDeparture: info.departure,
        fetchedAt: now.toISOString(),
        validUntil: endOfArDay(now).toISOString(),
        raw: {
          airlineCode: code,
          stops: info.stops,
          soldBy: info.providerCode,
          kayakBookingUrl: info.bookingPath ? `https://www.kayak.com.ar${info.bookingPath}` : null,
          source: 'kayak.com.ar (metabuscador — precio de revendedor, no directo de la aerolínea)',
        },
      });
    }

    return results;
  } finally {
    await context.close();
  }
}
