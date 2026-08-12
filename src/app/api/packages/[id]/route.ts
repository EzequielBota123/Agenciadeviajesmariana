import { isAuthorizedRequest, unauthorized } from '@/lib/auth';
import { checkFareForPackage } from '@/lib/quoting';
import { store, type PackageInput } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// POST fuerza un chequeo de tarifa; el worker de scraping puede tardar
// hasta ~100s (cold start + navegador).
export const maxDuration = 110;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const pkg = await store().getPackage(id);
  if (!pkg) return Response.json({ error: 'Paquete no encontrado.' }, { status: 404 });

  if (pkg.status !== 'publicado' && !isAuthorizedRequest(req)) return unauthorized();

  const snapshots = await store().listSnapshots({ packageId: pkg.id, limit: 30 });
  return Response.json({ package: pkg, snapshots });
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  let patch: Partial<PackageInput>;
  try {
    patch = (await req.json()) as Partial<PackageInput>;
  } catch {
    return Response.json({ error: 'Body inválido: se esperaba JSON.' }, { status: 400 });
  }

  const updated = await store().updatePackage(id, patch);
  if (!updated) return Response.json({ error: 'Paquete no encontrado.' }, { status: 404 });
  return Response.json({ package: updated });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  const deleted = await store().deletePackage(id);
  if (!deleted) return Response.json({ error: 'Paquete no encontrado.' }, { status: 404 });

  return Response.json({ ok: true });
}

/** Fuerza un chequeo de tarifa para este paquete, sin esperar al cron. */
export async function POST(req: Request, ctx: Ctx) {
  if (!isAuthorizedRequest(req)) return unauthorized();
  const { id } = await ctx.params;

  const pkg = await store().getPackage(id);
  if (!pkg) return Response.json({ error: 'Paquete no encontrado.' }, { status: 404 });

  try {
    const result = await checkFareForPackage(pkg);
    return Response.json(result);
  } catch (err) {
    console.error('[api/packages/:id POST]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'No se pudo consultar la tarifa.' },
      { status: 502 },
    );
  }
}
