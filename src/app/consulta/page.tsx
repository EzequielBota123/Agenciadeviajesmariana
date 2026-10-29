import { MessageIntake } from '@/components/MessageIntake';
import { SiteFooter, SiteNav } from '@/components/SiteChrome';
import { agentEngine } from '@/lib/agent/parse';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Leer una consulta — Agencia de Viajes Mariana',
};

export default function ConsultaPage() {
  return (
    <>
      <SiteNav />
      <main className="page-main">
        <div className="wrap">
          <div className="tag">Consultas</div>
          <h1 className="page-title">Leer un mensaje de cliente</h1>
          <p className="lede">
            Pegá el mensaje tal cual llegó por WhatsApp. Se extraen fecha, destino y pasajeros, y se
            abre la consulta lista para cotizar.
          </p>
          <div style={{ marginTop: 32 }}>
            <MessageIntake engine={agentEngine()} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
