import { notFound } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { airportLabel } from '@/lib/agent/airports';
import { DISCLAIMER, fareDeltaLabel } from '@/lib/agent/reply';
import { formatDateLong, formatStamp, isExpired } from '@/lib/dates';
import { store } from '@/lib/store';
import { BOARD_LABEL, totalPax } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tu cotización — Tarifa Viva',
  // El link se comparte por WhatsApp; no queremos que se indexe.
  robots: { index: false, follow: false },
};

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await store().getQuoteByToken(token);
  if (!quote) notFound();

  const [snapshots, pkg] = await Promise.all([
    store().listSnapshots({ quoteId: quote.id, limit: 1 }),
    quote.packageId ? store().getPackage(quote.packageId) : Promise.resolve(null),
  ]);
  const latest = snapshots[0] ?? null;
  const expired = latest ? isExpired(latest.validUntil) : false;

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="brand" href="/">
            TARIFA<span>·</span>VIVA
          </a>
          <div className="navlinks">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              cotización #{quote.id.slice(0, 8)}
            </span>
          </div>
        </div>
      </nav>

      <main className="wrap" style={{ maxWidth: 720 }}>
        <div className="quote-hero">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>
            {quote.customerName ? `Hola ${quote.customerName}` : 'Tu cotización'}
          </div>

          {pkg && <h2 style={{ margin: '0 auto 22px', textAlign: 'center' }}>{pkg.title}</h2>}

          {!latest ? (
            <div className="card">
              <h4>Todavía estamos cotizando</h4>
              <p style={{ marginTop: 8 }}>
                Ya tenemos tu pedido cargado. En cuanto tengamos la tarifa del día te la mostramos
                acá mismo.
              </p>
            </div>
          ) : (
            <>
              <div className="quote-price">
                <small>USD</small>
                {latest.totalUsd.toLocaleString('es-AR')}
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
                USD {latest.pricePerPaxUsd.toLocaleString('es-AR')} por pasajero ·{' '}
                {latest.pax} {latest.pax === 1 ? 'pasajero' : 'pasajeros'}
              </p>

              <div style={{ marginTop: 18 }}>
                {expired ? (
                  <span className="pill bad">Esta tarifa venció — pedinos una actualizada</span>
                ) : (
                  <Countdown validUntil={latest.validUntil} />
                )}
              </div>

              <div className="fare-badge" style={{ marginTop: 18, textAlign: 'left' }}>
                {DISCLAIMER}
              </div>
            </>
          )}
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 14 }}>Lo que estamos cotizando</h4>
          <dl className="kv">
            <dt>Ruta</dt>
            <dd>
              {airportLabel(quote.params.origin)} → {airportLabel(quote.params.destination)}
            </dd>
            <dt>Ida</dt>
            <dd>
              {quote.params.departDate ? formatDateLong(quote.params.departDate) : 'a confirmar'}
            </dd>
            {quote.params.returnDate && (
              <>
                <dt>Vuelta</dt>
                <dd>{formatDateLong(quote.params.returnDate)}</dd>
              </>
            )}
            <dt>Pasajeros</dt>
            <dd>
              {quote.params.paxAdults} adulto(s)
              {quote.params.paxChildren > 0 ? ` + ${quote.params.paxChildren} menor(es)` : ''} ={' '}
              {totalPax(quote.params)}
            </dd>
            {quote.params.timePreference !== 'indistinto' && (
              <>
                <dt>Horario</dt>
                <dd>Vuelo a la {quote.params.timePreference}</dd>
              </>
            )}
            {pkg && (
              <>
                <dt>Régimen</dt>
                <dd>{BOARD_LABEL[pkg.board]}</dd>
              </>
            )}
            {latest?.carrier && (
              <>
                <dt>Aerolínea</dt>
                <dd>{latest.carrier}</dd>
              </>
            )}
          </dl>
        </div>

        {latest && (
          <div className="card" style={{ marginBottom: 40 }}>
            <h4 style={{ marginBottom: 10 }}>Por qué te avisamos la vigencia</h4>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              Las aerolíneas ajustan el precio según los asientos que van quedando. Esta tarifa la
              consultamos el <strong>{formatStamp(latest.fetchedAt)}</strong>
              {latest.seatsLeft !== null && (
                <>
                  {' '}
                  y en ese momento quedaban <strong>{latest.seatsLeft} lugares</strong> en esa clase
                </>
              )}
              . {fareDeltaLabel(latest) ? `Respecto de la consulta anterior, ${fareDeltaLabel(latest)}.` : ''}{' '}
              Preferimos decírtelo antes que prometerte un número que mañana puede no existir.
            </p>
          </div>
        )}
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
