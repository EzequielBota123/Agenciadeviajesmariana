export function Brand() {
  return (
    <a className="brand" href="/">
      Agencia de Viajes <span>Mariana</span>
    </a>
  );
}

export function SiteNav() {
  return (
    <nav>
      <div className="wrap">
        <Brand />
        <div className="navlinks">
          <a href="/explorar">Destinos</a>
          <a href="/comparar">Comparar vuelos</a>
          <a href="/flyers">Flyers</a>
          <a href="/admin" className="cta">
            Panel
          </a>
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <Brand />
        <div>Los precios son informativos y están sujetos a disponibilidad al momento de emitir.</div>
      </div>
    </footer>
  );
}
