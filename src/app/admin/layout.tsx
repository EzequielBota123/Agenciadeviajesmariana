export const metadata = {
  title: 'Panel — Tarifa Viva',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav>
        <div className="wrap wrap-wide">
          <a className="brand" href="/admin">
            TARIFA<span>·</span>VIVA <span style={{ color: 'var(--muted)' }}>/ panel</span>
          </a>
          <div className="navlinks">
            <a href="/admin">Consultas</a>
            <a href="/admin/paquetes/nuevo">Nuevo paquete</a>
            <a href="/">Sitio público</a>
          </div>
        </div>
      </nav>
      <main className="admin-main">
        <div className="wrap wrap-wide">{children}</div>
      </main>
    </>
  );
}
