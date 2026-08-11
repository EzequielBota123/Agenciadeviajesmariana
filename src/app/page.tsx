import { FareChecker } from '@/components/FareChecker';
import { MessageIntake } from '@/components/MessageIntake';
import { agentEngine } from '@/lib/agent/parse';
import { activeProviderName } from '@/lib/fares';
import { formatDate } from '@/lib/dates';
import { primaryTotalLabel, secondaryTotalLabel } from '@/lib/money';
import { store, storageMode } from '@/lib/store';
import { BOARD_LABEL, type FareSnapshot, type TravelPackage } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface BoardRow {
  pkg: TravelPackage;
  snapshot: FareSnapshot | null;
}

async function boardRows(): Promise<BoardRow[]> {
  const packages = await store().listPackages({ status: 'publicado' });
  return Promise.all(
    packages.map(async (pkg) => {
      const [snapshot] = await store().listSnapshots({ packageId: pkg.id, limit: 1 });
      return { pkg, snapshot: snapshot ?? null };
    }),
  );
}

function StatusCell({ snapshot }: { snapshot: FareSnapshot | null }) {
  if (!snapshot) return <div className="status same">— sin chequear</div>;
  const d = snapshot.deltaPct;
  if (d === null) return <div className="status same">— primer chequeo</div>;
  if (d > 2) return <div className="status up">▲ subió {d.toFixed(1)}%</div>;
  if (d < -2) return <div className="status down">▼ bajó {Math.abs(d).toFixed(1)}%</div>;
  return <div className="status same">— igual</div>;
}

