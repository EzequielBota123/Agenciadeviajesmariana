# TARIFA·VIVA

Backend + frontend para una agencia de viajes, sobre Next.js y desplegable en Vercel.

Resuelve dos problemas concretos:

1. **La cotización es un blanco móvil.** El cliente no llega con un pedido cerrado: cambia la
   fecha, después los pasajeros, después el horario. Cada cambio entra como una **revisión** sobre
   la misma consulta y queda en un log append-only, en vez de pisar el dato anterior.
2. **La tarifa no es fija.** Un vuelo que hoy figura en USD 200 con el avión libre puede valer
   mucho más mañana si alguien compró medio avión. Toda tarifa que sale del sistema lleva **fecha
   de consulta y aviso de vigencia**, y un cron diario revisa los paquetes publicados para avisar
   cuando el precio de la pieza que está pauteada en redes dejó de cerrar.

---

## Arrancar

```bash
npm install
npm run dev       # http://localhost:3000
```

**No hace falta configurar nada para probarlo.** Sin variables de entorno la app corre con store en
memoria, tarifas simuladas y el parser de mensajes por reglas. Trae paquetes y una consulta de
ejemplo cargados.

Para producción, copiá `.env.example` a `.env.local` y completá lo que necesites.

---

## Las tres piezas

### 1. Publicación de paquetes

Una fecha cerrada — destino, salida, régimen, precio publicado — que se pauta en redes y se vende
de forma masiva, en vez de cotizar cliente por cliente desde cero.

`/admin/paquetes/nuevo` · `POST /api/packages`

### 2. Agente de consulta

Recibe el mensaje del cliente en texto libre y extrae fecha, destino, pasajeros y franja horaria.
Con `ANTHROPIC_API_KEY` usa **Claude Opus 5** con salida estructurada (JSON Schema); sin la clave,
cae a un parser por reglas que cubre las formas en que se escribe una fecha por WhatsApp en
Argentina ("15 de noviembre", "15/11", "somos 3", "con mi señora", "a la mañana").

El agente no solo extrae: **compara contra el estado anterior de la consulta y describe qué
cambió**. Si el cliente dice "mejor el 22", el sistema corre el viaje entero manteniendo las
noches, en vez de dejar la vuelta clavada donde estaba.

`POST /api/quotes` (alta) · `POST /api/quotes/:id/revise` (cambio de pedido)

### 3. Verificación de tarifa con vencimiento

Consulta la disponibilidad real del día, guarda un snapshot, calcula el movimiento contra el
chequeo anterior de la misma ruta/fecha/pax, y redacta el mensaje para el cliente con la fecha de
consulta y el aviso de que mañana puede variar.

`POST /api/quotes/:id/refresh` · `POST /api/fares/check` · `GET /api/cron/refresh-fares`

---

## De dónde salen las tarifas

`FARE_PROVIDER` elige el proveedor. Los tres implementan la misma interfaz
(`src/lib/fares/types.ts`), así que cambiar de uno a otro no toca el resto de la app.

| Valor | Qué hace | Cuándo usarlo |
|---|---|---|
| `mock` *(default)* | Simulador determinístico por día: la misma consulta el mismo día da el mismo precio, y al día siguiente cambia. Modela ocupación, urgencia por cercanía de la fecha y shocks de demanda. | Demo y desarrollo. Es a propósito determinístico: si fuera random por request, el "subió/bajó" sería ruido y no se podría demostrar la premisa del producto. |
| `amadeus` | Amadeus Self-Service (Flight Offers Search). **El portal self-service de Amadeus se dio de baja en julio 2026** — hoy solo queda su vía "Enterprise", con proceso de ventas. Este proveedor sigue en el código por si en algún momento se consigue acceso. | No disponible por ahora. |
| `http` | Delega a un worker propio vía POST JSON. Es el que usa `worker/` (scraping de Aerolíneas Argentinas — ver abajo). | Cuando tenés un worker propio corriendo (scraping, GDS con sesión persistente, o la API de Despegar el día que la consigas). |

### El worker de Aerolíneas Argentinas (`worker/`)

Es un scraper real, con navegador headless (Playwright), que consulta
`aerolineas.com.ar` como lo haría una persona — hace falta así porque la
búsqueda del sitio exige un token que se genera pasando reCAPTCHA en el
navegador, no se puede pedir con un simple `fetch`. Ya está probado contra el
sitio real y trae precios, asientos y horarios genuinos.

**No corre en Vercel** — necesita un proceso persistente (Railway, Render,
Fly.io, un VPS, o tu propia máquina mientras probás). Instrucciones completas,
riesgos (es scraping, no una API oficial: depende de que el sitio no cambie de
diseño) y cómo conectarlo: **`worker/README.md`**.

