import { isAuthorizedRequest, unauthorized } from '@/lib/auth';
import { isValidDate } from '@/lib/dates';
import { isKnownIata, airportLabel } from '@/lib/agent/airports';
import { store, type PackageInput } from '@/lib/store';
import type { Board, PackageStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOARDS: Board[] = [
  'all_inclusive',
  'media_pension',
  'desayuno',
  'solo_alojamiento',
  'solo_vuelo',
];
const STATUSES: PackageStatus[] = ['borrador', 'publicado', 'pausado'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') as PackageStatus | null;

  // El listado de publicados es público: alimenta la landing y las piezas de
  // redes. El resto (borradores incluidos) requiere token.
  if (status !== 'publicado' && !isAuthorizedRequest(req)) return unauthorized();

  const packages = await store().listPackages(
    status && STATUSES.includes(status) ? { status } : undefined,
  );
  return Response.json({ packages });
}

export async function POST(req: Request) {
  if (!isAuthorizedRequest(req)) return unauthorized();

  let body: Partial<PackageInput>;
  try {
    body = (await req.json()) as Partial<PackageInput>;
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  const errors: string[] = [];
  const origin = (body.origin ?? '').toUpperCase();
  const destination = (body.destination ?? '').toUpperCase();

  if (!body.title?.trim()) errors.push('Falta el título del paquete.');
  if (!isKnownIata(origin)) errors.push('Origen no reconocido.');
  if (!isKnownIata(destination)) errors.push('Destino no reconocido.');
  if (origin && origin === destination) errors.push('Origen y destino no pueden coincidir.');
  if (!isValidDate(body.departDate)) errors.push('Fecha de salida inválida (YYYY-MM-DD).');
  if (body.returnDate && !isValidDate(body.returnDate)) errors.push('Fecha de regreso inválida.');
  if (body.returnDate && body.departDate && body.returnDate < body.departDate) {
    errors.push('El regreso no puede ser anterior a la salida.');
  }
  if (body.board && !BOARDS.includes(body.board)) errors.push('Régimen no reconocido.');
  if (body.status && !STATUSES.includes(body.status)) errors.push('Estado no reconocido.');

  if (errors.length > 0) return Response.json({ error: errors.join(' ') }, { status: 400 });

  const pkg = await store().createPackage({
    title: body.title!.trim(),
    origin,
    destination,
    destinationName: body.destinationName?.trim() || airportLabel(destination),
    departDate: body.departDate!,
    returnDate: body.returnDate ?? null,
    nights: body.nights ?? null,
    board: body.board ?? 'all_inclusive',
    paxBase: body.paxBase ?? 2,
    listedPriceUsd: body.listedPriceUsd ?? null,
    status: body.status ?? 'borrador',
    notes: body.notes ?? null,
  });

  return Response.json({ package: pkg }, { status: 201 });
}
