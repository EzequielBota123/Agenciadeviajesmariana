import { notFound } from 'next/navigation';
import { QuoteActions } from '@/components/QuoteActions';
import { airportLabel } from '@/lib/agent/airports';
import { fareDeltaLabel } from '@/lib/agent/reply';
import { formatDate, formatStamp, isExpired, timeLeft } from '@/lib/dates';
import {
  formatArs,
  formatUsd,
  primaryPerPaxLabel,
  secondaryPerPaxLabel,
  secondaryTotalLabel,
} from '@/lib/money';
import { store } from '@/lib/store';
import { quoteUrl } from '@/lib/urls';
import { totalPax } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await store().getQuote(id);
  if (!quote) notFound();

  const [events, snapshots, pkg] = await Promise.all([
    store().listEvents(quote.id),
    store().listSnapshots({ quoteId: quote.id, limit: 20 }),
    quote.packageId ? store().getPackage(quote.packageId) : Promise.resolve(null),
  ]);

  const latest = snapshots[0] ?? null;
  const url = quoteUrl(quote.token);

  return (
    <>
      <div className="admin-header">
        <div>
          <div className="tag">
            <a href="/admin" style={{ textDecoration: 'none' }}>
              ← volver al panel
            </a>
          </div>
          <h2 style={{ fontSize: 30 }}>{quote.customerName ?? 'Consulta sin nombre'}</h2>
          <p>
            {quote.customerContact ? `${quote.customerContact} · ` : ''}
            canal {quote.channel} · abierta el {formatStamp(quote.createdAt)}
            {quote.revision > 0 && (
              <>
                {' '}
                · <strong>{quote.revision} cambios de pedido</strong>
              </>
            )}
          </p>
        </div>
      </div>

      {latest && isExpired(latest.validUntil) && (
        <div className="notice bad">
          La última tarifa cotizada <strong>venció</strong> ({formatStamp(latest.validUntil)}). No la
          mandes sin volver a consultar.
        </div>
      )}

      <div className="workspace">
        <div className="stack">
          <div className="card">
            <h4 style={{ marginBottom: 14 }}>Pedido actual</h4>
            <dl className="kv">
              <dt>Ruta</dt>
              <dd>
                {airportLabel(quote.params.origin)} → {airportLabel(quote.params.destination)}{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  ({quote.params.origin}–{quote.params.destination})
                </span>
              </dd>
              <dt>Ida</dt>
              <dd>{quote.params.departDate ? formatDate(quote.params.departDate) : 'sin definir'}</dd>
              <dt>Vuelta</dt>
              <dd>{quote.params.returnDate ? formatDate(quote.params.returnDate) : 'sin definir'}</dd>
              <dt>Pasajeros</dt>
              <dd>
                {quote.params.paxAdults} adulto(s)
                {quote.params.paxChildren > 0 ? ` + ${quote.params.paxChildren} menor(es)` : ''} ={' '}
                {totalPax(quote.params)}
              </dd>
              <dt>Horario</dt>
              <dd>{quote.params.timePreference}</dd>
              <dt>Cabina</dt>
              <dd>{quote.params.cabin}</dd>
              {pkg && (
                <>
                  <dt>Paquete</dt>
                  <dd>{pkg.title}</dd>
                </>
              )}
            </dl>
          </div>

          {latest && (
            <div className="card">
              <h4 style={{ marginBottom: 14 }}>Última tarifa</h4>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>
                <span style={{ fontSize: 16, color: 'var(--muted)', marginRight: 8 }}>{latest.nativeCurrency}</span>
                {latest.nativeCurrency === 'ARS' ? formatArs(latest.totalNative) : formatUsd(latest.totalUsd)}
              </div>
              {secondaryTotalLabel(latest) && (
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{secondaryTotalLabel(latest)}</p>
              )}
              <p style={{ color: 'var(--muted)', fontSize: 13, fontFamily: 'var(--mono)', marginTop: 8 }}>
                {primaryPerPaxLabel(latest)} por pasajero
                {secondaryPerPaxLabel(latest) ? ` (${secondaryPerPaxLabel(latest)})` : ''} ·{' '}
                {latest.carrier ?? 'sin aerolínea informada'}
              </p>
              <p style={{ marginTop: 10, fontSize: 13.5 }}>
                {fareDeltaLabel(latest) ?? 'primer chequeo de esta combinación'}
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10 }}>
                Consultada {formatStamp(latest.fetchedAt)} · vence en {timeLeft(latest.validUntil)} ·
                fuente {latest.provider}
                {latest.seatsLeft !== null ? ` · ${latest.seatsLeft} lugares` : ''}
              </p>
            </div>
          )}

          <div className="card">
            <h4 style={{ marginBottom: 6 }}>Historial de la conversación</h4>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
              Cada mensaje, cada cambio de parámetro y cada consulta de tarifa, en orden.
            </p>
            <div className="timeline">
              {events.length === 0 && <div className="empty">Sin eventos todavía.</div>}
              {events.map((ev) => (
                <div className="tl-item" key={ev.id}>
                  <div className="tl-when">{formatStamp(ev.createdAt)}</div>
                  <div className="tl-body">
                    <div className={`tl-kind ${ev.kind}`}>
                      {ev.kind} · {ev.actor}
                    </div>
                    <p>{ev.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {snapshots.length > 1 && (
            <div className="card">
              <h4 style={{ marginBottom: 12 }}>Cómo se movió la tarifa</h4>
              <div className="table-wrap" style={{ border: 'none' }}>
                <table style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Consultada</th>
                      <th>Pax</th>
                      <th>Total</th>
                      <th>Movimiento</th>
                      <th>Lugares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.id}>
                        <td className="mono">{formatStamp(s.fetchedAt)}</td>
                        <td className="mono">{s.pax}</td>
                        <td className="mono">
                          {s.nativeCurrency === 'ARS' ? `ARS ${formatArs(s.totalNative)}` : `USD ${formatUsd(s.totalUsd)}`}
                        </td>
                        <td className="mono">
                          {s.deltaPct === null
                            ? '—'
                            : `${s.deltaPct > 0 ? '+' : ''}${s.deltaPct.toFixed(1)}%`}
                        </td>
                        <td className="mono">{s.seatsLeft ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <QuoteActions quoteId={quote.id} status={quote.status} publicUrl={url} />
      </div>
    </>
  );
}
