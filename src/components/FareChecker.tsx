'use client';

import { useState } from 'react';
import { FareCompareTable } from './FareCompareTable';
import { AIRPORTS } from '@/lib/agent/airports';
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

interface CompareStreamEvent {
  type: 'carrier' | 'done';
  carrier?: string;
  ok?: boolean;
  result?: FareResult;
  results?: FareResult[];
  error?: string;
}

type ProgressStatus = 'pending' | 'ok' | 'error';

const CARRIER_LABEL: Record<string, string> = {
  aerolineas: 'Aerolíneas Argentinas',
  jetsmart: 'JetSMART',
  kayak: 'Kayak (LATAM, Avianca, Copa y otras)',
};

const CARRIER_KEYS = ['jetsmart', 'aerolineas', 'kayak'];

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
  const [progress, setProgress] = useState<Record<string, ProgressStatus>>({});

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
    setCompareResult({ results: [], errors: [] });
    setProgress(Object.fromEntries(CARRIER_KEYS.map((c) => [c, 'pending' as ProgressStatus])));
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

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'No se pudo comparar entre aerolíneas.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data:')) continue;
          const event = JSON.parse(line.slice(5).trim()) as CompareStreamEvent;
          if (event.type !== 'carrier' || !event.carrier) continue;

          setProgress((prev) => ({ ...prev, [event.carrier as string]: event.ok ? 'ok' : 'error' }));

          if (event.ok) {
            const newResults = event.carrier === 'kayak' ? (event.results ?? []) : event.result ? [event.result] : [];
            setCompareResult((prev) => ({
              results: [...(prev?.results ?? []), ...newResults],
              errors: prev?.errors ?? [],
            }));
          } else {
            setCompareResult((prev) => ({
              results: prev?.results ?? [],
              errors: [...(prev?.errors ?? []), { carrier: event.carrier as string, message: event.error ?? 'falló' }],
            }));
          }
        }
      }
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

          <button className="btn block" onClick={compare} disabled={comparing || sameAirport}>
            {comparing ? 'Buscando…' : 'Buscar vuelo'}
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 10 }}
            onClick={check}
            disabled={loading || sameAirport}
          >
            {loading ? 'Consultando…' : 'Ver solo tarifa oficial de Aerolíneas'}
          </button>
        </div>

        <div className="result">
          {loading && (
            <div className="fare-out" aria-busy="true" aria-label="Buscando tarifa">
              <div className="skeleton skeleton-line w40" />
              <div className="skeleton skeleton-line w60" style={{ height: 34, margin: '10px 0' }} />
              <div className="skeleton skeleton-line w30" />
              <div className="skeleton skeleton-line w40" style={{ marginTop: 18 }} />
            </div>
          )}

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
        <div style={{ marginTop: 24 }} className="provider-progress">
          {CARRIER_KEYS.map((c) => {
            const status = progress[c] ?? 'pending';
            return (
              <div key={c} className={`provider-progress-row ${status}`}>
                {status === 'pending' && <span className="spinner" />}
                {status === 'ok' && <span className="status-icon">✓</span>}
                {status === 'error' && <span className="status-icon">✕</span>}
                <span>
                  {CARRIER_LABEL[c] ?? c}
                  {status === 'pending' && ' — consultando…'}
                  {status === 'error' && ' — sin respuesta'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!comparing && compareError && (
        <p className="error" style={{ marginTop: 24 }}>
          <strong>No se pudo comparar.</strong>
          <br />
          {compareError}
        </p>
      )}

      {compareResult && (compareResult.results.length > 0 || !comparing) && (
        <div style={{ marginTop: 24 }}>
          <FareCompareTable
            rows={compareResult.results.map((r, i) => ({
              key: `${r.provider}-${r.carrier}-${i}`,
              provider: r.provider,
              carrier: r.carrier,
              nativeCurrency: r.nativeCurrency,
              totalNative: r.totalNative,
              totalUsd: r.totalUsd,
              pricePerPaxNative: r.pricePerPaxNative,
              pricePerPaxUsd: r.pricePerPaxUsd,
              seatsLeft: r.seatsLeft,
              outboundDeparture: r.outboundDeparture,
              raw: r.raw,
            }))}
            origin={origin}
            destination={destination}
            departDate={date}
            returnDate={effectiveReturnDate}
            pax={pax}
          />

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
