'use client';

import { useState } from 'react';
import { AIRPORTS } from '@/lib/agent/airports';
import { bookingUrl } from '@/lib/booking';
import { formatArs, formatUsd, secondaryPerPaxLabel, secondaryTotalLabel } from '@/lib/money';
import type { FareSnapshot } from '@/lib/types';
import type { FareResult } from '@/lib/fares/types';

interface CheckResponse {
  snapshot: FareSnapshot;
  deltaLabel: string | null;
  previousCheckedAt: string | null;
  provider: string;
  simulated: boolean;
  fallbackReason: string | null;
  disclaimer: string;
}

interface CompareResponse {
  results: FareResult[];
  errors: Array<{ carrier: string; message: string }>;
}

const CARRIER_LABEL: Record<string, string> = {
  aerolineas: 'Aerolíneas Argentinas',
  jetsmart: 'JetSMART',
  kayak: 'Kayak',
};

const AIRPORT_OPTIONS = [...AIRPORTS].sort((a, b) => a.city.localeCompare(b.city, 'es'));

function defaultDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 97);
  return d.toISOString().slice(0, 10);
}

function defaultReturnDate(depart: string): string {
  const d = new Date(`${depart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

function stopsLabel(stops: number | undefined): string {
  if (stops === undefined) return 's/d';
  return stops === 0 ? 'directo' : `${stops} escala${stops > 1 ? 's' : ''}`;
}

export function FareChecker() {
  const [origin, setOrigin] = useState('EZE');
  const [destination, setDestination] = useState('CUN');
  const [date, setDate] = useState(defaultDate);
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnDate, setReturnDate] = useState(() => defaultReturnDate(defaultDate()));
  const [timePreference, setTimePreference] = useState('indistinto');
  const [pax, setPax] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const sameAirport = origin === destination;
  const effectiveReturnDate = roundTrip ? returnDate : null;

  async function check() {
    if (sameAirport) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCompareResult(null);
    setCompareError(null);
    try {
      const res = await fetch('/api/fares/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          departDate: date,
          returnDate: effectiveReturnDate,
          pax,
          timePreference,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo consultar la tarifa.');
      setResult(json as CheckResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function compare() {
    if (sameAirport) return;
    setComparing(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const res = await fetch('/api/fares/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          departDate: date,
          returnDate: effectiveReturnDate,
          pax,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo comparar entre aerolíneas.');
      setCompareResult(json as CompareResponse);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setComparing(false);
    }
  }

  const snapshot = result?.snapshot;
  const delta = snapshot?.deltaPct ?? null;
  const deltaClass = delta === null || Math.abs(delta) < 2 ? 'flat' : delta > 0 ? 'up' : 'down';

  return (
    <div className="demo-panel">
      <div className="demo-grid">
        <div>
          <div className="field">
            <label htmlFor="origin">Origen</label>
            <select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {AIRPORT_OPTIONS.map((a) => (
                <option key={a.iata} value={a.iata}>
                  {a.city} ({a.iata})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="destination">Destino</label>
            <select id="destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
              {AIRPORT_OPTIONS.map((a) => (
                <option key={a.iata} value={a.iata}>
                  {a.city} ({a.iata})
                </option>
              ))}
            </select>
          </div>

          {sameAirport && <p className="error" style={{ fontSize: 12.5 }}>Origen y destino no pueden ser el mismo.</p>}

          <div className="field">
            <label htmlFor="date">Fecha de ida</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => {
                const next = e.target.value;
                setDate(next);
                if (returnDate < next) setReturnDate(defaultReturnDate(next));
              }}
            />
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Ida y vuelta
            </label>
          </div>

          {roundTrip && (
            <div className="field">
              <label htmlFor="returnDate">Fecha de vuelta</label>
              <input
                id="returnDate"
                type="date"
                value={returnDate}
                min={date}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="time">Franja horaria</label>
            <select
              id="time"
              value={timePreference}
              onChange={(e) => setTimePreference(e.target.value)}
            >
              <option value="indistinto">Indistinto</option>
              <option value="mañana">A la mañana</option>
              <option value="tarde">A la tarde</option>
              <option value="noche">A la noche</option>
            </select>
          </div>

          <div className="field">
            <label>Pasajeros</label>
            <div className="pax-row">
              <button type="button" onClick={() => setPax((p) => Math.max(1, p - 1))} aria-label="Quitar pasajero">
                −
              </button>
              <span>{pax}</span>
              <button type="button" onClick={() => setPax((p) => Math.min(9, p + 1))} aria-label="Agregar pasajero">
                +
              </button>
            </div>
          </div>

          <button className="btn block" onClick={check} disabled={loading || sameAirport}>
            {loading ? 'Consultando disponibilidad…' : 'Consultar tarifa de hoy'}
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 10 }}
            onClick={compare}
            disabled={comparing || sameAirport}
          >
            {comparing ? 'Comparando aerolíneas…' : 'Comparar entre aerolíneas'}
          </button>
        </div>

        <div className="result">
          {loading && <span className="loading-dots">buscando tarifa en la aerolínea</span>}

          {!loading && error && (
            <p className="error">
              <strong>No se pudo cotizar.</strong>
              <br />
              {error}
            </p>
          )}

          {!loading && !error && !snapshot && (
            <div className="idle">
              Completá los datos y consultá.
              <span className="spot">el agente busca la tarifa vigente del día seleccionado</span>
            </div>
          )}

          {!loading && snapshot && result && (
            <div className="fare-out">
              <div className="fare-route">
                {snapshot.origin} → {snapshot.destination} · {snapshot.departDate}
                {snapshot.returnDate ? ` → ${snapshot.returnDate}` : ' (solo ida)'} · {snapshot.pax} pax
              </div>
              <div className="fare-amount">
                <span className="cur">{snapshot.nativeCurrency}</span>
                <span>
                  {snapshot.nativeCurrency === 'ARS'
                    ? formatArs(snapshot.totalNative)
                    : formatUsd(snapshot.totalUsd)}
                </span>
              </div>
              {secondaryTotalLabel(snapshot) && (
                <div className="fare-sub">{secondaryTotalLabel(snapshot)}</div>
              )}
              <div className="fare-sub">
                {snapshot.nativeCurrency === 'ARS'
                  ? `ARS ${formatArs(snapshot.pricePerPaxNative)} por pasajero`
                  : `USD ${formatUsd(snapshot.pricePerPaxUsd)} por pasajero`}
                {secondaryPerPaxLabel(snapshot) ? ` (${secondaryPerPaxLabel(snapshot)})` : ''}
                {snapshot.carrier ? ` · ${snapshot.carrier}` : ''}
              </div>

              <div className={`fare-delta ${deltaClass}`}>
                {delta === null
                  ? '— primer chequeo de esta combinación'
                  : Math.abs(delta) < 2
                    ? '— sin cambios relevantes'
                    : delta > 0
                      ? `▲ ${delta.toFixed(1)}% respecto al último chequeo`
                      : `▼ ${Math.abs(delta).toFixed(1)}% respecto al último chequeo`}
              </div>

              <div className="fare-badge">Tarifa vigente hoy · puede variar mañana</div>

              <div className="fare-meta">
                <span>
                  consultado {new Date(snapshot.fetchedAt).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>
                  asientos disponibles: {snapshot.seatsLeft ?? 's/d'}
                </span>
                <span>fuente: {result.simulated ? 'simulador' : result.provider}</span>
                {snapshot.exchangeRate && <span>dólar usado: ARS {formatArs(snapshot.exchangeRate)}</span>}
              </div>

              {result.fallbackReason && (
                <p className="fare-sub" style={{ marginTop: 14, color: 'var(--red)' }}>
                  El proveedor real falló ({result.fallbackReason}). Esta cifra es simulada.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {comparing && (
        <p className="loading-dots" style={{ marginTop: 24, display: 'block' }}>
          consultando todas las aerolíneas en paralelo
        </p>
      )}

      {!comparing && compareError && (
        <p className="error" style={{ marginTop: 24 }}>
          <strong>No se pudo comparar.</strong>
          <br />
          {compareError}
        </p>
      )}

      {!comparing && compareResult && (
        <div style={{ marginTop: 24 }}>
          {compareResult.results.length === 0 ? (
            <p className="fare-sub">Ninguna aerolínea devolvió tarifa para esta búsqueda.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Aerolínea</th>
                    <th>Total ARS</th>
                    <th>≈ Total USD</th>
                    <th>Por pasajero</th>
                    <th>Escalas</th>
                    <th>Asientos</th>
                    <th>Salida</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...compareResult.results]
                    .sort((a, b) => a.totalUsd - b.totalUsd)
                    .map((r, i) => {
                      const viaKayak = r.provider === 'kayak';
                      const rawInfo =
                        r.raw && typeof r.raw === 'object' ? (r.raw as { kayakBookingUrl?: string | null; stops?: number }) : null;
                      const link =
                        (viaKayak ? (rawInfo?.kayakBookingUrl ?? null) : null) ??
                        bookingUrl({
                          carrier: r.carrier,
                          origin,
                          destination,
                          departDate: date,
                          returnDate: effectiveReturnDate,
                          paxAdults: pax,
                        });
                      return (
                        <tr key={`${r.provider}-${r.carrier}-${i}`}>
                          <td>
                            {r.carrier ?? r.provider}
                            {i === 0 && (
                              <span className="pill ok" style={{ marginLeft: 8 }}>
                                más barata
                              </span>
                            )}
                            {viaKayak && (
                              <span className="pill" style={{ marginLeft: 8 }} title="Precio de un revendedor visto en Kayak, no el precio directo de la aerolínea">
                                vía Kayak
                              </span>
                            )}
                          </td>
                          <td className="mono">
                            {r.nativeCurrency === 'ARS' ? `ARS ${formatArs(r.totalNative)}` : '—'}
                          </td>
                          <td className="mono">USD {formatUsd(r.totalUsd)}</td>
                          <td className="mono">
                            {r.nativeCurrency === 'ARS'
                              ? `ARS ${formatArs(r.pricePerPaxNative)}`
                              : `USD ${formatUsd(r.pricePerPaxUsd)}`}
                          </td>
                          <td>{stopsLabel(rawInfo?.stops)}</td>
                          <td>{r.seatsLeft ?? 's/d'}</td>
                          <td className="mono">
                            {r.outboundDeparture
                              ? new Date(r.outboundDeparture.replace(' ', 'T')).toLocaleString('es-AR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 's/d'}
                          </td>
                          <td>
                            {link && (
                              <a href={link} target="_blank" rel="noopener noreferrer" className="pill">
                                {viaKayak ? 'ver oferta →' : 'reservar →'}
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {compareResult.results.some((r) => r.provider === 'kayak') && (
            <p className="fare-sub" style={{ marginTop: 12 }}>
              Las filas marcadas <strong>"vía Kayak"</strong> son de un metabuscador: suman
              aerolíneas que no cotizamos directo (LATAM, Avianca, Copa...), pero el precio suele
              ser de un revendedor (Kiwi, Decolar, CTrip...), no la tarifa oficial de la aerolínea.
            </p>
          )}

          {compareResult.errors.length > 0 && (
            <p className="fare-sub" style={{ marginTop: 12 }}>
              Sin respuesta de:{' '}
              {compareResult.errors
                .map((e) => CARRIER_LABEL[e.carrier] ?? e.carrier)
                .join(', ')}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
