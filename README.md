# SmartRMA AI — monorepo

System obsługi reklamacji (RMA) — backend (NestJS + Prisma + PostgreSQL) i frontend
(React + Vite) w jednym workspace npm. Dokumentacja architektury: [`docs/architecture`](docs/architecture),
dziennik decyzji: [`docs/decisions_archive/DECISIONS.md`](docs/decisions_archive/DECISIONS.md).

## Struktura

```
apps/
  api/    NestJS — patrz apps/api/README.md
  web/    React (Vite) — patrz apps/web/README.md
docs/
  architecture/           model domenowy, workflow, RBAC, zdarzenia, kody błędów
  decisions_archive/      dziennik decyzji architektonicznych
prototype/                statyczny prototyp UX (HTML/CSS/JS) — punkt odniesienia dla apps/web
```

## Start

```bash
git clone <url> smartrma && cd smartrma
npm install              # instaluje oba workspace'y + tworzy .env (root, apps/api,
                          # apps/web) z .env.example — automatycznie, przez postinstall
                          # (scripts/setup-env.js), nic nie trzeba kopiować ręcznie
docker compose up -d     # WYŁĄCZNIE Postgres + Redis (api/web NIE wchodzą w skład
                          # domyślnego `up` — patrz "Pełny Docker Compose" niżej)
npx prisma migrate dev   # tworzy schemat bazy + uruchamia prisma/seed.ts (role/uprawnienia)
npm run seed:admin       # tworzy pierwszą Company + konto Administratora (patrz niżej)
npm run dev              # apps/api (:3000, Swagger /api/docs) + apps/web (:5173) razem
```

Domyślne dane logowania/sekrety JWT z `.env.example` są wyłącznie do lokalnego
dewelopmentu (`changeme-*`) — wystarczą, żeby aplikacja wystartowała bez
żadnej ręcznej konfiguracji; przed jakimkolwiek wdrożeniem poza lokalny
komputer **muszą** zostać zastąpione realnymi sekretami.

Każdy z pięciu powyższych kroków jest idempotentny — ponowne
`npm install`/`docker compose up -d`/`npx prisma migrate dev`/`npm run seed:admin`
po pierwszym uruchomieniu nic nie psuje (bootstrap `.env` nie nadpisuje
istniejących plików, `migrate dev` bez zmian w schemacie po prostu nic nie
robi, `seed:admin` pomija tworzenie, jeśli firma/użytkownik już istnieją).

### Pierwsze logowanie

`prisma/seed.ts` celowo NIE tworzy żadnej firmy ani użytkownika (zasiewa
wyłącznie katalog uprawnień i ról systemowych) — bez osobnego kroku nie ma
jak się zalogować (`POST /companies` nie istnieje, `POST /users` wymaga już
zalogowanego Administratora). `npm run seed:admin` (patrz
[`apps/api/scripts/create-admin.ts`](apps/api/scripts/create-admin.ts))
zamyka tę lukę i tworzy:

- e-mail: `admin@smartrma.local`
- hasło: `ChangeMe123!`

Nadpisywalne przed uruchomieniem zmiennymi `ADMIN_EMAIL` / `ADMIN_PASSWORD` /
`ADMIN_COMPANY_NAME` w `.env`. Zmień hasło po pierwszym logowaniu — to konto
ma pełne uprawnienia Administratora.

## Pełny Docker Compose (opcjonalnie — api/web też w kontenerach)

```bash
docker compose --profile full up -d --build
```

Wymaga ręcznego zastosowania migracji wewnątrz kontenera przed pierwszym
użyciem (`docker compose --profile full exec api npx prisma migrate deploy`)
— w przeciwieństwie do ścieżki lokalnej, obraz `api` nie uruchamia migracji
automatycznie przy starcie.

## Stan projektu

Moduły `Users`, `Companies`, `Customers`, `Products`, `Orders`, `Cases`,
`Documents`, `Notifications` mają pełną implementację produkcyjną (patrz
raporty końcowe poszczególnych zadań). Pozostałe moduły widoczne w
`apps/api/src/modules` (`Logistics`/`Replacement` — brak jako osobne moduły,
`Reports`, `Dashboard`, `Settings`, `Workflow`) pozostają szkieletem bez
logiki biznesowej — `TODO` w kodzie odsyłają do konkretnych pozycji w
dokumentacji architektury.
