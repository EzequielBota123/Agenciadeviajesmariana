import { notFound } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { FareCompareTable } from '@/components/FareCompareTable';
import { airportLabel } from '@/lib/agent/airports';
import { DISCLAIMER, fareDeltaLabel } from '@/lib/agent/reply';
import { bookingUrl } from '@/lib/booking';
import { formatDateLong, formatStamp, isExpired } from '@/lib/dates';
import {
  formatArs,
  formatUsd,
  primaryPerPaxLabel,
  secondaryPerPaxLabel,
  secondaryTotalLabel,
} from '@/lib/money';
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
    store().listSnapshots({ quoteId: quote.id, limit: 30 }),
    quote.packageId ? store().getPackage(quote.packageId) : Promise.resolve(null),
  ]);

  // Última ronda de consulta: un snapshot por proveedor (Aerolíneas,
  // JetSMART, Kayak...), el más reciente de cada uno.
  const latestRound = (() => {
    const seen = new Set<string>();
    const rows: typeof snapshots = [];
    for (const s of snapshots) {
      if (seen.has(s.provider)) continue;
      seen.add(s.provider);
      rows.push(s);
    }
    return rows;
  })();
  const latest = [...latestRound].sort((a, b) => a.totalUsd - b.totalUsd)[0] ?? null;
  const expired = latest ? isExpired(latest.validUntil) : false;
  const reserveUrl = latest
    ? bookingUrl({
        carrier: latest.carrier,
        origin: quote.params.origin,
        destination: quote.params.destination,
        departDate: quote.params.departDate,
        returnDate: quote.params.returnDate,
        paxAdults: quote.params.paxAdults,
        paxChildren: quote.params.paxChildren,
        cabin: quote.params.cabin,
      })
    : null;

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
                <small>{latest.nativeCurrency}</small>
                {latest.nativeCurrency === 'ARS' ? formatArs(latest.totalNative) : formatUsd(latest.totalUsd)}
              </div>
              {secondaryTotalLabel(latest) && (
                <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 14 }}>{secondaryTotalLabel(latest)}</p>
              )}
              <p style={{ color: 'var(--muted)', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
                {primaryPerPaxLabel(latest)} por pasajero
                {secondaryPerPaxLabel(latest) ? ` (${secondaryPerPaxLabel(latest)})` : ''} ·{' '}
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

              {reserveUrl && (
                <div style={{ marginTop: 22 }}>
                  <a
                    className="btn block"
                    href={reserveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Reservar en {latest?.carrier} →
                  </a>
                  <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                    Te lleva al buscador oficial de la aerolínea con esta ruta y fecha ya cargadas.
                    La compra la hacés ahí — el precio final es el que te muestre la aerolínea en
                    ese momento.
                  </p>
                </div>
              )}
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

        {latestRound.length > 1 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 6 }}>Comparamos entre varias aerolíneas</h4>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
              Elegí la que más te convenga — el botón te lleva directo al buscador oficial de cada una.
            </p>
            <FareCompareTable
              rows={latestRound.map((s) => ({
                key: s.id,
                provider: s.provider,
                carrier: s.carrier,
                nativeCurrency: s.nativeCurrency,
                totalNative: s.totalNative,
                totalUsd: s.totalUsd,
                pricePerPaxNative: s.pricePerPaxNative,
                pricePerPaxUsd: s.pricePerPaxUsd,
                seatsLeft: s.seatsLeft,
                raw: s.raw,
              }))}
              origin={quote.params.origin}
              destination={quote.params.destination}
              departDate={quote.params.departDate ?? ''}
              returnDate={quote.params.returnDate}
              pax={totalPax(quote.params)}
              showToolbar={false}
            />
          </div>
        )}

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
