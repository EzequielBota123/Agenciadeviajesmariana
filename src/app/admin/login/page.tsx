import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, adminTokenConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function login(formData: FormData) {
  'use server';
  const token = String(formData.get('token') ?? '');
  const next = String(formData.get('next') ?? '/admin');

  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith('/') ? next : '/admin');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  if (!adminTokenConfigured()) redirect('/admin');

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <div className="tag">Panel</div>
      <h2 style={{ fontSize: 26, marginBottom: 8 }}>Acceso restringido</h2>
      <p className="lede" style={{ marginBottom: 24 }}>
        Ingresá el token de administración configurado en <code>ADMIN_TOKEN</code>.
      </p>

      {params.error && <div className="notice bad">Token incorrecto.</div>}

      <form action={login}>
        <input type="hidden" name="next" value={params.next ?? '/admin'} />
        <div className="field">
          <label htmlFor="token">Token</label>
          <input id="token" name="token" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn block" type="submit">
          Entrar
        </button>
      </form>
    </div>
  );
}
