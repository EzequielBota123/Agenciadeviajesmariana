'use client';

import { useState } from 'react';
import type { FareSnapshot } from '@/lib/types';

interface CheckResponse {
  snapshot: FareSnapshot;
  deltaLabel: string | null;
  previousCheckedAt: string | null;
  provider: string;
  simulated: boolean;
  fallbackReason: string | null;
  disclaimer: string;
}

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

  async function check() {
    const [origin, destination] = route.split('|');
    setLoading(true);
    setError(null);
    setResult(null);
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
                <span className="cur">USD</span>
                <span>{snapshot.totalUsd.toLocaleString('es-AR')}</span>
              </div>
              <div className="fare-sub">
                USD {snapshot.pricePerPaxUsd.toLocaleString('es-AR')} por pasajero
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
    </div>
  );
}
