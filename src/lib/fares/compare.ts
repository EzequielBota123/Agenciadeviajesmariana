import { FareProviderError, type FareQuery, type FareResult } from './types';

export interface CompareRoundResult {
  results: FareResult[];
  errors: Array<{ carrier: string; message: string }>;
}

interface CompareStreamEvent {
  type: 'carrier' | 'done';
  carrier?: string;
  ok?: boolean;
  result?: FareResult;
  results?: FareResult[];
  error?: string;
}

/**
 * Pega directo al `/compare` del worker (mismo endpoint que consume la home
 * vía SSE) y junta los eventos del stream en un único resultado, para usarlo
 * server-side donde no hace falta progreso en vivo (ej. al cotizarle a un
 * cliente puntual).
 */
export async function compareFares(query: FareQuery): Promise<CompareRoundResult> {
  const workerUrl = process.env.FARE_WORKER_URL ?? '';
  if (!workerUrl) {
    throw new FareProviderError('FARE_WORKER_URL no configurado', 'compare');
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
      body: JSON.stringify(query),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new FareProviderError(
      err instanceof Error && err.name === 'AbortError'
        ? 'El worker de tarifas no respondió a tiempo'
        : `No se pudo contactar al worker de tarifas: ${String(err)}`,
      'compare',
    );
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const text = await res.text().catch(() => '');
    throw new FareProviderError(`El worker respondió ${res.status}: ${text.slice(0, 300)}`, 'compare', res.status);
  }

  const results: FareResult[] = [];
  const errors: Array<{ carrier: string; message: string }> = [];

  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        const event = JSON.parse(line.slice(5).trim()) as CompareStreamEvent;
        if (event.type !== 'carrier' || !event.carrier) continue;
        if (event.ok) {
          if (event.carrier === 'kayak') results.push(...(event.results ?? []));
          else if (event.result) results.push(event.result);
        } else {
          errors.push({ carrier: event.carrier, message: event.error ?? 'falló' });
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return { results, errors };
}
