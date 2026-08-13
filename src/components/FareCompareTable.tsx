'use client';

import { useState } from 'react';
import { bookingUrl } from '@/lib/booking';
import { formatArs, formatUsd } from '@/lib/money';

export interface FareCompareRow {
  key: string;
  provider: string;
  carrier: string | null;
  nativeCurrency: 'USD' | 'ARS';
  totalNative: number;
  totalUsd: number;
  pricePerPaxNative: number;
  pricePerPaxUsd: number;
  seatsLeft: number | null;
  outboundDeparture?: string | null;
  raw?: unknown;
}

function stopsLabel(stops: number | undefined): string {
  if (stops === undefined) return 's/d';
  return stops === 0 ? 'directo' : `${stops} escala${stops > 1 ? 's' : ''}`;
}

/** Tabla comparativa reutilizable: home, detalle de cotización admin y página pública del cliente. */
export function FareCompareTable({
  rows,
  origin,
  destination,
  departDate,
  returnDate,
  pax,
  showToolbar = true,
}: {
  rows: FareCompareRow[];
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  pax: number;
  showToolbar?: boolean;
}) {
  const [sortBy, setSortBy] = useState<'price' | 'stops'>('price');
  const [directOnly, setDirectOnly] = useState(false);
  const [carrierFilter, setCarrierFilter] = useState('all');

  if (rows.length === 0) return <p className="fare-sub">Ninguna aerolínea devolvió tarifa para esta búsqueda.</p>;

  const rankedByPrice = [...rows].sort((a, b) => a.totalUsd - b.totalUsd);
  const cheapestKey = rankedByPrice[0].key;
  const carrierOptions = [...new Set(rows.map((r) => r.carrier ?? r.provider))].sort((a, b) => a.localeCompare(b, 'es'));

  const rawStops = (r: FareCompareRow): number | undefined =>
    r.raw && typeof r.raw === 'object' ? (r.raw as { stops?: number }).stops : undefined;

  const filtered = rankedByPrice.filter((r) => {
    if (directOnly && (rawStops(r) ?? 1) !== 0) return false;
    if (carrierFilter !== 'all' && (r.carrier ?? r.provider) !== carrierFilter) return false;
    return true;
  });

  const shown = sortBy === 'stops' ? [...filtered].sort((a, b) => (rawStops(a) ?? 99) - (rawStops(b) ?? 99)) : filtered;

  return (
    <>
      {showToolbar && (
        <div className="compare-toolbar">
          <label>
            Ordenar por
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'price' | 'stops')}>
              <option value="price">Precio</option>
              <option value="stops">Escalas</option>
            </select>
          </label>
          <label>
            Aerolínea
            <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}>
              <option value="all">Todas</option>
              {carrierOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            Solo vuelos directos
            <input type="checkbox" checked={directOnly} onChange={(e) => setDirectOnly(e.target.checked)} />
          </label>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="fare-sub">Ningún resultado coincide con ese filtro.</p>
      ) : (
        <div className="table-wrap compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Aerolínea</th>
                <th>Total ARS</th>
                <th>≈ Total USD</th>
                <th>Por pasajero</th>
                <th>Escalas</th>
                <th>Asientos</th>
                <th>Salida</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const viaKayak = r.provider === 'kayak';
                const rawInfo =
                  r.raw && typeof r.raw === 'object' ? (r.raw as { kayakBookingUrl?: string | null; stops?: number }) : null;
                const link =
                  (viaKayak ? (rawInfo?.kayakBookingUrl ?? null) : null) ??
                  bookingUrl({ carrier: r.carrier, origin, destination, departDate, returnDate, paxAdults: pax });
                return (
                  <tr key={r.key}>
                    <td data-label="Aerolínea">
                      {r.carrier ?? r.provider}
                      {r.key === cheapestKey && (
                        <span className="pill ok" style={{ marginLeft: 8 }}>
                          más barata
                        </span>
                      )}
                      {viaKayak && (
                        <span
                          className="pill"
                          style={{ marginLeft: 8 }}
                          title="Precio de un revendedor visto en Kayak, no el precio directo de la aerolínea"
                        >
                          vía Kayak
                        </span>
                      )}
                    </td>
                    <td className="mono" data-label="Total ARS">
                      {r.nativeCurrency === 'ARS' ? `ARS ${formatArs(r.totalNative)}` : '—'}
                    </td>
                    <td className="mono" data-label="≈ Total USD">
                      USD {formatUsd(r.totalUsd)}
                    </td>
                    <td className="mono" data-label="Por pasajero">
                      {r.nativeCurrency === 'ARS' ? `ARS ${formatArs(r.pricePerPaxNative)}` : `USD ${formatUsd(r.pricePerPaxUsd)}`}
                    </td>
                    <td data-label="Escalas">{stopsLabel(rawInfo?.stops)}</td>
                    <td data-label="Asientos">{r.seatsLeft ?? 's/d'}</td>
                    <td className="mono" data-label="Salida">
                      {r.outboundDeparture
                        ? new Date(r.outboundDeparture.replace(' ', 'T')).toLocaleString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 's/d'}
                    </td>
                    <td>
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="pill">
                          {viaKayak ? 'ver oferta →' : 'reservar →'}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.some((r) => r.provider === 'kayak') && (
        <p className="fare-sub" style={{ marginTop: 12 }}>
          Las filas marcadas <strong>&quot;vía Kayak&quot;</strong> son de un metabuscador: suman aerolíneas que no
          cotizamos directo (LATAM, Avianca, Copa...), pero el precio suele ser de un revendedor (Kiwi, Decolar,
          CTrip...), no la tarifa oficial de la aerolínea.
        </p>
      )}
    </>
  );
}
