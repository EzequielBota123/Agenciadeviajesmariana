export const metadata = {
  title: 'Panel — Agencia de Viajes Mariana',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav>
        <div className="wrap wrap-wide">
          <a className="brand" href="/admin">
            Agencia de Viajes <span>Mariana</span> <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/ panel</span>
          </a>
          <div className="navlinks">
            <a href="/admin">Consultas</a>
            <a href="/admin/paquetes/nuevo">Nuevo paquete</a>
            <a href="/flyers">Flyers</a>
            <a href="/comparar">Comparar vuelos</a>
            <a href="/">Inicio</a>
          </div>
        </div>
      </nav>
      <main className="admin-main">
        <div className="wrap wrap-wide">{children}</div>
      </main>
    </>
  );
}
