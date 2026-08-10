'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AIRPORTS } from '@/lib/agent/airports';
import { BOARD_LABEL, type Board } from '@/lib/types';

function plusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function NewPackageForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    origin: 'EZE',
    destination: 'CUN',
    destinationName: '',
    departDate: plusDays(90),
    returnDate: plusDays(97),
    nights: 7,
    board: 'all_inclusive' as Board,
    paxBase: 2,
    listedPriceUsd: '',
    status: 'publicado' as 'borrador' | 'publicado' | 'pausado',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nights: form.nights || null,
          listedPriceUsd: form.listedPriceUsd === '' ? null : Number(form.listedPriceUsd),
          destinationName: form.destinationName || undefined,
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo crear el paquete.');
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 720 }}>
      {error && <div className="notice bad">{error}</div>}

      <div className="field">
        <label htmlFor="title">Título de la publicación</label>
        <input
          id="title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Cancún All Inclusive — 15 de noviembre"
          required
        />
        <p className="hint">Es el texto que va a la pieza de redes.</p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="origin">Origen</label>
          <select id="origin" value={form.origin} onChange={(e) => set('origin', e.target.value)}>
            {AIRPORTS.map((a) => (
              <option key={a.iata} value={a.iata}>
                {a.iata} — {a.city}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="destination">Destino</label>
          <select
            id="destination"
            value={form.destination}
            onChange={(e) => set('destination', e.target.value)}
          >
            {AIRPORTS.map((a) => (
              <option key={a.iata} value={a.iata}>
                {a.iata} — {a.city}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="departDate">Fecha de salida</label>
          <input
            id="departDate"
            type="date"
            value={form.departDate}
            onChange={(e) => set('departDate', e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="returnDate">Fecha de regreso</label>
          <input
            id="returnDate"
            type="date"
            value={form.returnDate}
            onChange={(e) => set('returnDate', e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="board">Régimen</label>
          <select
            id="board"
            value={form.board}
            onChange={(e) => set('board', e.target.value as Board)}
          >
            {(Object.keys(BOARD_LABEL) as Board[]).map((b) => (
              <option key={b} value={b}>
                {BOARD_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nights">Noches</label>
          <input
            id="nights"
            type="number"
            min={1}
            max={60}
            value={form.nights}
            onChange={(e) => set('nights', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="paxBase">Pasajeros base</label>
          <input
            id="paxBase"
            type="number"
            min={1}
            max={20}
            value={form.paxBase}
            onChange={(e) => set('paxBase', Number(e.target.value))}
          />
          <p className="hint">Es la cantidad con la que el cron chequea la tarifa cada día.</p>
        </div>
        <div className="field">
          <label htmlFor="listedPriceUsd">Precio publicado (USD)</label>
          <input
            id="listedPriceUsd"
            type="number"
            min={0}
            step={1}
            value={form.listedPriceUsd}
            onChange={(e) => set('listedPriceUsd', e.target.value)}
            placeholder="1490"
          />
          <p className="hint">Contra esto se compara la tarifa real del día.</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="status">Estado</label>
        <select
          id="status"
          value={form.status}
          onChange={(e) => set('status', e.target.value as typeof form.status)}
        >
          <option value="publicado">Publicado (entra al cron diario)</option>
          <option value="borrador">Borrador</option>
          <option value="pausado">Pausado</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="notes">Notas internas</label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Hotel, traslados, condiciones del cupo…"
        />
      </div>

      <div className="row">
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Crear paquete'}
        </button>
        <a className="btn ghost" href="/admin">
          Cancelar
        </a>
      </div>
    </form>
  );
}
