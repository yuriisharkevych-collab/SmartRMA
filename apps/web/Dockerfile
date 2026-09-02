# npm workspaces hoist dependencies to the ROOT node_modules — apps/web/node_modules
# is not guaranteed to exist, so this Dockerfile only ever copies the root one.
FROM node:20-alpine AS base
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# --ignore-scripts: pomija root `prepare` (husky wymaga .git, nigdy nie
# kopiowanego do obrazu) i `postinstall` (bootstrap .env — bez sensu w
# kontenerze, który dostaje zmienne środowiskowe wprost z docker-compose.yml).
RUN npm install --workspace apps/web --include-workspace-root --ignore-scripts

# Etap 7 — PRAWDZIWY build produkcyjny (`vite build`), nie `vite dev` jak
# poprzednio. `VITE_API_BASE_URL` jest wypiekany w bundlu W CZASIE BUILDU
# (Vite, nie runtime) — stąd `ARG`/`ENV` w TEJ warstwie, przekazywane przez
# `docker compose build --build-arg` albo `docker build --build-arg`.
FROM base AS build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json ./
COPY apps/web apps/web
RUN npm run build --workspace apps/web

# Serwer statyczny, nie `vite dev` — `vite dev` nigdy nie był projektowany
# do wystawiania w internecie (brak minifikacji/code-splittingu, narzut
# HMR, brak nagłówków cache). `nginx.conf` obok tego pliku dodaje fallback
# SPA (każda nieznaleziona ścieżka → `index.html`, żeby działał
# `react-router` przy odświeżeniu strony na np. `/cases/123`).
FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
