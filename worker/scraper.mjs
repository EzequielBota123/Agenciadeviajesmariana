// Consulta tarifas reales de Aerolíneas Argentinas navegando su propio buscador
// con un navegador headless real (no un fetch/curl imitando el request).
//
// Por qué así y no golpeando /v1/flights/offers directo: ese endpoint exige un
// token Bearer anónimo que el sitio genera solo después de pasar reCAPTCHA en
// el navegador. No hay forma honesta de conseguir ese token sin ejecutar el JS
// real de la página. Por eso dejamos que Chromium haga esa parte, y solo
// escuchamos la respuesta de red que nos interesa.
//
// Esto es scraping de verdad: depende de que aerolineas.com.ar no cambie su
// estructura. Si un día deja de andar, `lookupFare()` en la app cae al
// simulador automáticamente y lo marca como tal — nunca se cae la consulta.

import { chromium } from 'playwright';
import { endOfArDay, fetchUsdRate } from './util.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

function toAerolineasCabin(cabin) {
  const c = (cabin ?? '').toUpperCase();
  if (c === 'BUSINESS') return 'Business';
  // 'ECONOMY', 'PREMIUM_ECONOMY' y cualquier otra cosa caen en Economy: es el
  // único valor que confirmamos que el sitio acepta sin errores.
  return 'Economy';
}

function legDate(dateStr) {
  return dateStr.replaceAll('-', ''); // YYYY-MM-DD -> YYYYMMDD
}

/**
 * Busca la oferta más barata para UN tramo (origen -> destino, una fecha).
 * Siempre pide 1 pasajero adulto: así el precio que devuelve el sitio es,
 * sin ambigüedad, la tarifa por pasajero — nosotros multiplicamos después.
 */
async function searchOneWay(page, { origin, destination, date, cabinClass }) {
  const params = new URLSearchParams({
    adt: '1',
    chd: '0',
    inf: '0',
    flexDates: 'false',
    cabinClass,
    flightType: 'ONE_WAY',
  });
  params.append('leg', `${origin}-${destination}-${legDate(date)}`);

  const url = `https://www.aerolineas.com.ar/flights-offers?${params.toString()}`;

  const responsePromise = page
    .waitForResponse(
      (res) => res.url().includes('/v1/flights/offers') && res.request().method() === 'GET',
      { timeout: 30_000 },
    )
    .catch(() => null);

  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  const response = await responsePromise;

  if (!response) {
    throw new Error(
      `No llegó la respuesta de /v1/flights/offers para ${origin}-${destination} ${date} en 30s (puede que el sitio no tenga vuelos esa fecha, o cambió algo).`,
    );
  }
  if (!response.ok()) {
    throw new Error(`aerolineas.com.ar respondió ${response.status()} para ${origin}-${destination} ${date}.`);
  }

  const body = await response.json();
  const currency = body?.searchMetadata?.currency ?? 'ARS';

  // brandedOffers puede venir como array o como objeto con claves numéricas
  // ("0", "1", ...) — normalizamos a una lista plana de grupos de vuelo.
  const groups = Object.values(body?.brandedOffers ?? {}).flat();
  if (groups.length === 0) {
    throw new Error(`Sin vuelos disponibles para ${origin}-${destination} el ${date} (0 opciones).`);
  }

  let cheapest = null;
  let cheapestGroup = null;
  for (const group of groups) {
    for (const offer of group.offers ?? []) {
      const total = offer?.fare?.total;
      if (typeof total !== 'number') continue;
      if (!cheapest || total < cheapest.fare.total) {
        cheapest = offer;
        cheapestGroup = group;
      }
    }
  }
  if (!cheapest) {
    throw new Error(`Se encontraron vuelos pero ninguna oferta con precio para ${origin}-${destination} el ${date}.`);
  }

  const firstSegment = cheapestGroup?.legs?.[0]?.segments?.[0];

  return {
    pricePerPaxNative: cheapest.fare.total,
    currency,
    seatsLeft: cheapest.seatAvailability?.seats ?? null,
    carrier: 'Aerolíneas Argentinas',
    cabin: cheapest.cabinClass ?? cabinClass,
    departure: firstSegment?.departure ?? null,
    raw: { offerId: cheapest.offerId, brand: cheapest.brand, flightNumber: firstSegment?.flightNumber },
  };
}

/**
 * Punto de entrada: recibe un FareQuery (mismo contrato que el resto de los
 * proveedores de la app) y devuelve un FareResult. Ida y vuelta se resuelve
 * como dos búsquedas de un tramo — más simple y confiable que reconstruir el
 * matching de `combinableOffers` que usa el sitio para las tarifas combinadas.
 */
export async function searchAerolineasFare(query) {
  const { origin, destination, departDate, returnDate, pax, cabin } = query;
  const cabinClass = toAerolineasCabin(cabin);

  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 }, locale: 'es-AR' });
  const page = await context.newPage();

  try {
    const outbound = await searchOneWay(page, { origin, destination, date: departDate, cabinClass });

    let pricePerPaxNative = outbound.pricePerPaxNative;
    let seatsLeft = outbound.seatsLeft;
    let inbound = null;

    if (returnDate) {
      inbound = await searchOneWay(page, { origin: destination, destination: origin, date: returnDate, cabinClass });
      pricePerPaxNative += inbound.pricePerPaxNative;
      if (seatsLeft !== null && inbound.seatsLeft !== null) {
        seatsLeft = Math.min(seatsLeft, inbound.seatsLeft);
      } else {
        seatsLeft = seatsLeft ?? inbound.seatsLeft;
      }
    }

    const totalNative = Math.round(pricePerPaxNative * Math.max(1, pax) * 100) / 100;
    const nativeCurrency = outbound.currency === 'USD' ? 'USD' : 'ARS';

    let pricePerPaxUsd = pricePerPaxNative;
    let totalUsd = totalNative;
    let exchangeRate = null;

    if (nativeCurrency === 'ARS') {
      const rate = await fetchUsdRate();
      if (rate) {
        exchangeRate = rate;
        pricePerPaxUsd = Math.round((pricePerPaxNative / rate) * 100) / 100;
        totalUsd = Math.round((totalNative / rate) * 100) / 100;
      } else {
        // Sin cotización, no podemos dar un USD confiable. Dejamos el mismo
        // número: quien llama (http.ts) igual necesita un pricePerPaxUsd
        // numérico. Mejor un valor claramente marcado como ARS-sin-convertir
        // que romper la consulta entera por esto.
        pricePerPaxUsd = pricePerPaxNative;
        totalUsd = totalNative;
      }
    }

    const now = new Date();

    return {
      provider: 'aerolineas-scraper',
      nativeCurrency,
      pricePerPaxNative,
      totalNative,
      pricePerPaxUsd,
      totalUsd,
      exchangeRate,
      seatsLeft,
      carrier: outbound.carrier,
      cabin: outbound.cabin,
      outboundDeparture: outbound.departure,
      fetchedAt: now.toISOString(),
      validUntil: endOfArDay(now).toISOString(),
      raw: { outbound: outbound.raw, inbound: inbound?.raw ?? null, source: 'aerolineas.com.ar (scraping)' },
    };
  } finally {
    await context.close();
  }
}
