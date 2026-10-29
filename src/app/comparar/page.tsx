import { FareChecker } from '@/components/FareChecker';
import { SiteFooter, SiteNav } from '@/components/SiteChrome';
import { activeProviderName } from '@/lib/fares';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Comparar vuelos — Agencia de Viajes Mariana',
};

export default function CompararPage() {
  return (
    <>
      <SiteNav />
      <main className="page-main">
        <div className="wrap">
          <div className="tag">Vuelos</div>
          <h1 className="page-title">Comparar vuelos</h1>
          <p className="lede">
            Elegí ruta, fecha y pasajeros. Se consultan Aerolíneas, JetSMART y Kayak y se guarda el
            resultado, así la próxima vez se ve si el precio subió o bajó (proveedor:{' '}
            <strong>{activeProviderName()}</strong>).
          </p>
          <div style={{ marginTop: 32 }}>
            <FareChecker />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
