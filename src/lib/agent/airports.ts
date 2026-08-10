// Diccionario de destinos que la agencia vende. Sirve para dos cosas:
//  1. traducir "quiero ir a Cancún" → CUN sin depender del modelo;
//  2. validar lo que el modelo devuelve — si propone un IATA que no está acá,
//     lo tratamos como no reconocido en vez de cotizar una ruta inventada.

export interface Airport {
  iata: string;
  city: string;
  country: string;
  aliases: string[];
}

export const AIRPORTS: Airport[] = [
  { iata: 'EZE', city: 'Buenos Aires', country: 'Argentina', aliases: ['ezeiza', 'buenos aires', 'bsas', 'baires', 'capital'] },
  { iata: 'AEP', city: 'Buenos Aires (Aeroparque)', country: 'Argentina', aliases: ['aeroparque', 'jorge newbery'] },
  { iata: 'COR', city: 'Córdoba', country: 'Argentina', aliases: ['cordoba'] },
  { iata: 'ROS', city: 'Rosario', country: 'Argentina', aliases: ['rosario'] },
  { iata: 'MDZ', city: 'Mendoza', country: 'Argentina', aliases: ['mendoza'] },
  { iata: 'BRC', city: 'Bariloche', country: 'Argentina', aliases: ['bariloche', 'san carlos de bariloche'] },
  { iata: 'USH', city: 'Ushuaia', country: 'Argentina', aliases: ['ushuaia', 'fin del mundo'] },
  { iata: 'IGR', city: 'Puerto Iguazú', country: 'Argentina', aliases: ['iguazu', 'iguazú', 'cataratas', 'puerto iguazu'] },
  { iata: 'SLA', city: 'Salta', country: 'Argentina', aliases: ['salta'] },
  { iata: 'FTE', city: 'El Calafate', country: 'Argentina', aliases: ['calafate', 'el calafate', 'perito moreno'] },
  { iata: 'CUN', city: 'Cancún', country: 'México', aliases: ['cancun', 'cancún', 'riviera maya', 'playa del carmen'] },
  { iata: 'MIA', city: 'Miami', country: 'Estados Unidos', aliases: ['miami', 'florida'] },
  { iata: 'MCO', city: 'Orlando', country: 'Estados Unidos', aliases: ['orlando', 'disney'] },
  { iata: 'JFK', city: 'Nueva York', country: 'Estados Unidos', aliases: ['nueva york', 'new york', 'nyc'] },
  { iata: 'MAD', city: 'Madrid', country: 'España', aliases: ['madrid', 'españa', 'espana'] },
  { iata: 'BCN', city: 'Barcelona', country: 'España', aliases: ['barcelona'] },
  { iata: 'FCO', city: 'Roma', country: 'Italia', aliases: ['roma', 'rome', 'italia'] },
  { iata: 'CDG', city: 'París', country: 'Francia', aliases: ['paris', 'parís', 'francia'] },
  { iata: 'GRU', city: 'São Paulo', country: 'Brasil', aliases: ['san pablo', 'sao paulo', 'são paulo'] },
  { iata: 'GIG', city: 'Río de Janeiro', country: 'Brasil', aliases: ['rio', 'río de janeiro', 'rio de janeiro'] },
  { iata: 'FLN', city: 'Florianópolis', country: 'Brasil', aliases: ['floripa', 'florianopolis', 'florianópolis'] },
  { iata: 'SCL', city: 'Santiago de Chile', country: 'Chile', aliases: ['santiago', 'chile'] },
  { iata: 'PUJ', city: 'Punta Cana', country: 'República Dominicana', aliases: ['punta cana', 'republica dominicana'] },
  { iata: 'MVD', city: 'Montevideo', country: 'Uruguay', aliases: ['montevideo', 'uruguay'] },
  { iata: 'LIM', city: 'Lima', country: 'Perú', aliases: ['lima', 'peru', 'perú'] },
  { iata: 'CUZ', city: 'Cusco', country: 'Perú', aliases: ['cusco', 'cuzco', 'machu picchu'] },
];

const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

export function isKnownIata(code: string | null | undefined): boolean {
  return Boolean(code && BY_IATA.has(code.toUpperCase()));
}

export function airportLabel(iata: string): string {
  return BY_IATA.get(iata.toUpperCase())?.city ?? iata.toUpperCase();
}

/** Busca un aeropuerto por código IATA, ciudad o alias dentro de un texto libre. */
export function findAirport(text: string): Airport | null {
  const t = normalize(text);
  if (!t) return null;

  const upper = text.trim().toUpperCase();
  if (BY_IATA.has(upper)) return BY_IATA.get(upper)!;

  let best: { airport: Airport; length: number } | null = null;
  for (const airport of AIRPORTS) {
    const candidates = [normalize(airport.city), ...airport.aliases.map(normalize)];
    for (const c of candidates) {
      // Coincidencia por palabra completa: evita que "roma" matchee "aroma".
      const re = new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
      if (re.test(t) && (!best || c.length > best.length)) {
        best = { airport, length: c.length };
      }
    }
  }
  return best?.airport ?? null;
}

export const AIRPORT_HINT = AIRPORTS.map((a) => `${a.iata}=${a.city}`).join(', ');
