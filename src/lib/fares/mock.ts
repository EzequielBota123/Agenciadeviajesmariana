import { arToday, daysUntil, endOfArDay } from '@/lib/dates';
import type { FareProvider, FareQuery, FareResult } from './types';

// Simulador determinístico. La misma consulta, el mismo día, devuelve el mismo
// precio; al día siguiente cambia. Eso es a propósito: si el mock fuera random
// por request, el "subió / bajó" del panel sería ruido y no se podría demostrar
// la premisa del producto (la tarifa de hoy no es la de mañana).

const BASE_FARES: Record<string, number> = {
  'EZE-CUN': 610,
  'EZE-MIA': 540,
  'EZE-MAD': 890,
  'EZE-GRU': 220,
  'EZE-SCL': 190,
  'EZE-PUJ': 640,
  'AEP-BRC': 118,
  'AEP-USH': 145,
  'AEP-IGR': 105,
  'AEP-MDZ': 95,
  'AEP-SLA': 110,
  'COR-BRC': 130,
};

const CARRIERS: Record<string, string> = {
  'EZE-CUN': 'Copa Airlines',
  'EZE-MIA': 'American Airlines',
  'EZE-MAD': 'Iberia',
  'EZE-GRU': 'Gol',
  'EZE-SCL': 'LATAM',
  'EZE-PUJ': 'Copa Airlines',
  'AEP-BRC': 'Aerolíneas Argentinas',
  'AEP-USH': 'Aerolíneas Argentinas',
  'AEP-IGR': 'Flybondi',
  'AEP-MDZ': 'JetSMART',
  'AEP-SLA': 'Aerolíneas Argentinas',
  'COR-BRC': 'Aerolíneas Argentinas',
};

/** Hash estable (FNV-1a) para derivar números pseudoaleatorios reproducibles. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Devuelve un número en [0,1) a partir de una semilla textual. */
function rand01(seed: string): number {
  return hash(seed) / 0x100000000;
}

function baseFare(route: string): number {
  if (BASE_FARES[route]) return BASE_FARES[route];
  // Ruta desconocida: precio estable derivado del código, no random puro.
  return 260 + Math.round(rand01(`base:${route}`) * 700);
}

/**
 * Curva de ocupación: cuanto más cerca la fecha y más lleno el avión, más caro.
 * El salto abrupto simula el caso que motivó todo esto — alguien compra 50
 * pasajes y de un día para el otro se encarece el vuelo.
 */
function loadFactor(route: string, departDate: string, today: string): number {
  const seasonal = rand01(`season:${route}:${departDate}`); // 0..1 fijo por fecha
  const dailyShock = rand01(`shock:${route}:${departDate}:${today}`); // cambia cada día
  const base = 0.45 + seasonal * 0.35; // 45%–80% de ocupación estructural
  const shock = dailyShock > 0.82 ? 0.18 : dailyShock < 0.12 ? -0.1 : 0;
  return Math.min(0.97, Math.max(0.2, base + shock));
}

export class MockFareProvider implements FareProvider {
  readonly name = 'mock';
  readonly configured = true;

  async search(q: FareQuery): Promise<FareResult> {
    const now = new Date();
    const today = arToday(now);
    const route = `${q.origin}-${q.destination}`;
    const dte = daysUntil(q.departDate, now);

    const base = baseFare(route);
    const load = loadFactor(route, q.departDate, today);

    // Cerca de la fecha, el precio sube fuerte; muy lejos, baja un poco.
    const urgency =
      dte <= 0 ? 1.9 : dte < 14 ? 1.55 : dte < 45 ? 1.22 : dte < 120 ? 1.02 : 0.94;

    // La ocupación pega de forma no lineal: de 80% para arriba se dispara.
    const occupancy = 1 + Math.pow(Math.max(0, load - 0.5) * 2, 2) * 0.55;

    // Ida y vuelta cuesta bastante más que un tramo suelto.
    const roundTrip = q.returnDate ? 1.72 : 1;

    // Grupos: a más pasajeros, más chance de agotar la clase barata.
    const groupPressure = 1 + Math.max(0, q.pax - 1) * 0.018;

    const cabinMultiplier =
      q.cabin === 'BUSINESS' ? 3.4 : q.cabin === 'PREMIUM_ECONOMY' ? 1.8 : 1;

    // Preferencia horaria: la mañana suele ser la franja más demandada.
    const timeMultiplier =
      q.timePreference === 'mañana' ? 1.06 : q.timePreference === 'noche' ? 0.96 : 1;

    const pricePerPax = Math.round(
      base * urgency * occupancy * roundTrip * groupPressure * cabinMultiplier * timeMultiplier,
    );

    // Las aerolíneas no publican los asientos libres del avión: publican los
    // que quedan en esa clase tarifaria, y nunca más de 9. Cuanto más lleno el
    // vuelo, menos quedan en la clase barata — que es lo que hace que la
    // escasez se note antes en el precio que en la cabina.
    const seatsLeft = Math.max(0, Math.min(9, Math.round(9 * (1 - load) * 2)));

    // Latencia simulada: consultar una aerolínea nunca es instantáneo.
    await new Promise((r) => setTimeout(r, 320 + Math.round(rand01(`lat:${route}:${today}`) * 500)));

    return {
      provider: this.name,
      nativeCurrency: 'USD',
      pricePerPaxNative: pricePerPax,
      totalNative: pricePerPax * q.pax,
      pricePerPaxUsd: pricePerPax,
      totalUsd: pricePerPax * q.pax,
      exchangeRate: null,
      seatsLeft,
      carrier: CARRIERS[route] ?? 'Aerolíneas Argentinas',
      cabin: q.cabin ?? 'ECONOMY',
      outboundDeparture:
        q.timePreference === 'mañana'
          ? '08:35'
          : q.timePreference === 'tarde'
            ? '15:10'
            : q.timePreference === 'noche'
              ? '22:40'
              : '11:20',
      fetchedAt: now.toISOString(),
      validUntil: endOfArDay(now).toISOString(),
      raw: { simulated: true, loadFactor: Number(load.toFixed(3)), daysToDeparture: dte },
    };
  }
}
