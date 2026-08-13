import { AIRPORTS } from '@/lib/agent/airports';
import { EXPLORE_ORIGINS, exploreCycleDays, exploreRouteCount, isExploreOrigin, type ExploreOrigin } from '@/lib/explore';
import { formatUsd, secondaryTotalLabel } from '@/lib/money';
import { store } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Explorar destinos — Tarifa Viva',
  description: 'Los 50 destinos que vendemos, ordenados por precio real. Sin buscar ruta por ruta.',
};

const ORIGIN_LABEL: Record<ExploreOrigin, string> = {
  EZE: 'Buenos Aires (Ezeiza)',
  AEP: 'Buenos Aires (Aeroparque)',
  COR: 'Córdoba',
  MDZ: 'Mendoza',
  ROS: 'Rosario',
};

function daysAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export default async function ExplorarPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string }>;
}) {
  const { origin: rawOrigin } = await searchParams;
  const origin: ExploreOrigin = rawOrigin && isExploreOrigin(rawOrigin.toUpperCase()) ? (rawOrigin.toUpperCase() as ExploreOrigin) : 'EZE';

  const fares = await store().latestExploreFares(origin);
  const ranked = [...fares].sort((a, b) => a.totalUsd - b.totalUsd);
  const airportByIata = new Map(AIRPORTS.map((a) => [a.iata, a]));

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="brand" href="/">
            TARIFA<span>·</span>VIVA
          </a>
          <div className="navlinks">
            <a href="/#demo">Buscar un vuelo</a>
            <a href="/admin" className="cta">
              Panel
            </a>
          </div>
        </div>
      </nav>

      <header className="hero" style={{ paddingBottom: 30 }}>
        <div className="wrap">
          <div className="eyebrow">Explorar destinos</div>
          <h1>¿A dónde te sale más barato viajar ahora mismo?</h1>
          <p className="hero-sub">
            Comparamos Aerolíneas, JetSMART y Kayak contra los {exploreRouteCount()} destinos que vendemos, y los
            ordenamos por precio. Se actualiza solo, un poco por día — por eso carga al instante en vez de hacerte
            esperar un scraping en vivo.
          </p>
        </div>
      </header>

      <main className="wrap" style={{ maxWidth: 1100, paddingBottom: 60 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 10, fontFamily: 'var(--mono)' }}>
            Saliendo desde
          </p>
          <div className="row" style={{ gap: 8 }}>
            {EXPLORE_ORIGINS.map((o) => (
              <a
                key={o}
                href={`/explorar?origin=${o}`}
                className={o === origin ? 'btn' : 'btn ghost'}
                style={{ fontSize: 12.5, padding: '7px 12px' }}
              >
                {ORIGIN_LABEL[o]}
              </a>
            ))}
          </div>
        </div>

        {ranked.length === 0 ? (
          <div className="empty">
            Todavía no hay precios calculados para {ORIGIN_LABEL[origin]}. El barrido nocturno cubre{' '}
            {exploreRouteCount()} rutas en tandas — puede tardar hasta {exploreCycleDays()} días en llegar a todos los
            destinos la primera vez. Mientras tanto, probá el{' '}
            <a href="/#demo">comparador con una ruta puntual</a>.
          </div>
        ) : (
          <div className="explore-grid">
            {ranked.map((s, i) => {
              const airport = airportByIata.get(s.destination);
              return (
                <a key={s.id} className="explore-card" href={`/#demo`}>
                  {i === 0 && <span className="pill ok explore-card-badge">más barato hoy</span>}
                  <div className="explore-card-city">{airport?.city ?? s.destination}</div>
                  <div className="explore-card-country">{airport?.country ?? ''}</div>
                  <div className="explore-card-price">
                    <span className="cur">USD</span>
                    {formatUsd(s.totalUsd)}
                  </div>
                  {secondaryTotalLabel(s) && <div className="explore-card-sub">{secondaryTotalLabel(s)}</div>}
                  <div className="explore-card-meta">
                    {s.carrier ?? s.provider} · {daysAgoLabel(s.fetchedAt)}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 28 }}>
          Precios de referencia para 2 pasajeros, ida sola, tomados con ~60 días de anticipación. Pueden variar el
          día que consultes de verdad — usá el <a href="/#demo">comparador</a> con tus fechas exactas antes de
          confirmar nada.
        </p>
      </main>

      <footer>
        <div className="wrap">
          <div className="brand">
            TARIFA<span>·</span>VIVA
          </div>
          <div>Los precios son informativos y están sujetos a disponibilidad al momento de emitir.</div>
        </div>
      </footer>
    </>
  );
}
