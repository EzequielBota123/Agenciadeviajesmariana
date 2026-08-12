'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeletePackageButton({ packageId }: { packageId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm('¿Eliminar este paquete? Esta acción no se puede deshacer.')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falló la eliminación.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="btn ghost"
        style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)' }}
        onClick={run}
        disabled={loading}
        aria-label="Eliminar paquete"
        title="Eliminar paquete"
      >
        {loading ? (
          '…'
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        )}
      </button>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </>
  );
}
