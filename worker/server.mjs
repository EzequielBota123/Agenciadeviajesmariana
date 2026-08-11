import express from 'express';
import { searchAerolineasFare, closeBrowser } from './scraper.mjs';
import { searchJetsmartFare } from './jetsmart.mjs';

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

/**
 * Consulta todos los proveedores disponibles en paralelo para la misma ruta
 * y devuelve los resultados que hayan andado más los errores de los que no,
 * para armar una comparación de precios entre aerolíneas.
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
  const entries = await Promise.all(
    Object.entries(CARRIERS).map(async ([key, carrier]) => {
      try {
        const result = await carrier.search(query);
        return { carrier: key, ok: true, result };
      } catch (err) {
        return { carrier: key, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const results = entries.filter((e) => e.ok).map((e) => e.result);
  const errors = entries.filter((e) => !e.ok).map((e) => ({ carrier: e.carrier, message: e.error }));

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
