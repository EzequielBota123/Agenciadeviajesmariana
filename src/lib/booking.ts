// Deep link al buscador real de la aerolínea, con la ruta ya cargada. La
// compra la termina el cliente ahí mismo, en el sitio oficial — acá no se
// automatiza pago ni emisión, solo se ahorra la búsqueda manual.
//
// Solo devolvemos link para aerolíneas cuyo formato de búsqueda confirmamos
// a mano (hoy, Aerolíneas Argentinas). Para el resto —JetSMART, o cuando la
// tarifa fue simulada— preferimos no mostrar nada antes que adivinar una URL
// que puede no existir o llevar a una página rota.

function legDate(dateStr: string): string {
  return dateStr.replaceAll('-', ''); // YYYY-MM-DD -> YYYYMMDD
}

function toAerolineasCabin(cabin: string | undefined): string {
  return (cabin ?? '').toUpperCase() === 'BUSINESS' ? 'Business' : 'Economy';
}

export interface BookingParams {
  carrier: string | null;
  origin: string;
  destination: string;
  departDate: string | null;
  returnDate?: string | null;
  paxAdults: number;
  paxChildren?: number;
  cabin?: string;
}

export function bookingUrl(p: BookingParams): string | null {
  if (!p.carrier || !p.departDate) return null;

  if (p.carrier === 'Aerolíneas Argentinas') {
    const params = new URLSearchParams({
      adt: String(Math.max(1, p.paxAdults)),
      chd: String(p.paxChildren ?? 0),
      inf: '0',
      flexDates: 'false',
      cabinClass: toAerolineasCabin(p.cabin),
      flightType: p.returnDate ? 'ROUND_TRIP' : 'ONE_WAY',
    });
    params.append('leg', `${p.origin}-${p.destination}-${legDate(p.departDate)}`);
    if (p.returnDate) {
      params.append('leg', `${p.destination}-${p.origin}-${legDate(p.returnDate)}`);
    }
    return `https://www.aerolineas.com.ar/flights-offers?${params.toString()}`;
  }

  return null;
}
