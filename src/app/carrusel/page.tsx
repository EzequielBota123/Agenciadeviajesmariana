import { CarouselStudio } from '@/components/CarouselStudio';
import { SiteFooter, SiteNav } from '@/components/SiteChrome';

export const metadata = {
  title: 'Carruseles de tips — Agencia de Viajes Mariana',
};

export default function CarruselPage() {
  return (
    <>
      <SiteNav />
      <main className="page-main">
        <div className="wrap wrap-wide">
          <div className="tag">Redes sociales</div>
          <h1 className="page-title">Carruseles de tips</h1>
          <p className="lede">
            Armá una guía de varias láminas (requisitos, consejos, información del destino) lista para subir a Instagram como
            carrusel.
          </p>
          <div style={{ marginTop: 32 }}>
            <CarouselStudio />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
