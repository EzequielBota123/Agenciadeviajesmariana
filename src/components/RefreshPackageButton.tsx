'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RefreshPackageButton({ packageId }: { packageId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falló el chequeo.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={run} disabled={loading}>
        {loading ? 'Consultando…' : 'Chequear ahora'}
      </button>
      {error && (
        <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>
      )}
    </>
  );
}