export default async function HomePage() {
  const rows = await boardRows();
  const engine = agentEngine();
  const provider = activeProviderName();
  const storage = storageMode();

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="brand" href="/">
            TARIFA<span>·</span>VIVA
          </a>
          <div className="navlinks">
            <a href="#problema">El problema</a>
            <a href="#solucion">La solución</a>
            <a href="#demo">Demo</a>
            <a href="/admin" className="cta">
              Panel
            </a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">Monitor de tarifas en vivo</div>
          <h1>
            La tarifa de hoy <em>no es</em> la tarifa de mañana.
          </h1>
          <p className="hero-sub">
            Un sistema para agencias que arman viajes a medida: publicá el paquete, dejá que un
            agente controle la tarifa real del día contra las aerolíneas, y avisale al cliente
            cuándo esa cifra vence.
          </p>
          <div className="hero-actions">
            <a className="btn" href="#demo">
              Probar el agente
            </a>
            <a className="btn ghost" href="/admin">
              Entrar al panel
            </a>
          </div>

          <div className="board">
            <div className="board-scroll">
              <div className="board-head">
                <div>Ruta / paquete</div>
                <div>Pax</div>
                <div>Estado</div>
                <div>Tarifa hoy</div>
                <div>Vigencia</div>
              </div>

              {rows.length === 0 && (
                <div className="empty">
                  Todavía no hay paquetes publicados. Creá uno desde el panel.
                </div>
              )}

              {rows.map(({ pkg, snapshot }) => (
                <div className="board-row" key={pkg.id}>
                  <div className="dest">
                    {pkg.origin} → {pkg.destination} · {BOARD_LABEL[pkg.board]}
                  </div>
                  <div>
                    <span className="flap">{pkg.paxBase}</span>
                  </div>
                  <StatusCell snapshot={snapshot} />
                  <div className="price">
                    {snapshot ? (
                      <>
                        {primaryTotalLabel(snapshot)}
                        {secondaryTotalLabel(snapshot) && (
                          <div style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11.5 }}>
                            {secondaryTotalLabel(snapshot)}
                          </div>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div>{snapshot ? `hoy ${formatDate(snapshot.fetchedAt.slice(0, 10))}` : 'sin datos'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section id="problema">
        <div className="wrap">
          <div className="tag">01 — el problema</div>
          <h2>Cada consulta es un blanco móvil.</h2>
          <p className="lede">
            El cliente no llega con un pedido cerrado. Llega construyéndolo en tiempo real, mientras
            la tarifa que le vas a cotizar sigue viva del otro lado.
          </p>

          <div className="problem-grid">
            <div className="chat">
              <div className="bubble client">
                Hola! quiero viajar a Cancún el <span className="strike">10 de marzo</span>{' '}
                <span className="fix">15 de noviembre</span>
              </div>
              <div className="bubble client">
                Ah y somos <span className="strike">1 persona</span>{' '}
                <span className="fix">2 personas</span>
              </div>
              <div className="bubble client">
                Che, mejor de <span className="strike">tarde</span>{' '}
                <span className="fix">a la mañana</span> el vuelo
              </div>
              <div className="bubble client">¿Sigue el mismo precio que me pasaste ayer?</div>
            </div>

            <div className="diagnosis">
              <div className="diag-item">
                <div className="diag-num">01</div>
                <div>
                  <h4>La cotización cambia sola</h4>
                  <p>
                    Fecha, pasajeros y horario se redefinen a mitad de conversación — no hay una
                    consulta, hay diez. El sistema guarda cada cambio como una revisión, no como un
                    pisotón sobre el dato anterior.
                  </p>
                </div>
              </div>
              <div className="diag-item">
                <div className="diag-num">02</div>
                <div>
                  <h4>La tarifa no es fija</h4>
                  <p>
                    Hoy un vuelo a marzo del año que viene puede figurar en USD 200 con el avión
                    libre. Si alguien compra 50 pasajes, la disponibilidad baja y el precio sube — a
                    veces de un día para el otro.
                  </p>
                </div>
              </div>
              <div className="diag-item">
                <div className="diag-num">03</div>
                <div>
                  <h4>No escala a mano</h4>
                  <p>
                    Un agente no puede reconsultar cada aerolínea por cada cambio de cada cliente,
                    todos los días, para todas las fechas publicadas. Por eso hay un cron que lo hace
                    solo cada mañana.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="solucion">
        <div className="wrap">
          <div className="tag">02 — la solución</div>
          <h2>Publicá el paquete. Que la tarifa se controle sola.</h2>
          <p className="lede">
            En vez de cotizar a demanda, se publica una fecha cerrada — por ejemplo, all inclusive
            para el 15 de noviembre — y un agente automático sostiene esa publicación contra el
            precio real del mercado.
          </p>

          <div className="flow">
            <div className="flow-step">
              <div className="k">PASO 1</div>
              <h4>Publicar el paquete</h4>
              <p>
                Se arma una oferta cerrada — destino, fecha, tipo de plan — y se sube a redes para
                vender de forma masiva, no uno por uno.
              </p>
            </div>
            <div className="flow-step">
              <div className="k">PASO 2</div>
              <h4>Llega la consulta</h4>
              <p>
                El interesado manda la fecha y cuántos viajan, en texto libre. El agente lo
                interpreta aunque cambie tres veces en la misma charla.
              </p>
            </div>
            <div className="flow-step">
              <div className="k">PASO 3</div>
              <h4>El agente verifica en vivo</h4>
              <p>
                Consulta la disponibilidad real de esa fecha contra el proveedor de tarifas y trae la
                cifra vigente del día, con los asientos que quedan.
              </p>
            </div>
            <div className="flow-step">
              <div className="k">PASO 4</div>
              <h4>Responde con vencimiento</h4>
              <p>
                Devuelve el precio aclarando: &quot;esta tarifa es la de hoy, mañana puede
                variar&quot; — sin prometer algo que el mercado puede desmentir.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="demo">
        <div className="wrap">
          <div className="tag">03 — probalo</div>
          <h2>El agente leyendo un mensaje real</h2>
          <p className="lede">
            Escribí como escribe un cliente por WhatsApp. El agente extrae fecha, destino y
            pasajeros, y abre la consulta lista para cotizar.
          </p>
          <MessageIntake engine={engine} />

          <div style={{ marginTop: 64 }}>
            <h2>Consulta de tarifa del día</h2>
            <p className="lede">
              Elegí ruta, fecha y pasajeros. Cada consulta pega contra el proveedor configurado
              (hoy: <strong>{provider}</strong>) y se guarda, así la próxima puede decirte si subió o
              bajó.
            </p>
            <FareChecker />
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="tag">04 — cómo se sostiene</div>
          <h2>Tres piezas, no una promesa.</h2>
          <div className="stack-grid">
            <div className="card">
              <div className="n">01</div>
              <h4>Publicación</h4>
              <p>
                Paquetes cerrados por fecha, listos para pautar en redes, en vez de cotizar cliente
                por cliente desde cero.
              </p>
            </div>
            <div className="card">
              <div className="n">02</div>
              <h4>Agente de tarifa</h4>
              <p>
                Reconoce la fecha y los pasajeros que manda el cliente, y consulta la disponibilidad
                real contra el proveedor de la aerolínea.
              </p>
            </div>
            <div className="card">
              <div className="n">03</div>
              <h4>Aviso de vigencia</h4>
              <p>
                Cada tarifa que se muestra lleva la fecha de consulta y la advertencia de que el
                precio puede moverse al día siguiente.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="brand">
            TARIFA<span>·</span>VIVA
          </div>
          <div>
            almacenamiento: {storage} · tarifas: {provider} · agente: {engine}
          </div>
        </div>
      </footer>
    </>
  );
}
