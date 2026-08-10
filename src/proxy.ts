import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_COOKIE = 'tv_admin';

/** En Next 16 esto se llama `proxy` (antes era `middleware`). */
export default function proxy(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN;

  // Sin ADMIN_TOKEN el panel queda abierto: es el modo cómodo para desarrollo.
  // En Vercel hay que configurarlo sí o sí antes de cargar datos reales.
  if (!token) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin/login')) return NextResponse.next();

  if (req.cookies.get(ADMIN_COOKIE)?.value === token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*'],
};
