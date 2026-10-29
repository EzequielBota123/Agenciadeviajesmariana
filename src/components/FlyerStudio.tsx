'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_FLYER,
  FLYER_FORMATS,
  FLYER_THEMES,
  backgroundPrompt,
  drawFlyer,
  ensureFlyerFonts,
  parseFlyerText,
  type FlyerData,
  type FlyerFormat,
} from '@/lib/flyer';

const SAMPLE = `EXPERIENCIA IGUAZÚ  $ 890.000   06 cuotas sin interés    - salidas de diciembre a Mayo, consultá fechas posibles
El programa incluye:
Vuelos ida y vuelta equipaje carry on
Traslados aeropuerto / hotel / aeropuerto
03 noches de alojamiento con desayuno en base doble
Excursión Cataratas Argentinas + Excursión Cataratas Brasil + Parque de Aves
Traslados a excursiones + guía
No incluye: Entradas a Parques Nacionales`;

const STORAGE_KEY = 'flyer-agency-defaults';

export function FlyerStudio() {
  const [raw, setRaw] = useState('');
  const [data, setData] = useState<FlyerData>(EMPTY_FLYER);
  const [theme, setTheme] = useState('azul');
  const [format, setFormat] = useState<FlyerFormat>('story');
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Agencia y contacto se recuerdan en este dispositivo.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved) setData((d) => ({ ...d, agency: saved.agency ?? d.agency, contact: saved.contact ?? '', footer: saved.footer ?? '' }));
    } catch {
      // sin almacenamiento local: se usan los valores por defecto
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ agency: data.agency, contact: data.contact, footer: data.footer }),
      );
    } catch {
      // ignorar
    }
  }, [data.agency, data.contact, data.footer]);

  const redraw = useCallback(async () => {
    if (!canvasRef.current) return;
    await ensureFlyerFonts();
    if (canvasRef.current) drawFlyer(canvasRef.current, data, theme, format, photo);
  }, [data, theme, format, photo]);

  useEffect(() => {
    void redraw();
  }, [redraw]);

  const set = <K extends keyof FlyerData>(k: K, v: FlyerData[K]) => setData((d) => ({ ...d, [k]: v }));

  const build = () => {
    const parsed = parseFlyerText(raw);
    setData((d) => ({ ...d, ...parsed }));
  };

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto(img);
      setPhotoName(file.name);
    };
    img.src = url;
  };

  const download = async (formats: FlyerFormat[]) => {
    setBusy(true);
    await ensureFlyerFonts();
    const slug =
      data.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'flyer';
    for (const f of formats) {
      const c = document.createElement('canvas');
      drawFlyer(c, data, theme, f, photo);
      const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) continue;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-${FLYER_FORMATS[f].file}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      await new Promise((r) => setTimeout(r, 250));
    }
    setBusy(false);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(backgroundPrompt(data, format));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // portapapeles no disponible
    }
  };

  const { w, h } = FLYER_FORMATS[format];

  return (
    <div className="flyer-layout">
      <div className="flyer-form">
        <div className="flyer-card">
          <h3>1. Pegá el texto del programa</h3>
          <p className="hint">
            Título, precio, cuotas, fechas, “El programa incluye:” y “No incluye:”. Después podés
            corregir cada dato a mano.
          </p>
          <div className="field">
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder={SAMPLE}
              aria-label="Texto del programa"
            />
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={build} disabled={!raw.trim()}>
              Armar flyer
            </button>
            <button className="btn ghost" type="button" onClick={() => setRaw(SAMPLE)}>
              Cargar ejemplo
            </button>
          </div>
        </div>

        <div className="flyer-card">
          <h3>2. Formato y estilo</h3>
          <div className="chips">
            {(Object.keys(FLYER_FORMATS) as FlyerFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${f === format ? 'on' : ''}`}
                onClick={() => setFormat(f)}
              >
                {FLYER_FORMATS[f].label}
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {Object.entries(FLYER_THEMES).map(([k, t]) => (
              <button
                key={k}
                type="button"
                className={`chip ${k === theme ? 'on' : ''}`}
                onClick={() => setTheme(k)}
              >
                <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.bg1}, ${t.accent})` }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flyer-card">
          <h3>3. Foto de fondo</h3>
          <div className="field">
            <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
            <div className="hint">
              {photoName ? `Usando: ${photoName}` : 'Sin foto se usa un fondo de color. Mejor una foto vertical y sin texto.'}
            </div>
          </div>
          <details className="gemini">
            <summary>¿No tenés foto? Generala con Gemini</summary>
            <p className="hint" style={{ marginTop: 8 }}>
              Copiá este pedido, pegalo en Gemini, descargá la imagen y subila arriba. El texto lo
              pone la página, así los precios salen exactos.
            </p>
            <div className="copybox" style={{ maxHeight: 130 }}>
              {backgroundPrompt(data, format)}
            </div>
            <button className="btn ghost" type="button" style={{ marginTop: 10 }} onClick={copyPrompt}>
              {copied ? '¡Copiado!' : 'Copiar pedido para Gemini'}
            </button>
          </details>
        </div>

        <div className="flyer-card">
          <h3>4. Ajustar datos</h3>
          <div className="field-row">
            <div className="field">
              <label htmlFor="f-label">Etiqueta</label>
              <input id="f-label" value={data.label} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-tag">Frase destacada</label>
              <input
                id="f-tag"
                value={data.tagline}
                placeholder="¡En oferta!"
                onChange={(e) => set('tagline', e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-title">Título</label>
            <input id="f-title" value={data.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-dates">Fechas / salida</label>
            <input id="f-dates" value={data.dates} onChange={(e) => set('dates', e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="f-cur">Moneda</label>
              <input id="f-cur" value={data.currency} onChange={(e) => set('currency', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-price">Precio</label>
              <input id="f-price" value={data.price} onChange={(e) => set('price', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-note">Debajo del precio</label>
            <input
              id="f-note"
              value={data.priceNote}
              placeholder="6 cuotas sin interés"
              onChange={(e) => set('priceNote', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-inc">Incluye (uno por línea)</label>
            <textarea
              id="f-inc"
              rows={6}
              value={data.includes.join('\n')}
              onChange={(e) => set('includes', e.target.value.split('\n'))}
            />
          </div>
          <div className="field">
            <label htmlFor="f-exc">No incluye</label>
            <input id="f-exc" value={data.excludes} onChange={(e) => set('excludes', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-route">Recorrido (opcional)</label>
            <input
              id="f-route"
              value={data.route}
              placeholder="Estambul · Capadocia · Pamukkale"
              onChange={(e) => set('route', e.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="f-agency">Agencia</label>
              <input id="f-agency" value={data.agency} onChange={(e) => set('agency', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-contact">Contacto</label>
              <input
                id="f-contact"
                value={data.contact}
                placeholder="WhatsApp 11 0000-0000"
                onChange={(e) => set('contact', e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-legal">Letra chica</label>
            <textarea
              id="f-legal"
              rows={2}
              value={data.footer}
              placeholder="Precio por persona en base doble. Sujeto a disponibilidad."
              onChange={(e) => set('footer', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flyer-preview">
        <div className="flyer-sticky">
          <canvas
            ref={canvasRef}
            className="flyer-canvas"
            style={{ aspectRatio: `${w} / ${h}` }}
            aria-label="Vista previa del flyer"
          />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" type="button" disabled={busy} onClick={() => download([format])}>
              Descargar {FLYER_FORMATS[format].file}
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={busy}
              onClick={() => download(['story', 'post'])}
            >
              Historia + posteo
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Se descarga en PNG de {w}×{h} px, listo para subir a Instagram.
          </p>
        </div>
      </div>
    </div>
  );
}
