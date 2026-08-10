import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cached: NeonQueryFunction<false, false> | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Cliente SQL sobre Vercel Postgres / Neon.
 * Devuelve null si no hay DATABASE_URL: la app arranca igual con el store en
 * memoria, así `npm run dev` funciona sin configurar nada.
 */
export function db(): NeonQueryFunction<false, false> | null {
  if (!hasDatabase()) return null;
  if (!cached) cached = neon(process.env.DATABASE_URL as string);
  return cached;
}
