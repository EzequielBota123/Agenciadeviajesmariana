# Imagen oficial de Playwright: trae Chromium y todas las librerías de
# sistema que necesita ya instaladas. La versión del tag tiene que coincidir
# con la de "playwright" en package.json, si no el navegador que trae la
# imagen no matchea con el que el paquete de Node espera encontrar.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json ./
# --ignore-scripts: el postinstall corre "playwright install", pero el
# navegador ya viene en esta imagen — instalarlo de nuevo es tiempo y
# espacio de más.
RUN npm install --omit=dev --ignore-scripts

COPY . .

# Render inyecta su propio PORT; server.mjs ya lo respeta (process.env.PORT).
EXPOSE 8787

CMD ["node", "server.mjs"]
