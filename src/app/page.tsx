import { SiteFooter, SiteNav } from '@/components/SiteChrome';
import { formatDate } from '@/lib/dates';
import { primaryTotalLabel } from '@/lib/money';
import { store } from '@/lib/store';
import { BOARD_LABEL, type FareSnapshot, type TravelPackage } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PackageCard {
  pkg: TravelPackage;
  snapshot: FareSnapshot | null;
}

async function publishedPackages(): Promise<PackageCard[]> {
  const packages = await store().listPackages({ status: 'publicado' });
  return Promise.all(
    packages.map(async (pkg) => {
      const [snapshot] = await store().listSnapshots({ packageId: pkg.id, limit: 1 });
      return { pkg, snapshot: snapshot ?? null };
    }),
  );
}

const TOOLS = [
  {
    href: '/flyers',
    icon: '🖼️',
    title: 'Crear un flyer',
    text: 'Pegá el texto del programa y obtené una pieza lista para historias y posteos de Instagram.',
  },
  {
    href: '/comparar',
    icon: '✈️',
    title: 'Comparar vuelos',
    text: 'Aerolíneas, JetSMART y Kayak en una sola búsqueda, con el precio del día.',
  },
  {
    href: '/explorar',
    icon: '🧭',
    title: 'Explorar destinos',
    text: 'Los destinos ordenados del más barato al más caro, saliendo desde tu ciudad.',
  },
  {
    href: '/consulta',
    icon: '💬',
    title: 'Leer una consulta',
    text: 'Copiá el mensaje de WhatsApp del cliente y se arma la consulta con fecha, destino y pasajeros.',
  },
  {
    href: '/admin',
    icon: '📋',
    title: 'Panel de gestión',
    text: 'Consultas de clientes, paquetes publicados y seguimiento de tarifas.',
  },
];

export default async function HomePage() {
  const cards = await publishedPackages();

  return (
    <>
      <SiteNav />

      <header className="home-hero">
        <div className="wrap">
          <div className="eyebrow">Agencia de viajes</div>
          <h1>Viajá tranquilo. Nosotros nos ocupamos del resto.</h1>
          <p className="hero-sub">
            Paquetes, vuelos y escapadas armados a tu medida. Todo lo que necesitás para cotizar,
            comparar y comunicar un viaje, en un solo lugar.
          </p>
          <div className="hero-actions">
            <a className="btn" href="/flyers">
              Crear un flyer
            </a>
            <a className="btn ghost" href="/comparar">
              Comparar vuelos
            </a>
          </div>
        </div>
      </header>

      <section className="alt">
        <div className="wrap">
          <div className="tag">Herramientas</div>
          <h2>Todo a un clic, sin contraseñas.</h2>
          <div className="tool-grid">
            {TOOLS.map((t) => (
              <a key={t.href} className="tool-card" href={t.href}>
                <div className="tool-icon" aria-hidden>
                  {t.icon}
                </div>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
                <span className="tool-go">Abrir →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="tag">Salidas publicadas</div>
          <h2>Próximas salidas</h2>
          {cards.length === 0 ? (
            <div className="empty">
              Todavía no hay paquetes publicados. <a href="/admin/paquetes/nuevo">Cargá el primero</a>.
            </div>
          ) : (
            <div className="pkg-grid">
              {cards.map(({ pkg, snapshot }) => (
                <div className="pkg-card" key={pkg.id}>
                  <div className="pkg-dest">{pkg.destinationName ?? pkg.destination}</div>
                  <div className="pkg-title">{pkg.title}</div>
                  <div className="pkg-meta">
                    {formatDate(pkg.departDate)}
                    {pkg.nights ? ` · ${pkg.nights} noches` : ''} · {BOARD_LABEL[pkg.board]}
                  </div>
                  <div className="pkg-price">{snapshot ? primaryTotalLabel(snapshot) : 'Consultar'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
