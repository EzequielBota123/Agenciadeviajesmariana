import express from 'express';
import { searchAerolineasFare, closeBrowser } from './scraper.mjs';
import { searchJetsmartFare } from './jetsmart.mjs';
import { searchKayakFares } from './kayak.mjs';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 8787;
const TOKEN = process.env.FARE_WORKER_TOKEN ?? '';

const CARRIERS = {
  aerolineas: { label: 'Aerolíneas Argentinas', search: searchAerolineasFare },
  jetsmart: { label: 'JetSMART', search: searchJetsmartFare },
};
const DEFAULT_CARRIER = 'aerolineas';

function isAuthorized(req) {
  if (!TOKEN) return true; // sin token configurado, abierto (solo para probar en local)
  const header = req.headers.authorization ?? '';
  return header === `Bearer ${TOKEN}`;
}

function parseQuery(body) {
  const { origin, destination, departDate, returnDate, pax, cabin } = body ?? {};
  if (!origin || !destination || !departDate || !pax) return null;
  return {
    origin: String(origin).toUpperCase(),
    destination: String(destination).toUpperCase(),
    departDate,
    returnDate: returnDate ?? null,
    pax: Number(pax),
    cabin: cabin ?? 'ECONOMY',
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, carriers: Object.keys(CARRIERS) });
});

app.post('/', async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Falta o es inválido el Authorization: Bearer <token>.' });
    return;
  }

  const query = parseQuery(req.body);
  if (!query) {
    res.status(400).json({ error: 'Faltan campos: origin, destination, departDate y pax son obligatorios.' });
    return;
  }

  const carrierKey = (req.body?.carrier ?? DEFAULT_CARRIER).toLowerCase();
  const carrier = CARRIERS[carrierKey];
  if (!carrier) {
    res.status(400).json({ error: `Carrier desconocido: ${carrierKey}. Opciones: ${Object.keys(CARRIERS).join(', ')}.` });
    return;
  }

  const started = Date.now();
  try {
    const result = await carrier.search(query);
    console.log(
      `[worker] ${carrierKey} ${query.origin}-${query.destination} ${query.departDate}${query.returnDate ? '/' + query.returnDate : ''} x${query.pax} -> ` +
        `${result.nativeCurrency} ${result.totalNative} (USD ${result.totalUsd}) en ${Date.now() - started}ms`,
    );
    res.json(result);
  } catch (err) {
    console.error(`[worker] falló ${carrierKey} ${query.origin}-${query.destination} ${query.departDate}:`, err);
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Kayak a veces devuelve la misma aerolínea bajo más de un código IATA
// interno (JetSMART salió como "JA" y también como "WJ" en pruebas), así que
// filtrar por código no alcanza. Comparamos por nombre normalizado (sin
// tildes, minúsculas): Kayak escribe "Aerolineas Argentinas" sin tilde, un
// match exacto contra nuestra etiqueta tampoco serviría.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');
function normalizeName(s) {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}
const DIRECT_CARRIER_NAMES = new Set(Object.values(CARRIERS).map((c) => normalizeName(c.label)));

/**
 * Consulta todos los proveedores disponibles en paralelo para la misma ruta
 * y devuelve los resultados que hayan andado más los errores de los que no,
 * para armar una comparación de precios entre aerolíneas.
 *
 * Kayak suma aerolíneas que no podemos scrapear directo (LATAM, Avianca,
 * Copa...), pero sus precios son casi siempre de un revendedor, no el precio
 * directo de la aerolínea — por eso, si Kayak trae una oferta de una
 * aerolínea que YA tenemos scrapeada directo (Aerolíneas/JetSMART), la
 * descartamos: el precio directo es más confiable y no tiene sentido mostrar
 * dos números distintos para la misma compañía en la misma tabla.
 */
app.post('/compare', async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Falta o es inválido el Authorization: Bearer <token>.' });
    return;
  }

  const query = parseQuery(req.body);
  if (!query) {
    res.status(400).json({ error: 'Faltan campos: origin, destination, departDate y pax son obligatorios.' });
    return;
  }

  const started = Date.now();
  const [directEntries, kayakEntry] = await Promise.all([
    Promise.all(
      Object.entries(CARRIERS).map(async ([key, carrier]) => {
        try {
          const result = await carrier.search(query);
          return { carrier: key, ok: true, result };
        } catch (err) {
          return { carrier: key, ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    ),
    searchKayakFares(query).then(
      (results) => ({ carrier: 'kayak', ok: true, results }),
      (err) => ({ carrier: 'kayak', ok: false, error: err instanceof Error ? err.message : String(err) }),
    ),
  ]);

  const results = directEntries.filter((e) => e.ok).map((e) => e.result);
  const errors = directEntries.filter((e) => !e.ok).map((e) => ({ carrier: e.carrier, message: e.error }));

  if (kayakEntry.ok) {
    for (const r of kayakEntry.results) {
      if (!DIRECT_CARRIER_NAMES.has(normalizeName(r.carrier ?? ''))) results.push(r);
    }
  } else {
    errors.push({ carrier: 'kayak', message: kayakEntry.error });
  }

  console.log(
    `[worker] /compare ${query.origin}-${query.destination} ${query.departDate} x${query.pax} -> ` +
      `${results.length} ok, ${errors.length} error(es) en ${Date.now() - started}ms`,
  );

  res.json({ results, errors });
});

const server = app.listen(PORT, () => {
  console.log(`[worker] escuchando en http://localhost:${PORT}`);
  console.log(`[worker] carriers: ${Object.keys(CARRIERS).join(', ')}`);
  console.log(`[worker] auth: ${TOKEN ? 'token requerido' : 'ABIERTO (sin FARE_WORKER_TOKEN) — solo para desarrollo local'}`);
});

async function shutdown() {
  console.log('\n[worker] cerrando...');
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
