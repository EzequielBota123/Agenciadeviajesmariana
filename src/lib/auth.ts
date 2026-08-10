import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'tv_admin';

/** Si no hay ADMIN_TOKEN configurado, el panel queda abierto (modo desarrollo). */
export function adminTokenConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

export function tokenMatches(candidate: string | undefined | null): boolean {
  if (!adminTokenConfigured()) return true;
  return Boolean(candidate) && candidate === process.env.ADMIN_TOKEN;
}

/** Chequeo desde un Server Component o Server Action. */
export async function isAdmin(): Promise<boolean> {
  if (!adminTokenConfigured()) return true;
  const jar = await cookies();
  return tokenMatches(jar.get(ADMIN_COOKIE)?.value);
}

/**
 * Chequeo desde una Route Handler. Acepta la cookie del panel o el header
 * Authorization, para poder llamar la API desde un script o desde n8n.
 */
export function isAuthorizedRequest(req: Request): boolean {
  if (!adminTokenConfigured()) return true;

  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ') && tokenMatches(header.slice(7))) return true;

  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.split(';').map((c) => c.trim().split('='));
  const found = match.find(([k]) => k === ADMIN_COOKIE)?.[1];
  return tokenMatches(found ? decodeURIComponent(found) : null);
}

export function unauthorized(): Response {
  return Response.json(
    { error: 'No autorizado. Falta el token de administración.' },
    { status: 401 },
  );
}
