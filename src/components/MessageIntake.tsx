'use client';

import { useState } from 'react';
import type { ExtractedParams } from '@/lib/agent/parse';
import type { Quote } from '@/lib/types';

interface IntakeResponse {
  quote: Quote;
  url: string;
  agent: { engine: 'claude' | 'reglas'; changes: string[]; extracted: ExtractedParams } | null;
}

const EXAMPLES = [
  'Hola! quiero viajar a Cancún el 15 de noviembre, somos 2 personas, ida y vuelta 7 noches',
  'Buenas, para Bariloche el 20/09 con mi señora, 3 noches, vuelo a la mañana',
  'Hola, quería ir a Madrid en marzo. Somos 2 adultos y 1 menor',
];

export function MessageIntake({ engine }: { engine: 'claude' | 'reglas' }) {
  const [message, setMessage] = useState(EXAMPLES[0]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!message.trim()) {
      setError('Escribí el mensaje del cliente.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          customerName: name.trim() || null,
          channel: 'web',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo registrar la consulta.');
      setResult(json as IntakeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  const e = result?.agent?.extracted;

  return (
    <div className="demo-panel">
      <div className="demo-grid">
        <div>
          <div className="field">
            <label htmlFor="intake-name">Nombre del cliente (opcional)</label>
            <input
              id="intake-name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="Carolina"
            />
          </div>

          <div className="field">
            <label htmlFor="intake-message">Mensaje tal cual lo escribió</label>
            <textarea
              id="intake-message"
              value={message}
              onChange={(ev) => setMessage(ev.target.value)}
              rows={4}
            />
            <p className="hint">
              Motor: {engine === 'claude' ? 'Claude (lenguaje natural)' : 'reglas (sin API key)'}.
            </p>
          </div>

          <div className="field">
            <label>Probá con otro ejemplo</label>
            <div className="row">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => setMessage(ex)}
                >
                  Ejemplo {i + 1}
                </button>
              ))}
            </div>
          </div>

          <button className="btn block" onClick={submit} disabled={loading}>
            {loading ? 'Interpretando el mensaje…' : 'Interpretar y abrir consulta'}
          </button>
        </div>

        <div className="result" style={{ alignItems: 'stretch', justifyContent: 'flex-start', textAlign: 'left' }}>
          {loading && <span className="loading-dots">el agente está leyendo el mensaje</span>}

          {!loading && error && (
            <p className="error">
              <strong>No se pudo procesar.</strong>
              <br />
              {error}
            </p>
          )}

          {!loading && !error && !result && (
            <div className="idle" style={{ margin: 'auto', textAlign: 'center' }}>
              El agente extrae fecha, destino y pasajeros del texto.
              <span className="spot">y arma la consulta lista para cotizar</span>
            </div>
          )}

          {!loading && result && e && (
            <div className="fare-out">
              <div className="tag" style={{ marginBottom: 12 }}>
                Consulta #{result.quote.id.slice(0, 8)} abierta
              </div>

              <dl className="kv">
                <dt>Ruta</dt>
                <dd>
                  {result.quote.params.origin} → {result.quote.params.destination}
                </dd>
                <dt>Ida</dt>
                <dd>{result.quote.params.departDate ?? 'sin definir'}</dd>
                <dt>Vuelta</dt>
                <dd>{result.quote.params.returnDate ?? 'sin definir'}</dd>
                <dt>Pasajeros</dt>
                <dd>
                  {result.quote.params.paxAdults} adulto(s)
                  {result.quote.params.paxChildren > 0
                    ? ` + ${result.quote.params.paxChildren} menor(es)`
                    : ''}
                </dd>
                <dt>Horario</dt>
                <dd>{result.quote.params.timePreference}</dd>
                <dt>Confianza</dt>
                <dd>{Math.round(e.confidence * 100)}%</dd>
              </dl>

              {e.summary && (
                <p className="fare-sub" style={{ marginTop: 16, textAlign: 'left' }}>
                  {e.summary}
                </p>
              )}

              <div className="row" style={{ marginTop: 20 }}>
                <a className="btn ghost" href={result.url} target="_blank" rel="noreferrer">
                  Ver link del cliente
                </a>
                <a className="btn ghost" href={`/admin/cotizaciones/${result.quote.id}`}>
                  Abrir en el panel
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
