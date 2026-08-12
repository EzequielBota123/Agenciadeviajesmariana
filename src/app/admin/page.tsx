import { DeletePackageButton } from '@/components/DeletePackageButton';
import { DeleteQuoteButton } from '@/components/DeleteQuoteButton';
import { RefreshPackageButton } from '@/components/RefreshPackageButton';
import { agentEngine } from '@/lib/agent/parse';
import { airportLabel } from '@/lib/agent/airports';
import { adminTokenConfigured } from '@/lib/auth';
import { daysUntil, formatDate, formatStamp } from '@/lib/dates';
import { activeProviderName } from '@/lib/fares';
import { primaryTotalLabel, secondaryTotalLabel } from '@/lib/money';
import { needsAttention } from '@/lib/quoting';
import { store, storageMode } from '@/lib/store';
import { BOARD_LABEL, totalPax, type FareSnapshot, type Quote, type TravelPackage } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PackageRow {
  pkg: TravelPackage;
  snapshot: FareSnapshot | null;
}

interface QuoteRow {
  quote: Quote;
  snapshot: FareSnapshot | null;
}

function DeltaPill({ snapshot }: { snapshot: FareSnapshot | null }) {
  if (!snapshot) return <span className="pill">sin chequear</span>;
  const d = snapshot.deltaPct;
  if (d === null) return <span className="pill">1er chequeo</span>;
  if (d > 2) return <span className="pill bad">▲ {d.toFixed(1)}%</span>;
  if (d < -2) return <span className="pill ok">▼ {Math.abs(d).toFixed(1)}%</span>;
  return <span className="pill">estable</span>;
}

function StatusPill({ status }: { status: Quote['status'] }) {
  const cls =
    status === 'cerrada' ? 'ok' : status === 'perdida' ? 'bad' : status === 'cotizada' ? 'warn' : '';
  return <span className={`pill ${cls}`}>{status}</span>;
}

