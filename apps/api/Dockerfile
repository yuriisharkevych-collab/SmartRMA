# npm workspaces hoist dependencies to the ROOT node_modules — apps/api/node_modules
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
#
# Etap 8 — WYKRYTE dopiero przy faktycznym uruchomieniu kontenera: `--ignore-scripts`
# nie omija selektywnie tylko root/husky — wyłącza RÓWNIEŻ skrypt `install`
# WEWNĄTRZ pakietu `bcrypt`, który normalnie kompiluje/pobiera natywny plik
# `.node` dla TEGO konkretnego środowiska (Alpine/musl). Bez niego proces
# startował, ale każde logowanie/hashowanie hasła kończyło się `MODULE_NOT_FOUND`
# (`bcrypt_lib.node` nie istniał) — cichy, w pełni zielony `npm install`, awaria
# dopiero przy pierwszym realnym żądaniu. `npm rebuild` PO instalacji buduje
# natywny moduł bezpośrednio w tym samym obrazie Alpine, w którym potem
# faktycznie działa (nie na hoście dewelopera — inna libc dałaby ten sam błąd).
# `python3 make g++` usuwane od razu potem — potrzebne WYŁĄCZNIE do kompilacji,
# nie do uruchomienia; ta warstwa i tak nigdy nie trafia do `runtime` (kopiowany
# jest tylko `node_modules`, patrz stage `runtime` niżej).
RUN npm install --workspace apps/api --include-workspace-root --ignore-scripts \
 && apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm rebuild bcrypt --build-from-source \
 && apk del .build-deps

FROM base AS build
# Etap 8 — potrzebne, żeby `prisma generate` w ogóle WYKRYŁO obecność i wersję
# OpenSSL w tym obrazie (bez tego pakietu Prisma milczy i zgaduje "1.1.x",
# patrz `binaryTargets` w schema.prisma i doc-comment przy `openssl` niżej).
RUN apk add --no-cache openssl
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json ./
COPY apps/api apps/api
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace apps/api

FROM base AS runtime
ENV NODE_ENV=production
# Etap 8 — WYKRYTE dopiero przy faktycznym uruchomieniu kontenera: silnik
# zapytań Prisma (`libquery_engine-*.so.node`) ładuje `libssl` DYNAMICZNIE w
# czasie działania, nie tylko w czasie builda — sam `binaryTargets` w
# schema.prisma (dobiera WŁAŚCIWY plik silnika) nie wystarczy, jeśli w tym
# obrazie faktycznie nie ma zainstalowanej biblioteki, którą ten plik ładuje.
RUN apk add --no-cache openssl
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
# Etap 9 — `prisma/seed.ts` biegnie przez `ts-node` (patrz `package.json` ->
# `prisma.seed`), więc potrzebuje PRAWDZIWEGO źródła TS pod importami, które
# ma zapisane dosłownie (`../src/rbac/constants/...`) — skompilowany
# odpowiednik w `dist/` tu nie pomaga, `ts-node` nie wie o jego istnieniu.
# `src/` całościowo świadomie NIE trafia do runtime (aplikacja startuje z
# `dist/`, nie z TS) — kopiujemy WYŁĄCZNIE ten jeden katalog, od którego
# `seed.ts` faktycznie zależy (zweryfikowane: oba pliki są samodzielne, bez
# dalszych importów z reszty `src/`), żeby nie rozdymać obrazu produkcyjnego.
COPY --from=build /workspace/apps/api/src/rbac/constants ./apps/api/src/rbac/constants
# Etap 9 (c.d.) — bez `apps/api/tsconfig.json` w obrazie `ts-node` nie ma skąd
# wziąć `module: commonjs`, więc kompiluje/ładuje `seed.ts` w złym formacie
# (ESM) — dwa różne objawy tego samego braku, zweryfikowane empirycznie:
# `ERR_UNKNOWN_FILE_EXTENSION` (natywny loader Node) albo, po wymuszeniu
# starszej detekcji, `Cannot use import statement outside a module` (hak
# ts-node owszem się odpala, ale kompiluje bez znajomości `module: commonjs`).
# Wstrzyknięcie samej treści tego pliku do testowego kontenera (bez zmiany
# repo) usunęło oba objawy naraz — jedyna brakująca zależność.
COPY --from=build /workspace/apps/api/tsconfig.json ./apps/api/tsconfig.json
# Etap 8 (audyt bezpieczeństwa) — proces działał jako root wewnątrz kontenera
# (obraz `node:20-alpine` startuje jako root, jeśli nikt tego nie zmieni).
# `node` to wbudowany, niskouprawniony użytkownik w oficjalnym obrazie —
# `chown` na katalogach zapisywalnych w runtime (`uploads_data` montowany
# jako wolumen root:root domyślnie, musi należeć do `node`, żeby zapis
# działał PO przełączeniu użytkownika).
RUN mkdir -p /data/uploads && chown -R node:node /data /workspace
USER node
EXPOSE 3000
# Etap 8 — WYKRYTE dopiero przy faktycznym uruchomieniu kontenera (nie przy
# samym `nest build`, który kończy się sukcesem niezależnie): `nest-cli.json`
# nie ma płaskiego `sourceRoot`/`outDir`, więc kompilator zachowuje strukturę
# `src/` pod `dist/` — prawdziwa ścieżka to `dist/src/main.js`, NIE `dist/main.js`.
# Poprzednia wersja tej linii (`dist/main.js`) powodowała `MODULE_NOT_FOUND`
# i nieskończoną pętlę restartów kontenera — obraz budował się bez błędu,
# testy jednostkowe/e2e (uruchamiane przez `ts-node`/Jest, nie przez ten
# obraz) nigdy tej ścieżki nie sprawdzały.
CMD ["node", "apps/api/dist/src/main.js"]