Los precios de cabotaje vienen en **pesos argentinos** — el worker los
convierte a un USD aproximado con la cotización oficial de
[DolarAPI](https://dolarapi.com), y la app muestra las dos cifras siempre que
la moneda nativa no sea dólares (`ARS 215.054 · ≈ USD 141,48`).

**Sobre scrapear la web de la aerolínea directamente:** lo pediste así y se puede hacer, pero no
desde acá, por tres razones concretas. Va contra los términos de uso de las aerolíneas; las
funciones serverless de Vercel no sostienen un navegador headless con los tiempos y la memoria que
hace falta; y la web cambia sin aviso y te deja sin cotizaciones un lunes a la mañana. Por eso el
camino recomendado es Amadeus, y el proveedor `http` queda como el enganche para que corras el
scraper vos mismo en un worker aparte (Railway, Fly, un VPS) sin tocar nada de esta app. El
contrato mínimo que tu worker tiene que devolver está documentado en `src/lib/fares/http.ts`.

**Si el proveedor real falla**, la app cae al simulador y lo dice — en el panel, en la API y en la
página del cliente. Es preferible una cifra marcada como simulada a un 500 que deja al agente sin
nada que responder.

---

## Desplegar en Vercel

1. **Subir el repo** e importarlo en Vercel. Detecta Next.js solo.
2. **Base de datos.** Storage → Create → Postgres (Neon). Vercel inyecta `DATABASE_URL`.
   Después, con esa variable en `.env.local`, aplicá el esquema: `npm run db:setup`.
   Sin `DATABASE_URL` la app funciona pero **todo vive en memoria y se pierde entre requests**.
3. **Variables de entorno** (Project Settings → Environment Variables):

   | Variable | Obligatoria | Para qué |
   |---|---|---|
   | `DATABASE_URL` | sí en prod | Persistencia |
   | `ADMIN_TOKEN` | sí en prod | Protege `/admin` y las rutas de escritura. Sin esto el panel queda **abierto**. |
   | `CRON_SECRET` | recomendada | Vercel la manda como `Authorization: Bearer` al cron |
   | `ANTHROPIC_API_KEY` | opcional | Activa el agente de lenguaje natural |
   | `FARE_PROVIDER` + credenciales | opcional | Tarifas reales |

4. **El cron ya está declarado** en `vercel.json`: `/api/cron/refresh-fares` todos los días a las
   09:00 UTC (06:00 en Argentina). Se activa solo al desplegar.

---

## API

Las rutas de escritura y el listado de consultas piden `Authorization: Bearer $ADMIN_TOKEN`
(o la cookie del panel). El alta de consultas y el listado de paquetes publicados son públicos,
porque son los que consume el formulario de la web.

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| `GET` | `/api/packages?status=publicado` | pública | Paquetes publicados |
| `GET` | `/api/packages` | token | Todos, incluidos borradores |
| `POST` | `/api/packages` | token | Crea un paquete |
| `PATCH` | `/api/packages/:id` | token | Edita |
| `POST` | `/api/packages/:id` | token | Fuerza un chequeo de tarifa |
| `POST` | `/api/quotes` | **pública** | Alta de consulta desde texto libre y/o parámetros |
| `GET` | `/api/quotes` | token | Listado |
| `GET` | `/api/quotes/:id` | token | Consulta + timeline + historial de tarifas |
| `PATCH` | `/api/quotes/:id` | token | Cambia estado / datos del cliente |
| `POST` | `/api/quotes/:id/revise` | token | Aplica un mensaje nuevo del cliente |
| `POST` | `/api/quotes/:id/refresh` | token | Cotiza y redacta el mensaje |
| `POST` | `/api/fares/check` | pública | Consulta suelta de tarifa |
| `GET` | `/api/cron/refresh-fares` | `CRON_SECRET` | Chequeo diario de publicados |

`POST /api/quotes` es el endpoint que hay que colgar de un webhook de WhatsApp o Instagram:

```bash
curl -X POST https://tu-app.vercel.app/api/quotes \
  -H 'content-type: application/json' \
  -d '{"message":"Hola! quiero ir a Cancún el 15 de noviembre, somos 2","channel":"whatsapp"}'
```

Devuelve la consulta con los parámetros ya interpretados y el link público para el cliente.

---

## Pantallas

| Ruta | Para quién |
|---|---|
| `/` | Landing con el tablero de paquetes en vivo y dos demos funcionales |
| `/admin` | Panel: paquetes con su movimiento de tarifa, consultas con su cantidad de cambios, alertas |
| `/admin/cotizaciones/:id` | Espacio de trabajo: pedido actual, timeline completo, cómo se movió la tarifa, y los botones para cotizar y aplicar cambios |
| `/q/:token` | Link para el cliente: la tarifa con cuenta regresiva de vigencia. `noindex`. |

---

## Estructura

```
src/
  app/
    page.tsx                        landing
    admin/                          panel
    q/[token]/                      cotización pública
    api/                            endpoints
  components/                       piezas de UI cliente
  lib/
    types.ts                        modelo de dominio
    dates.ts                        vigencia en hora argentina (UTC-3)
    store.ts                        repositorio (Postgres | memoria)
    quoting.ts                      cotizar y persistir snapshots
    fares/                          proveedores de tarifa
    agent/
      parse.ts                      extracción con Claude + merge de revisiones
      rules.ts                      parser por reglas (fallback)
      airports.ts                   destinos que vende la agencia
      reply.ts                      redacción del mensaje al cliente
db/schema.sql                       esquema Postgres
```

Una decisión que vale la pena señalar: **la vigencia se calcula siempre en hora argentina**, no en
UTC. "Esta tarifa es la de hoy" significa hasta las 23:59 de hoy en Buenos Aires. Si se midiera en
UTC, la tarifa vencería a las 21:00 hora local y el cliente vería un número vencido en horario
comercial.

---

## Limitaciones conocidas

- **`POST /api/quotes` es público y no tiene rate limiting.** Es lo correcto para que el formulario
  de la web y un webhook funcionen sin credenciales, pero antes de exponerlo con tráfico real
  conviene poner un límite por IP (Vercel Firewall o Upstash Ratelimit).
- **El simulador no son tarifas reales.** Todo lo que muestra el sistema en modo `mock` está
  marcado como simulado. No lo mandes a un cliente.
- **El cron corre una vez por día.** Si una ruta se mueve varias veces en el día, el panel muestra
  el último chequeo, no el máximo. Para más frecuencia hay que agregar entradas en `vercel.json`
  (el plan Hobby de Vercel permite un cron diario).