export default async function AdminPage() {
  const [packages, quotes] = await Promise.all([
    store().listPackages(),
    store().listQuotes({ limit: 100 }),
  ]);

  const packageRows: PackageRow[] = await Promise.all(
    packages.map(async (pkg) => {
      const [snapshot] = await store().listSnapshots({ packageId: pkg.id, limit: 1 });
      return { pkg, snapshot: snapshot ?? null };
    }),
  );

  const quoteRows: QuoteRow[] = await Promise.all(
    quotes.map(async (quote) => {
      const [snapshot] = await store().listSnapshots({ quoteId: quote.id, limit: 1 });
      return { quote, snapshot: snapshot ?? null };
    }),
  );

  const alerts = packageRows.filter((r) => r.snapshot && needsAttention(r.snapshot));

  return (
    <>
      <div className="admin-header">
        <div>
          <div className="tag">Panel de operación</div>
          <h2 style={{ fontSize: 30 }}>Consultas y paquetes</h2>
          <p>
            Almacenamiento: <strong>{storageMode()}</strong> · proveedor de tarifas:{' '}
            <strong>{activeProviderName()}</strong> · agente de lenguaje:{' '}
            <strong>{agentEngine()}</strong>.
          </p>
        </div>
        <div className="row">
          <a className="btn" href="/admin/paquetes/nuevo">
            Nuevo paquete
          </a>
        </div>
      </div>

      {storageMode() === 'memoria' && (
        <div className="notice">
          Estás corriendo <strong>sin base de datos</strong>. Todo vive en memoria y se pierde
          cuando el proceso se reinicia — en Vercel eso pasa seguido. Configurá{' '}
          <code>DATABASE_URL</code> antes de cargar datos reales.
        </div>
      )}

      {!adminTokenConfigured() && (
        <div className="notice bad">
          El panel está <strong>abierto</strong>: no hay <code>ADMIN_TOKEN</code> configurado.
          Cualquiera con la URL puede crear paquetes y ver consultas. Configurálo antes de publicar.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="notice">
          <strong>
            {alerts.length} paquete{alerts.length > 1 ? 's' : ''} necesita
            {alerts.length > 1 ? 'n' : ''} revisión:
          </strong>{' '}
          {alerts
            .map((a) =>
              a.snapshot!.seatsLeft !== null && a.snapshot!.seatsLeft <= 3
                ? `${a.pkg.title} (quedan ${a.snapshot!.seatsLeft} lugares)`
                : `${a.pkg.title} (${a.snapshot!.deltaPct}%)`,
            )
            .join(' · ')}
        </div>
      )}

      <section className="admin-section">
        <div className="section-head">
          <h3>Paquetes publicados</h3>
          <span className="pill">{packages.length} en total</span>
        </div>

        <div className="table-wrap">
          {packages.length === 0 ? (
            <div className="empty">
              Todavía no cargaste ningún paquete. <a href="/admin/paquetes/nuevo">Creá el primero</a>.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Paquete</th>
                  <th>Ruta</th>
                  <th>Salida</th>
                  <th>Publicado</th>
                  <th>Tarifa hoy</th>
                  <th>Movimiento</th>
                  <th>Últ. chequeo</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {packageRows.map(({ pkg, snapshot }) => {
                  const dte = daysUntil(pkg.departDate);
                  return (
                    <tr key={pkg.id}>
                      <td>
                        <strong>{pkg.title}</strong>
                        <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>
                          {BOARD_LABEL[pkg.board]} · base {pkg.paxBase} pax
                          {pkg.nights ? ` · ${pkg.nights} noches` : ''}
                        </div>
                      </td>
                      <td className="mono">
                        {pkg.origin} → {pkg.destination}
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {airportLabel(pkg.destination)}
                        </div>
                      </td>
                      <td className="mono">
                        {formatDate(pkg.departDate)}
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {dte < 0 ? 'ya pasó' : `en ${dte} días`}
                        </div>
                      </td>
                      <td className="mono">
                        {pkg.listedPriceUsd !== null
                          ? `USD ${pkg.listedPriceUsd.toLocaleString('es-AR')}`
                          : '—'}
                      </td>
                      <td className="mono">
                        {snapshot ? (
                          <>
                            <strong style={{ color: 'var(--amber)' }}>{primaryTotalLabel(snapshot)}</strong>
                            {secondaryTotalLabel(snapshot) && (
                              <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                                {secondaryTotalLabel(snapshot)}
                              </div>
                            )}
                            {snapshot.seatsLeft !== null && (
                              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                                {snapshot.seatsLeft} lugares
                              </div>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <DeltaPill snapshot={snapshot} />
                      </td>
                      <td className="mono" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                        {snapshot ? formatStamp(snapshot.fetchedAt) : '—'}
                      </td>
                      <td>
                        <span className={`pill ${pkg.status === 'publicado' ? 'ok' : ''}`}>
                          {pkg.status}
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <RefreshPackageButton packageId={pkg.id} />
                          <DeletePackageButton packageId={pkg.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="admin-section">
        <div className="section-head">
          <h3>Consultas de clientes</h3>
          <span className="pill">{quotes.length} en total</span>
        </div>

        <div className="table-wrap">
          {quotes.length === 0 ? (
            <div className="empty">
              Todavía no entró ninguna consulta. Probá el formulario de la{' '}
              <a href="/#demo">página pública</a>.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Pedido actual</th>
                  <th>Revisiones</th>
                  <th>Última tarifa</th>
                  <th>Movimiento</th>
                  <th>Actualizada</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quoteRows.map(({ quote, snapshot }) => (
                  <tr key={quote.id}>
                    <td>
                      <strong>{quote.customerName ?? 'Sin nombre'}</strong>
                      <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>
                        {quote.customerContact ?? quote.channel}
                      </div>
                    </td>
                    <td className="mono">
                      {quote.params.origin} → {quote.params.destination}
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {quote.params.departDate ? formatDate(quote.params.departDate) : 'sin fecha'} ·{' '}
                        {totalPax(quote.params)} pax · {quote.params.timePreference}
                      </div>
                    </td>
                    <td className="mono">
                      {quote.revision === 0 ? (
                        <span className="pill">sin cambios</span>
                      ) : (
                        <span className="pill warn">{quote.revision} cambios</span>
                      )}
                    </td>
                    <td className="mono">
                      {snapshot ? (
                        <>
                          <strong style={{ color: 'var(--amber)' }}>{primaryTotalLabel(snapshot)}</strong>
                          {secondaryTotalLabel(snapshot) && (
                            <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                              {secondaryTotalLabel(snapshot)}
                            </div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <DeltaPill snapshot={snapshot} />
                    </td>
                    <td className="mono" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                      {formatStamp(quote.updatedAt)}
                    </td>
                    <td>
                      <StatusPill status={quote.status} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <a
                          className="btn ghost"
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          href={`/admin/cotizaciones/${quote.id}`}
                        >
                          Abrir
                        </a>
                        <DeleteQuoteButton quoteId={quote.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
