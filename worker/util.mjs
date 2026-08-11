// Helpers compartidos entre los scrapers de los distintos proveedores.

/** Fin del día de hoy en hora argentina (UTC-3 fijo, sin horario de verano). */
export function endOfArDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  // 23:59:59.999 en Buenos Aires == 02:59:59.999 UTC del día siguiente (UTC-3 fijo).
  return new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999));
}

/**
 * Cotización ARS→USD vía DolarAPI. Si falla, devuelve null y el caller decide
 * qué hacer — no tira la búsqueda por esto.
 */
export async function fetchUsdRate() {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json.venta);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
