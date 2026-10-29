import { FlyerStudio } from '@/components/FlyerStudio';
import { SiteFooter, SiteNav } from '@/components/SiteChrome';

export const metadata = {
  title: 'Generador de flyers — Agencia de Viajes Mariana',
};

export default function FlyersPage() {
  return (
    <>
      <SiteNav />
      <main className="page-main">
        <div className="wrap wrap-wide">
          <div className="tag">Redes sociales</div>
          <h1 className="page-title">Generador de flyers</h1>
          <p className="lede">
            Pegá el texto del programa y descargá el flyer para historias y posteos de Instagram.
            Precios y fechas se escriben tal cual los cargues, sin errores de ortografía.
          </p>
          <div style={{ marginTop: 32 }}>
            <FlyerStudio />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
