import { isKnownIata } from '@/lib/agent/airports';
import { isValidDate } from '@/lib/dates';
import type { FareResult } from '@/lib/fares/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// El worker corre las cotizaciones de todas las aerolíneas en paralelo, pero
// alguna puede tardar hasta ~100s (cold start + navegador para Aerolíneas).
export const maxDuration = 110;

interface Body {
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string | null;
  pax?: number;
  cabin?: string;
}

interface CompareResponse {
  results: FareResult[];
  errors: Array<{ carrier: string; message: string }>;
}

/**
 * Compara la tarifa del día entre todas las aerolíneas que el worker sabe
 * consultar. A diferencia de `/api/fares/check`, esto no pasa por el
 * `FareProvider` de la app (que resuelve un único proveedor) — le pega
 * directo al endpoint `/compare` del worker, que ya corre todo en paralelo.
 * Si no hay worker configurado, no hay con qué comparar: no existe un modo
 * "simulado" para esto porque no tendría sentido comparar contra sí mismo.
 */
export async function POST(req: Request) {
  const workerUrl = process.env.FARE_WORKER_URL ?? '';
  if (!workerUrl) {
    return Response.json(
      { error: 'La comparación entre aerolíneas necesita FARE_WORKER_URL configurado.' },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  const origin = (body.origin ?? '').toUpperCase();
  const destination = (body.destination ?? '').toUpperCase();
  const departDate = body.departDate ?? '';
  const pax = Number(body.pax ?? 1);

  if (!isKnownIata(origin) || !isKnownIata(destination)) {
    return Response.json(
      { error: 'Origen o destino no reconocido. Usá un código IATA de la lista de destinos.' },
      { status: 400 },
    );
  }
  if (origin === destination) {
    return Response.json({ error: 'El origen y el destino no pueden ser el mismo.' }, { status: 400 });
  }
  if (!isValidDate(departDate)) {
    return Response.json({ error: 'Fecha de salida inválida. Formato esperado: YYYY-MM-DD.' }, { status: 400 });
  }
  if (!Number.isInteger(pax) || pax < 1 || pax > 20) {
    return Response.json({ error: 'La cantidad de pasajeros tiene que estar entre 1 y 20.' }, { status: 400 });
  }
  if (body.returnDate && !isValidDate(body.returnDate)) {
    return Response.json({ error: 'Fecha de regreso inválida.' }, { status: 400 });
  }
  if (body.returnDate && body.returnDate < departDate) {
    return Response.json({ error: 'El regreso no puede ser anterior a la salida.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 100_000);

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/compare`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.FARE_WORKER_TOKEN ? { authorization: `Bearer ${process.env.FARE_WORKER_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        origin,
        destination,
        departDate,
        returnDate: body.returnDate ?? null,
        pax,
        cabin: body.cabin ?? 'ECONOMY',
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json({ error: `El worker respondió ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
    }

    const data = (await res.json()) as CompareResponse;
    return Response.json(data);
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'El worker no respondió en 100 s.'
        : `No se pudo contactar al worker: ${String(err)}`;
    return Response.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
