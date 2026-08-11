import express from 'express';
import { searchAerolineasFare, closeBrowser } from './scraper.mjs';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 8787;
const TOKEN = process.env.FARE_WORKER_TOKEN ?? '';

function isAuthorized(req) {
  if (!TOKEN) return true; // sin token configurado, abierto (solo para probar en local)
  const header = req.headers.authorization ?? '';
  return header === `Bearer ${TOKEN}`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, provider: 'aerolineas-scraper' });
});

app.post('/', async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Falta o es inválido el Authorization: Bearer <token>.' });
    return;
  }

  const { origin, destination, departDate, returnDate, pax, cabin } = req.body ?? {};

  if (!origin || !destination || !departDate || !pax) {
    res.status(400).json({ error: 'Faltan campos: origin, destination, departDate y pax son obligatorios.' });
    return;
  }

  const started = Date.now();
  try {
    const result = await searchAerolineasFare({
      origin: String(origin).toUpperCase(),
      destination: String(destination).toUpperCase(),
      departDate,
      returnDate: returnDate ?? null,
      pax: Number(pax),
      cabin: cabin ?? 'ECONOMY',
    });
    console.log(
      `[worker] ${origin}-${destination} ${departDate}${returnDate ? '/' + returnDate : ''} x${pax} -> ` +
        `${result.nativeCurrency} ${result.totalNative} (USD ${result.totalUsd}) en ${Date.now() - started}ms`,
    );
    res.json(result);
  } catch (err) {
    console.error(`[worker] falló ${origin}-${destination} ${departDate}:`, err);
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[worker] escuchando en http://localhost:${PORT}`);
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
