// Formato de plata dual: cuando la tarifa vino en pesos (vuelos de cabotaje),
// mostramos el peso como cifra real y el dólar como equivalente aproximado —
// nunca al revés, porque el peso es lo que la aerolínea cobra de verdad.

import type { FareSnapshot } from './types';

export function formatUsd(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatArs(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

type MoneyLike = Pick<FareSnapshot, 'nativeCurrency' | 'totalNative' | 'totalUsd' | 'pricePerPaxNative' | 'pricePerPaxUsd'>;

/** Cifra principal, en la moneda real que cobra la aerolínea. */
export function primaryTotalLabel(s: MoneyLike): string {
  return s.nativeCurrency === 'ARS' ? `ARS ${formatArs(s.totalNative)}` : `USD ${formatUsd(s.totalUsd)}`;
}

/** Cifra secundaria (el equivalente aproximado), o null si no aplica. */
export function secondaryTotalLabel(s: MoneyLike): string | null {
  return s.nativeCurrency === 'ARS' ? `≈ USD ${formatUsd(s.totalUsd)}` : null;
}

export function primaryPerPaxLabel(s: MoneyLike): string {
  return s.nativeCurrency === 'ARS'
    ? `ARS ${formatArs(s.pricePerPaxNative)}`
    : `USD ${formatUsd(s.pricePerPaxUsd)}`;
}

export function secondaryPerPaxLabel(s: MoneyLike): string | null {
  return s.nativeCurrency === 'ARS' ? `≈ USD ${formatUsd(s.pricePerPaxUsd)}` : null;
}
