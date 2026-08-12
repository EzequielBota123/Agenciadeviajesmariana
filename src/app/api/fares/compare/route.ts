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

export interface CompareStreamEvent {
  type: 'carrier' | 'done';
  carrier?: string;
  ok?: boolean;
  result?: FareResult;
  results?: FareResult[];
  error?: string;
  ms?: number;
}

/**
 * Compara la tarifa del día entre todas las aerolíneas que el worker sabe
 * consultar. A diferencia de `/api/fares/check`, esto no pasa por el
 * `FareProvider` de la app (que resuelve un único proveedor) — le pega
 * directo al endpoint `/compare` del worker. Si no hay worker configurado,
 * no hay con qué comparar: no existe un modo "simulado" para esto porque no
 * tendría sentido comparar contra sí mismo.
 *
 * El worker devuelve Server-Sent Events (uno por proveedor a medida que
 * termina) en vez de un único JSON al final — acá lo re-transmitimos tal
 * cual, byte a byte, para que el cliente vea el progreso en tiempo real en
 * lugar de esperar a que el proveedor más lento (Kayak) termine.
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
  const timeout = setTimeout(() => controller.abort(), 105_000);

  let res: Response;
  try {
    res = await fetch(`${workerUrl.replace(/\/$/, '')}/compare`, {
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
  } catch (err) {
    clearTimeout(timeout);
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'El worker no respondió a tiempo.'
        : `No se pudo contactar al worker: ${String(err)}`;
    return Response.json({ error: message }, { status: 502 });
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const text = await res.text().catch(() => '');
    return Response.json({ error: `El worker respondió ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
  }

  const reader = res.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(streamController) {
      const { done, value } = await reader.read();
      if (done) {
        clearTimeout(timeout);
        streamController.close();
        return;
      }
      streamController.enqueue(value);
    },
    cancel(reason) {
      clearTimeout(timeout);
      reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
