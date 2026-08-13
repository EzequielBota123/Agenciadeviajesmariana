import { addDays, arToday } from './dates';
import { AIRPORTS } from './agent/airports';

/**
 * "Explorar destinos": una grilla tipo Google Flights con el precio más
 * barato encontrado hacia cada uno de los ~50 destinos, desde los orígenes
 * con más vuelos reales. Los precios se precalculan de a poco con un cron
 * (ver /api/cron/explore-fares) — nunca se scrapea en vivo cuando alguien
 * entra a mirar, por eso la página carga al instante.
 */
export const EXPLORE_ORIGINS = ['EZE', 'AEP', 'COR', 'MDZ', 'ROS'] as const;
export type ExploreOrigin = (typeof EXPLORE_ORIGINS)[number];

export function isExploreOrigin(v: string): v is ExploreOrigin {
  return (EXPLORE_ORIGINS as readonly string[]).includes(v);
}

export interface ExploreRoute {
  origin: ExploreOrigin;
  destination: string;
}

/** Marca única para distinguir estos snapshots de una consulta suelta del demo. */
export const EXPLORE_TAG = '_explore';

const ALL_ROUTES: ExploreRoute[] = EXPLORE_ORIGINS.flatMap((origin) =>
  AIRPORTS.filter((a) => a.iata !== origin).map((a) => ({ origin, destination: a.iata })),
);

const BATCH_SIZE = 8;
const TOTAL_BATCHES = Math.ceil(ALL_ROUTES.length / BATCH_SIZE);

/** Ventana rotativa: qué rutas le toca chequear al cron hoy. */
export function todaysExploreBatch(now: Date = new Date()): ExploreRoute[] {
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const batch = dayIndex % TOTAL_BATCHES;
  return ALL_ROUTES.slice(batch * BATCH_SIZE, batch * BATCH_SIZE + BATCH_SIZE);
}

export function exploreRouteCount(): number {
  return ALL_ROUTES.length;
}

export function exploreCycleDays(): number {
  return TOTAL_BATCHES;
}

/** Fecha de referencia que usa el barrido: fija en el tiempo, no rueda con cada corrida del cron. */
export function exploreDepartDate(): string {
  return addDays(arToday(), 60);
}
