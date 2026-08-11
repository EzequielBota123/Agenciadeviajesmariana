// Consulta tarifas reales de JetSMART pegándole directo a su API de
// disponibilidad, sin navegador headless.
//
// A diferencia de Aerolíneas Argentinas, acá no hace falta Playwright: el
// sitio expone en el HTML de su home un campo oculto (`#params_flights`) con
// la URL base de su motor de reservas (patrón Navitaire), y ese endpoint
// responde JSON abierto, sin token ni cookies de sesión:
//   https://origin.jsrtff.it.jetsm.art/availability/plain
//     ?bt_date=<inicio>&bt_date=<fin>&dep=<IATA>&arr=<IATA>&pov_c=AR
//
// Cada oferta ya viene con el precio total (tarifa + impuestos) convertido a
// varias monedas a la vez, incluidas ARS y USD — no hace falta pedirle la
// cotización a DolarAPI como con el scraper de Aerolíneas.
//
// Es scraping de una API no documentada igual que el resto: si JetSMART
// cambia el endpoint o empieza a exigir auth, esto se rompe y la app cae al
// simulador automáticamente.

import { endOfArDay } from './util.mjs';

const BASE_URL = 'https://origin.jsrtff.it.jetsm.art/availability/plain';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Busca la oferta más barata para UN tramo (origen -> destino, una fecha).
 * Siempre interpretamos el precio como tarifa por pasajero adulto — la API
 * no acepta cantidad de pasajeros, cotiza por persona.
 */
async function searchOneWay({ origin, destination, date }) {
  const params = new URLSearchParams({ _agg: '', _meta: '', pov_c: 'AR', dep: origin, arr: destination });
  params.append('bt_date', `${date} 00:00:00`);
  params.append('bt_date', `${date} 24:00:00`);

  const url = `${BASE_URL}?${params.toString()}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(`No se pudo contactar la API de JetSMART para ${origin}-${destination} ${date}: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`JetSMART respondió ${res.status} para ${origin}-${destination} ${date}.`);
  }

  const body = await res.json();
  const flights = (body?.availability ?? []).filter(
    (f) => f.dep === origin && f.arr === destination && typeof f.date === 'string' && f.date.startsWith(date),
  );

  if (flights.length === 0) {
    throw new Error(`Sin vuelos disponibles en JetSMART para ${origin}-${destination} el ${date} (0 opciones).`);
  }

  let cheapest = null;
  for (const f of flights) {
    if (typeof f?.pi?.usd !== 'number') continue;
    if (!cheapest || f.pi.usd < cheapest.pi.usd) cheapest = f;
  }
  if (!cheapest) {
    throw new Error(`Se encontraron vuelos pero ninguna oferta con precio para ${origin}-${destination} el ${date} en JetSMART.`);
  }

  return {
    pricePerPaxArs: cheapest.pi.ars,
    pricePerPaxUsd: cheapest.pi.usd,
    seatsLeft: typeof cheapest.s === 'number' ? cheapest.s : null,
    departure: cheapest.date,
    raw: { flightNumber: cheapest.fn, fareClass: cheapest.c, market: cheapest.market },
  };
}

/** Punto de entrada: mismo contrato (FareQuery -> FareResult) que el resto de los proveedores. */
export async function searchJetsmartFare(query) {
  const { origin, destination, departDate, returnDate, pax } = query;

  const outbound = await searchOneWay({ origin, destination, date: departDate });

  let pricePerPaxArs = outbound.pricePerPaxArs;
  let pricePerPaxUsd = outbound.pricePerPaxUsd;
  let seatsLeft = outbound.seatsLeft;
  let inbound = null;

  if (returnDate) {
    inbound = await searchOneWay({ origin: destination, destination: origin, date: returnDate });
    pricePerPaxArs += inbound.pricePerPaxArs;
    pricePerPaxUsd += inbound.pricePerPaxUsd;
    seatsLeft =
      seatsLeft !== null && inbound.seatsLeft !== null
        ? Math.min(seatsLeft, inbound.seatsLeft)
        : (seatsLeft ?? inbound.seatsLeft);
  }

  const paxCount = Math.max(1, pax);
  const totalNative = Math.round(pricePerPaxArs * paxCount * 100) / 100;
  const totalUsd = Math.round(pricePerPaxUsd * paxCount * 100) / 100;
  const exchangeRate = totalUsd > 0 ? Math.round((totalNative / totalUsd) * 100) / 100 : null;

  const now = new Date();

  return {
    provider: 'jetsmart-scraper',
    nativeCurrency: 'ARS',
    pricePerPaxNative: Math.round(pricePerPaxArs * 100) / 100,
    totalNative,
    pricePerPaxUsd: Math.round(pricePerPaxUsd * 100) / 100,
    totalUsd,
    exchangeRate,
    seatsLeft,
    carrier: 'JetSMART',
    cabin: 'ECONOMY',
    outboundDeparture: outbound.departure,
    fetchedAt: now.toISOString(),
    validUntil: endOfArDay(now).toISOString(),
    raw: { outbound: outbound.raw, inbound: inbound?.raw ?? null, source: 'origin.jsrtff.it.jetsm.art (API abierta)' },
  };
}
