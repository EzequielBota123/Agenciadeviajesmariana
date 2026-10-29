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
  type FlyerTemplate,
} from '@/lib/flyer';
import { placeFromTitle, searchPhotos, type PhotoSuggestion } from '@/lib/flyerPhotos';

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
  const [template, setTemplate] = useState<FlyerTemplate>('foto');
  const [logos, setLogos] = useState<HTMLImageElement[]>([]);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [queryEdited, setQueryEdited] = useState(false);
  const [suggestions, setSuggestions] = useState<PhotoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [pickedId, setPickedId] = useState('');
  const [loadingPick, setLoadingPick] = useState(false);
  const [building, setBuilding] = useState(false);
  const [engineNote, setEngineNote] = useState('');
  const [extraQueries, setExtraQueries] = useState<string[]>([]);
  const autoPick = useRef(false);
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
    if (canvasRef.current) drawFlyer(canvasRef.current, data, theme, format, photo, { template, logos });
  }, [data, theme, format, photo, template, logos]);

  useEffect(() => {
    void redraw();
  }, [redraw]);

  // Sugerencia automática: cuando cambia el título se busca el destino (si no editaste la búsqueda a mano).
  useEffect(() => {
    if (queryEdited) return;
    setQuery(placeFromTitle(data.title));
  }, [data.title, queryEdited]);

  const pickRef = useRef<(s: PhotoSuggestion) => void>(() => {});

  const runSearch = useCallback(async (q: string, extra: string[] = []) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const found = await searchPhotos(q, undefined, extra);
      setSuggestions(found);
      if (autoPick.current && found[0]) {
        autoPick.current = false;
        pickRef.current(found[0]);
      }
    } catch (e) {
      setSuggestions([]);
      setSearchError(e instanceof Error ? e.message : 'No se pudo buscar fotos');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (queryEdited) return;
    const q = query;
    const t = setTimeout(() => void runSearch(q), 1100);
    return () => clearTimeout(t);
  }, [query, queryEdited, runSearch]);

  const pick = (s: PhotoSuggestion) => {
    setLoadingPick(true);
    setPickedId(s.id);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setPhoto(img);
      setPhotoName(s.title);
      setData((d) => ({ ...d, photoCredit: s.credit }));
      setLoadingPick(false);
    };
    img.onerror = () => {
      setSearchError('No se pudo cargar esa foto, probá con otra.');
      setPickedId('');
      setLoadingPick(false);
    };
    img.src = s.full;
  };

  pickRef.current = pick;

  const removePhoto = () => {
    setPhoto(null);
    setPhotoName('');
    setPickedId('');
    setData((d) => ({ ...d, photoCredit: '' }));
  };

  const set = <K extends keyof FlyerData>(k: K, v: FlyerData[K]) => setData((d) => ({ ...d, [k]: v }));

  const build = async () => {
    setBuilding(true);
    setEngineNote('');
    let fields: Partial<FlyerData> = {};
    let queries: string[] = [];
    let place = '';
    try {
      const res = await fetch('/api/flyers/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      });
      if (!res.ok) throw new Error('assist');
      const out = (await res.json()) as {
        fields: Partial<FlyerData>;
        photoQueries: string[];
        place: string;
        engine: 'claude' | 'reglas';
        note: string | null;
      };
      fields = out.fields;
      queries = out.photoQueries;
      place = out.place;
      setEngineNote(
        out.engine === 'claude'
          ? 'Interpretado con Claude'
          : out.note ?? 'Interpretado con reglas (sin Claude configurado)',
      );
    } catch {
      fields = parseFlyerText(raw);
      setEngineNote('Interpretado con reglas');
    }
    setData((d) => ({ ...d, ...fields, icons: fields.icons ?? [] }));
    setBuilding(false);
    // Foto: si todavía no hay una elegida, se busca y se usa la mejor sugerencia.
    const q = place || placeFromTitle(fields.title ?? data.title);
    setExtraQueries(queries);
    setQueryEdited(true);
    setQuery(q);
    if (!photo) autoPick.current = true;
    void runSearch(q, queries);
  };

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto(img);
      setPhotoName(file.name);
      setPickedId('');
      setData((d) => ({ ...d, photoCredit: '' }));
    };
    img.src = url;
  };

  const onLogos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .slice(0, 4)
      .forEach((file) => {
        const img = new Image();
        img.onload = () => setLogos((l) => [...l, img].slice(0, 4));
        img.src = URL.createObjectURL(file);
      });
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
      drawFlyer(c, data, theme, f, photo, { template, logos });
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
            <button className="btn" type="button" onClick={() => void build()} disabled={!raw.trim() || building}>
              {building ? 'Armando…' : 'Armar flyer'}
            </button>
            <button className="btn ghost" type="button" onClick={() => setRaw(SAMPLE)}>
              Cargar ejemplo
            </button>
          </div>
          {engineNote && <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>✓ {engineNote}</p>}
        </div>

        <div className="flyer-card">
          <h3>2. Formato y estilo</h3>
          <div className="chips" style={{ marginBottom: 12 }}>
            <button type="button" className={`chip ${template === 'foto' ? 'on' : ''}`} onClick={() => setTemplate('foto')}>
              Foto completa
            </button>
            <button type="button" className={`chip ${template === 'collage' ? 'on' : ''}`} onClick={() => setTemplate('collage')}>
              Collage con mapa
            </button>
          </div>
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
          <p className="hint">
            Te sugerimos fotos del destino según el título. Tocá una para usarla, o subí la tuya.
          </p>
          <div className="photo-search">
            <input
              value={query}
              placeholder="Destino (ej: Cataratas del Iguazú)"
              aria-label="Buscar fotos del destino"
              onChange={(e) => {
                setQuery(e.target.value);
                setQueryEdited(true);
                setExtraQueries([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch(query, extraQueries)}
            />
            <button className="btn ghost" type="button" onClick={() => void runSearch(query, queryEdited && extraQueries.length ? extraQueries : [])} disabled={searching}>
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {searchError && <div className="notice bad" style={{ marginTop: 12, marginBottom: 0 }}>{searchError}</div>}
          {searching && suggestions.length === 0 && <div className="photo-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="photo-thumb skeleton" />)}</div>}
          {suggestions.length > 0 && (
            <div className="photo-grid">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`photo-thumb ${s.id === pickedId ? 'on' : ''}`}
                  onClick={() => pick(s)}
                  title={s.title}
                  disabled={loadingPick}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb} alt={s.title} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {!searching && !searchError && suggestions.length === 0 && query.trim() && (
            <p className="hint" style={{ marginTop: 10 }}>
              Sin resultados. Probá con el nombre del lugar más conocido (ej: “Cataratas”, “Capadocia”).
            </p>
          )}
          {photo && (
            <div className="hint" style={{ marginTop: 12 }}>
              Usando: {photoName}{' '}
              <button type="button" className="linklike" onClick={removePhoto}>
                Quitar foto
              </button>
              {data.photoCredit && <div>El crédito del autor se imprime chico sobre la foto (lo piden las licencias).</div>}
            </div>
          )}
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="f-file">Subir mi propia foto</label>
            <input id="f-file" type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
            <div className="hint">Sin foto se usa un fondo de color. Mejor una foto vertical y sin texto.</div>
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
          <div className="field-row">
            <div className="field">
              <label htmlFor="f-badge">Insignia (opcional)</label>
              <input
                id="f-badge"
                value={data.badge}
                placeholder="15 años"
                onChange={(e) => set('badge', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-logos">Logos (aerolínea, operador)</label>
              <input id="f-logos" type="file" accept="image/*" multiple onChange={(e) => onLogos(e.target.files)} />
              {logos.length > 0 && (
                <div className="hint">
                  {logos.length} logo{logos.length > 1 ? 's' : ''}{' '}
                  <button type="button" className="linklike" onClick={() => setLogos([])}>
                    Quitar
                  </button>{' '}
                  (solo en “Collage con mapa”)
                </div>
              )}
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
