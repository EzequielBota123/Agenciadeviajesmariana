// Toda la vigencia de una tarifa se mide en hora argentina: "esta tarifa es
// la de hoy" significa "hasta las 23:59 de hoy en Buenos Aires", no UTC.

export const AR_TZ = 'America/Argentina/Buenos_Aires';

function tzParts(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset del huso, en minutos, para ese instante (AR = -180 todo el año). */
function tzOffsetMinutes(date: Date, tz: string): number {
  const p = tzParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** Fecha calendario en Argentina, formato YYYY-MM-DD. */
export function arToday(now: Date = new Date()): string {
  const p = tzParts(now, AR_TZ);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Instante en que vence la tarifa de hoy: 23:59:59.999 hora argentina. */
export function endOfArDay(now: Date = new Date()): Date {
  const p = tzParts(now, AR_TZ);
  const offset = tzOffsetMinutes(now, AR_TZ);
  const utcMs = Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59, 999) - offset * 60000;
  return new Date(utcMs);
}

/** Días que faltan para la fecha de salida (puede ser negativo si ya pasó). */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const today = arToday(now);
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function isValidDate(dateStr: string | null | undefined): dateStr is string {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(t);
}

export function addDays(dateStr: string, days: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const AR_DATE = new Intl.DateTimeFormat('es-AR', {
  timeZone: AR_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const AR_LONG = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const AR_TIME = new Intl.DateTimeFormat('es-AR', {
  timeZone: AR_TZ,
  hour: '2-digit',
  minute: '2-digit',
});

/** "15/11/2026" a partir de "2026-11-15". */
export function formatDate(dateStr: string | null): string {
  if (!isValidDate(dateStr)) return '—';
  return AR_DATE.format(new Date(`${dateStr}T12:00:00Z`));
}

/** "15 de noviembre de 2026". */
export function formatDateLong(dateStr: string | null): string {
  if (!isValidDate(dateStr)) return '—';
  return AR_LONG.format(new Date(`${dateStr}T12:00:00Z`));
}

/** "10/08 14:32" a partir de un ISO. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${AR_DATE.format(d)} ${AR_TIME.format(d)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return AR_TIME.format(d);
}

/** "vence en 6 h 12 m" — cuánto le queda de vida a la tarifa. */
export function timeLeft(validUntilIso: string, now: Date = new Date()): string {
  const ms = Date.parse(validUntilIso) - now.getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'vencida';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

export function isExpired(validUntilIso: string, now: Date = new Date()): boolean {
  const t = Date.parse(validUntilIso);
  return Number.isNaN(t) ? true : t <= now.getTime();
}
