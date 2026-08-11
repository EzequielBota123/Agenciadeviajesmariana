'use client';

import { useState } from 'react';
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
};

const ROUTES = [
  { value: 'EZE|CUN', label: 'EZE → Cancún' },
  { value: 'AEP|BRC', label: 'AEP → Bariloche' },
  { value: 'EZE|MIA', label: 'EZE → Miami' },
  { value: 'EZE|MAD', label: 'EZE → Madrid' },
  { value: 'EZE|PUJ', label: 'EZE → Punta Cana' },
  { value: 'AEP|IGR', label: 'AEP → Iguazú' },
];

function defaultDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 97);
  return d.toISOString().slice(0, 10);
}

export function FareChecker() {
  const [route, setRoute] = useState(ROUTES[0].value);
  const [date, setDate] = useState(defaultDate);
  const [timePreference, setTimePreference] = useState('indistinto');
  const [pax, setPax] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  async function check() {
    const [origin, destination] = route.split('|');
    setLoading(true);
    setError(null);
    setResult(null);
    setCompareResult(null);
    setCompareError(null);
    try {
      const res = await fetch('/api/fares/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, destination, departDate: date, pax, timePreference }),
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
    const [origin, destination] = route.split('|');
    setComparing(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const res = await fetch('/api/fares/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, destination, departDate: date, pax }),
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
            <label htmlFor="route">Ruta</label>
            <select id="route" value={route} onChange={(e) => setRoute(e.target.value)}>
              {ROUTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="date">Fecha de viaje</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

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

          <button className="btn block" onClick={check} disabled={loading}>
            {loading ? 'Consultando disponibilidad…' : 'Consultar tarifa de hoy'}
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 10 }}
            onClick={compare}
            disabled={comparing}
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
                {snapshot.origin} → {snapshot.destination} · {snapshot.departDate} · {snapshot.pax} pax
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
                    <th>Asientos</th>
                    <th>Salida</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...compareResult.results]
                    .sort((a, b) => a.totalUsd - b.totalUsd)
                    .map((r, i) => {
                      const [origin, destination] = route.split('|');
                      const link = bookingUrl({
                        carrier: r.carrier,
                        origin,
                        destination,
                        departDate: date,
                        paxAdults: pax,
                      });
                      return (
                        <tr key={r.provider}>
                          <td>
                            {r.carrier ?? r.provider}
                            {i === 0 && (
                              <span className="pill ok" style={{ marginLeft: 8 }}>
                                más barata
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
                                reservar →
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
