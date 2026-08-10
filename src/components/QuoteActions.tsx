'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FareSnapshot, QuoteStatus } from '@/lib/types';

interface RefreshResponse {
  snapshot: FareSnapshot;
  deltaLabel: string | null;
  simulated: boolean;
  fallbackReason: string | null;
  message: string;
  url: string;
}

export function QuoteActions({
  quoteId,
  status,
  publicUrl,
}: {
  quoteId: string;
  status: QuoteStatus;
  publicUrl: string;
}) {
  const router = useRouter();

  const [message, setMessage] = useState('');
  const [revising, setRevising] = useState(false);
  const [reviseNote, setReviseNote] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<RefreshResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function revise() {
    if (!message.trim()) {
      setError('Pegá el mensaje nuevo del cliente.');
      return;
    }
    setRevising(true);
    setError(null);
    setReviseNote(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/revise`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo procesar el mensaje.');
      setReviseNote(
        json.changes?.length > 0
          ? `Cambios detectados: ${json.changes.join(' · ')}`
          : 'El mensaje no cambió ningún parámetro.',
      );
      setMessage('');
      // La tarifa anterior ya no aplica a estos parámetros.
      if (json.changes?.length > 0) setQuoteMessage(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setRevising(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/refresh`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo consultar la tarifa.');
      setQuoteMessage(json as RefreshResponse);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setRefreshing(false);
    }
  }

  async function changeStatus(next: QuoteStatus) {
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo cambiar el estado.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    }
  }

  async function copy() {
    if (!quoteMessage) return;
    try {
      await navigator.clipboard.writeText(quoteMessage.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('El navegador no dejó copiar. Seleccioná el texto a mano.');
    }
  }

  return (
    <div className="stack">
      {error && <div className="notice bad">{error}</div>}

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Cotizar la tarifa de hoy</h4>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 14 }}>
          Consulta al proveedor con los parámetros actuales y arma el mensaje para el cliente, con
          fecha de consulta y aviso de vigencia.
        </p>
        <button className="btn block" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Consultando a la aerolínea…' : 'Consultar y redactar respuesta'}
        </button>

        {quoteMessage && (
          <div style={{ marginTop: 18 }}>
            {quoteMessage.simulated && (
              <div className="notice" style={{ marginBottom: 12 }}>
                Tarifa <strong>simulada</strong>
                {quoteMessage.fallbackReason ? `: ${quoteMessage.fallbackReason}` : '.'} No la mandes
                como definitiva.
              </div>
            )}
            <div className="copybox">{quoteMessage.message}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={copy}>
                {copied ? 'Copiado ✓' : 'Copiar mensaje'}
              </button>
              <a
                className="btn ghost"
                href={`https://wa.me/?text=${encodeURIComponent(quoteMessage.message)}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir en WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>El cliente cambió el pedido</h4>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 14 }}>
          Pegá el mensaje nuevo tal cual llegó. El agente detecta qué cambió y actualiza la consulta
          sin perder el historial.
        </p>
        <div className="field">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Che, mejor el 22 de noviembre y somos 3"
            rows={3}
          />
        </div>
        <button className="btn ghost block" onClick={revise} disabled={revising}>
          {revising ? 'Interpretando…' : 'Aplicar cambio'}
        </button>
        {reviseNote && (
          <p style={{ color: 'var(--amber)', fontSize: 13, marginTop: 12 }}>{reviseNote}</p>
        )}
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Link para el cliente</h4>
        <div className="copybox" style={{ maxHeight: 'none' }}>
          {publicUrl}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10 }}>
          Muestra siempre la última tarifa cotizada, con su cuenta regresiva de vigencia.
        </p>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Estado de la consulta</h4>
        <div className="row">
          {(['abierta', 'cotizada', 'cerrada', 'perdida'] as QuoteStatus[]).map((s) => (
            <button
              key={s}
              className={s === status ? 'btn' : 'btn ghost'}
              style={{ fontSize: 12.5, padding: '7px 12px' }}
              onClick={() => changeStatus(s)}
              disabled={s === status}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
