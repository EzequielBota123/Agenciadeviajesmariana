import { assistFlyer } from '@/lib/flyerAssist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Freno simple por IP: este endpoint gasta crédito de la API de Claude y el sitio es abierto.
const hits = new Map<string, number[]>();
const LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (limited(ip)) {
    return Response.json({ error: 'Demasiados pedidos. Probá de nuevo en un rato.' }, { status: 429 });
  }
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text) return Response.json({ error: 'Falta el texto' }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: 'El texto es demasiado largo' }, { status: 413 });
  return Response.json(await assistFlyer(text));
}
