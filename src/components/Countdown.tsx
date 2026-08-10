'use client';

import { useEffect, useState } from 'react';

function remaining(target: string): string {
  const ms = Date.parse(target) - Date.now();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'esta tarifa ya venció';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `vence en ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * La cuenta regresiva es el argumento del producto hecho interfaz: el cliente
 * ve, en vivo, que el número que está mirando tiene fecha de vencimiento.
 */
export function Countdown({ validUntil }: { validUntil: string }) {
  const [label, setLabel] = useState(() => remaining(validUntil));

  useEffect(() => {
    const id = setInterval(() => setLabel(remaining(validUntil)), 1000);
    return () => clearInterval(id);
  }, [validUntil]);

  return <span className="countdown">{label}</span>;
}
