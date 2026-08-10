import { formatDateLong, formatStamp, timeLeft } from '@/lib/dates';
import { airportLabel } from './airports';
import type { FareSnapshot, Quote, TravelPackage } from '@/lib/types';

// El texto que el agente le manda al cliente. La regla del producto es que
// ninguna cifra sale sin su fecha de consulta y su aviso de vigencia: si el
// precio se mueve mañana, la agencia no queda pegada a una promesa que el
// mercado desmintió.

export const DISCLAIMER =
  'Esta tarifa es la vigente hoy y puede variar mañana: las aerolíneas ajustan el precio según la disponibilidad que va quedando. Para congelarla hace falta emitir.';

export function fareDeltaLabel(snapshot: FareSnapshot): string | null {
  if (snapshot.deltaPct === null) return null;
  const pct = snapshot.deltaPct;
  if (Math.abs(pct) < 2) return 'sin cambios relevantes desde el último chequeo';
  return pct > 0
    ? `subió ${pct.toFixed(1)}% desde el último chequeo`
    : `bajó ${Math.abs(pct).toFixed(1)}% desde el último chequeo`;
}

/** Mensaje listo para copiar y pegar en WhatsApp. */
export function composeQuoteMessage(args: {
  quote: Quote;
  snapshot: FareSnapshot;
  pkg?: TravelPackage | null;
  publicUrl?: string | null;
}): string {
  const { quote, snapshot, pkg, publicUrl } = args;
  const name = quote.customerName ? `Hola ${quote.customerName}! ` : 'Hola! ';
  const route = `${airportLabel(snapshot.origin)} → ${airportLabel(snapshot.destination)}`;
  const pax = snapshot.pax === 1 ? '1 pasajero' : `${snapshot.pax} pasajeros`;

  const lines: string[] = [];
  lines.push(`${name}Te paso la tarifa que está vigente ahora mismo.`);
  lines.push('');
  if (pkg) lines.push(`📦 ${pkg.title}`);
  lines.push(`✈️ ${route}`);
  lines.push(`📅 Salida: ${formatDateLong(snapshot.departDate)}`);
  if (snapshot.returnDate) lines.push(`📅 Regreso: ${formatDateLong(snapshot.returnDate)}`);
  lines.push(`👥 ${pax}`);
  if (quote.params.timePreference !== 'indistinto') {
    lines.push(`🕗 Preferencia horaria: ${quote.params.timePreference}`);
  }
  lines.push('');
  lines.push(`💵 USD ${snapshot.pricePerPaxUsd.toLocaleString('es-AR')} por pasajero`);
  lines.push(`💵 USD ${snapshot.totalUsd.toLocaleString('es-AR')} en total`);
  if (snapshot.carrier) lines.push(`🛫 Operado por ${snapshot.carrier}`);
  if (snapshot.seatsLeft !== null) {
    lines.push(
      snapshot.seatsLeft <= 3
        ? `⚠️ Quedan ${snapshot.seatsLeft} lugares en esta tarifa`
        : `🎫 Lugares disponibles en esta tarifa: ${snapshot.seatsLeft}`,
    );
  }

  const delta = fareDeltaLabel(snapshot);
  if (delta) lines.push(`📈 ${delta}`);

  lines.push('');
  lines.push(`⏳ Consultado el ${formatStamp(snapshot.fetchedAt)} — vence en ${timeLeft(snapshot.validUntil)}.`);
  lines.push(DISCLAIMER);

  if (publicUrl) {
    lines.push('');
    lines.push(`Podés ver la cotización actualizada acá: ${publicUrl}`);
  }

  return lines.join('\n');
}

/** Nota corta para el timeline interno cuando se registra una tarifa. */
export function composeFareNote(snapshot: FareSnapshot): string {
  const delta = fareDeltaLabel(snapshot);
  const base = `Tarifa ${snapshot.provider}: USD ${snapshot.totalUsd} (${snapshot.pax} pax) para el ${snapshot.departDate}`;
  return delta ? `${base} — ${delta}` : base;
}
