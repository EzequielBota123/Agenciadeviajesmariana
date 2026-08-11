# Worker de tarifas — Aerolíneas Argentinas (scraping)

Consulta precios reales de `aerolineas.com.ar` con un navegador headless real
(Playwright), porque la búsqueda de vuelos del sitio exige un token que se
genera pasando reCAPTCHA en el navegador — no se puede imitar con un simple
`fetch`.

## Por qué es un proyecto aparte

No corre en Vercel. Un navegador headless no entra en los límites de tiempo y
memoria de una función serverless. Este worker necesita un **proceso
persistente** — tu propia máquina mientras probás, o un host tipo Railway,
Render, Fly.io, o un VPS cuando quieras que ande todo el tiempo.

## Riesgos, para que los tengas presentes

- **Es scraping, no una API oficial.** Depende de que Aerolíneas Argentinas no
  cambie el diseño de su sitio. Cuando lo cambien (pasa sin aviso), esto se
  rompe y hay que actualizar los selectores en `scraper.mjs`.
- **Zona gris de términos de uso.** La mayoría de los sitios no permiten
  scraping en sus términos. Para probar/demo no pasa nada; para un negocio
  real que ya facture, conviene una fuente de datos oficial (ver
  `../README.md` sobre Despegar).
- **Nunca rompe la app principal.** Si este worker falla o no está corriendo,
  `FARE_PROVIDER=http` en la app cae automáticamente al simulador y lo marca
  como tal — la cotización nunca se cae por esto.

## Arrancarlo en local

```bash
cd worker
npm install   # instala Playwright + Chromium (pesa ~300MB, tarda un rato)
npm start
```

Por default escucha en `http://localhost:8787`, sin token (abierto — solo
para desarrollo). Para requerir autenticación:

```bash
FARE_WORKER_TOKEN=un-secreto-largo npm start
```

## Conectarlo a la app

En la app principal (`.env.local` o variables de Vercel):

```
FARE_PROVIDER=http
FARE_WORKER_URL=http://localhost:8787
FARE_WORKER_TOKEN=un-secreto-largo   # el mismo que usaste acá arriba
```

## Qué cubre y qué no

- Solo **Aerolíneas Argentinas**, solo las rutas que ellos operan (dentro de
  Argentina y algunos destinos internacionales). Si pedís una ruta que no
  vuelan, la búsqueda falla — y la app cae al simulador con el motivo
  explicado.
- Ida y vuelta se resuelve como **dos búsquedas de un tramo** (ida + vuelta
  por separado, sumadas). Es una simplificación: puede no coincidir centavo a
  centavo con una tarifa combinada "ida y vuelta" que el sitio arme con un
  descuento especial, pero da un número real y confiable.
- Vuelos de cabotaje vienen en **pesos argentinos**; el worker los convierte
  a USD con la cotización oficial de [DolarAPI](https://dolarapi.com) y manda
  las dos cifras.

## Probar que funciona

```bash
curl -X POST http://localhost:8787/ \
  -H 'content-type: application/json' \
  -d '{"origin":"EZE","destination":"BRC","departDate":"2026-11-15","returnDate":"2026-11-22","pax":2,"cabin":"ECONOMY"}'
```
