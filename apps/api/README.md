# apps/api — SmartRMA backend (NestJS + Prisma)

Struktura zgodna z `docs/architecture/*.md`. Moduły `Users`/`Companies`/`Customers`/
`Products`/`Orders`/`Cases`/`Documents`/`Notifications` mają pełną implementację
produkcyjną (raporty końcowe poszczególnych zadań) — pozostałe pozostają szkieletem,
patrz `TODO` w kodzie.

## Start

Uruchamiane zwykle z korzenia monorepo (`../../README.md`) — sekcja poniżej to
odpowiednik dla pracy WYŁĄCZNIE w tym katalogu (np. bez frontendu):

```bash
cd ../..                 # do korzenia repo — postinstall tworzy .env tutaj i w apps/api
npm install
docker compose up -d     # Postgres + Redis
cd apps/api
npx prisma migrate dev   # tworzy bazę + uruchamia prisma/seed.ts (role/uprawnienia)
npm run start:dev
```

`.env` w tym katalogu (`apps/api/.env`) jest tworzony automatycznie przez
`postinstall` przy `npm install` uruchomionym z korzenia repo (`scripts/setup-env.js`)
— nie trzeba go kopiować ręcznie.

Swagger: `http://localhost:3000/api/docs`. Health check: `http://localhost:3000/health`.

## Struktura

```
src/
  main.ts, app.module.ts       — bootstrap, globalny pipe/filter/guard
  config/                      — ConfigModule + walidacja env (Joi)
  common/                      — filtr wyjątków, katalog ERROR_CODES.md, dekoratory, interfejsy
  logger/                      — nestjs-pino
  redis/                       — klient ioredis (pod rate-limit Portalu Klienta, kolejkę powiadomień)
  prisma/                      — PrismaService (prisma/schema.prisma → apps/api/prisma/)
  events/                      — Event Bus (IEventBus, DomainEvent, kontrakty z EVENTS.md §5)
  rbac/                        — uprawnienia/role z RBAC.md, PermissionsGuard, AuthorizationService
  modules/                     — 17 modułów domenowych (patrz raport końcowy)
```

## Znane braki

`Logistics`/`Replacement` (moduł `Cases`), `Reports`, `Dashboard`, `Settings`,
`Workflow` pozostają szkieletem bez logiki biznesowej — `TODO` w kodzie
odsyłają do konkretnych pozycji dokumentacji architektury wymagających decyzji
przed implementacją. Pełna lista znanych, świadomie odłożonych luk (np.
brakujący szablon `case.owner_changed` w `NOTIFICATIONS.md` §3, brak
egzekwowania FILE-00x przy uploadzie dokumentów) jest w raportach końcowych
poszczególnych zadań, nie duplikowana tutaj (żeby nie rozjeżdżać się z kodem
przy kolejnych zmianach).
