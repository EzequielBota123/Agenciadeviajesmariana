'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAROUSEL_FORMATS,
  CAROUSEL_PALETTES,
  CAROUSEL_STYLES,
  EMPTY_CAROUSEL,
  carouselCount,
  drawCarouselSlide,
  ensureFlyerFonts,
  parseCarouselText,
  type CarouselData,
  type CarouselFormat,
} from '@/lib/carousel';

const STORAGE_KEY = 'carousel-studio-v1';

const SAMPLE = `Mil tips
Requisitos para ingresar a India
Todo lo que necesitás saber antes de viajar

Visa (E-VISA)
Se tramita **online**.
Solicitala entre **15 y 30 días** antes del viaje.
Validez: **hasta 4 meses** (turismo).
> Sitio oficial: indianvisaonline.gov.in
! ¡NO la dejes para último momento!

E-Arrival Card
Formulario **digital**
Hasta **72 hs** antes del vuelo
**NO** reemplaza la visa

Vacunas & salud
Fiebre Amarilla **OBLIGATORIA**
Aplicada con mínimo **10 días** de anticipación
Certificado **internacional**

Otros requisitos
Pasaporte válido **6 meses** mínimo
Páginas en blanco en el pasaporte
Dirección del **hotel** en India
**Mail** activo

Cierre: ¿+ tips?
¡Dejanos tu comentario o contactanos y te asesoramos!`;

export function CarouselStudio() {
  const [raw, setRaw] = useState(SAMPLE);
  const [style, setStyle] = useState('solido');
  const [palette, setPalette] = useState('naranja');
  const [format, setFormat] = useState<CarouselFormat>('post');
  const [meta, setMeta] = useState({ agency: EMPTY_CAROUSEL.agency, handle: '' });
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [note, setNote] = useState('');
  const [fontsReady, setFontsReady] = useState(false);
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (s) setMeta({ agency: s.agency ?? EMPTY_CAROUSEL.agency, handle: s.handle ?? '' });
    } catch {
      // sin almacenamiento local
    }
    void ensureFlyerFonts().then(() => setFontsReady(true));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // ignorar
    }
  }, [meta]);

  const data: CarouselData = useMemo(() => {
    const p = parseCarouselText(raw);
    return {
      ...EMPTY_CAROUSEL,
      ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
      agency: meta.agency,
      handle: meta.handle,
      slides: p.slides ?? [],
    } as CarouselData;
  }, [raw, meta]);
  const total = carouselCount(data);

  useEffect(() => {
    if (!fontsReady) return;
    for (let i = 0; i < total; i++) {
      const c = canvases.current[i];
      if (c) drawCarouselSlide(c, data, i, style, palette, format);
    }
  }, [data, style, palette, format, total, fontsReady]);

  const build = async () => {
    setBuilding(true);
    setNote('');
    try {
      const res = await fetch('/api/carrusel/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      });
      const j = (await res.json()) as { text?: string; note?: string | null; engine?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Error');
      if (j.engine === 'claude' && j.text) setRaw(j.text);
      setNote(j.note ?? 'Listo. Revisá y editá el texto si hace falta.');
    } catch {
      setNote('No se pudo consultar a Claude; se usa el texto tal cual.');
    }
    setBuilding(false);
  };

  const download = async (only?: number) => {
    setBusy(true);
    await ensureFlyerFonts();
    const slug =
      data.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carrusel';
    const idxs = only === undefined ? Array.from({ length: total }, (_, i) => i) : [only];
    for (const i of idxs) {
      const c = document.createElement('canvas');
      drawCarouselSlide(c, data, i, style, palette, format);
      const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) continue;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-${String(i + 1).padStart(2, '0')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      await new Promise((r) => setTimeout(r, 300));
    }
    setBusy(false);
  };

  const { w, h } = CAROUSEL_FORMATS[format];

  return (
    <div className="flyer-layout">
      <div className="flyer-form">
        <div className="flyer-card">
          <h3>1. Contenido</h3>
          <p className="hint">
            Una línea en blanco separa cada lámina. Primera línea de cada bloque = encabezado; después un punto por línea.
            Usá <b>**negrita**</b> para resaltar, <b>&gt;</b> para el sitio oficial y <b>!</b> para un aviso. La portada va primero
            (palabra grande, título, subtítulo) y el cierre con <b>Cierre:</b>.
          </p>
          <div className="field">
            <textarea rows={16} value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck />
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => void build()} disabled={!raw.trim() || building}>
              {building ? 'Ordenando…' : 'Ordenar con Claude'}
            </button>
            <button className="btn ghost" type="button" onClick={() => setRaw(SAMPLE)}>
              Ver ejemplo
            </button>
          </div>
          {note && <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>✓ {note}</p>}
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            Si pegás notas sueltas, Claude las ordena en láminas usando solo lo que escribiste. Revisá siempre los datos (visas,
            plazos, vacunas) con la fuente oficial antes de publicar.
          </p>
        </div>

        <div className="flyer-card">
          <h3>2. Diseño</h3>
          <div className="chips" style={{ marginBottom: 12 }}>
            {Object.entries(CAROUSEL_STYLES).map(([k, label]) => (
              <button key={k} type="button" className={`chip ${k === style ? 'on' : ''}`} onClick={() => setStyle(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {Object.entries(CAROUSEL_PALETTES).map(([k, p]) => (
              <button key={k} type="button" className={`chip ${k === palette ? 'on' : ''}`} onClick={() => setPalette(k)}>
                <span className="swatch" style={{ background: p.c }} />
                {p.label}
              </button>
            ))}
          </div>
          <div className="chips">
            {(Object.keys(CAROUSEL_FORMATS) as CarouselFormat[]).map((f) => (
              <button key={f} type="button" className={`chip ${f === format ? 'on' : ''}`} onClick={() => setFormat(f)}>
                {CAROUSEL_FORMATS[f].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flyer-card">
          <h3>3. Marca</h3>
          <div className="field-row">
            <div className="field">
              <label>Agencia</label>
              <input value={meta.agency} onChange={(e) => setMeta({ ...meta, agency: e.target.value })} />
            </div>
            <div className="field">
              <label>Usuario de Instagram</label>
              <input placeholder="@tuagencia" value={meta.handle} onChange={(e) => setMeta({ ...meta, handle: e.target.value })} />
            </div>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>Se recuerdan en este dispositivo.</p>
        </div>
      </div>

      <div className="flyer-preview">
        <div className="flyer-sticky">
          <div className="carousel-strip">
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} className="carousel-item">
                <canvas
                  ref={(el) => {
                    canvases.current[i] = el;
                  }}
                  className="flyer-canvas"
                  style={{ aspectRatio: `${w} / ${h}` }}
                  aria-label={`Lámina ${i + 1}`}
                />
                <button className="linklike" type="button" disabled={busy} onClick={() => void download(i)}>
                  Descargar {i + 1}
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" type="button" disabled={busy} onClick={() => void download()}>
              {busy ? 'Descargando…' : `Descargar las ${total} láminas`}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            PNG de {w}×{h} px. En Instagram, subilas en orden como carrusel.
          </p>
        </div>
      </div>
    </div>
  );
}
