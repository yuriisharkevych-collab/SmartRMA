# Wdrożenie produkcyjne — runbook

Powstało w Etapie 7 (audyt gotowości produkcyjnej) — wcześniej nie istniał
żaden spisany procedura deployu/aktualizacji/rollbacku, tylko
`docker-compose.yml` deweloperski. Ten dokument opisuje **jak faktycznie
wdrożyć SmartRMA na prawdziwym VPS**, krok po kroku, i co zrobić, gdy coś
pójdzie źle.

Zakłada: świeży VPS (Ubuntu 22.04+ albo podobny) z zainstalowanym Dockerem i
Docker Compose v2, oraz domenę, której rekord A/AAAA już wskazuje na IP tego
serwera.

---

## 1. Pierwsze wdrożenie

```bash
git clone <repo> smartrma && cd smartrma

cp .env.prod.example .env.prod
node scripts/generate-prod-secrets.js --write .env.prod
# Ręcznie uzupełnij w .env.prod: DOMAIN, CORS_ORIGIN, VITE_API_BASE_URL,
# POSTGRES_USER, POSTGRES_DB (generator ich świadomie nie tworzy — to Twój wybór, nie sekret).

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Po starcie kontenerów baza jest pusta — schemat trzeba nałożyć migracjami
(patrz sekcja 3), a potem założyć pierwszą organizację. **Od Etapu 6 nie
potrzeba już do tego dostępu do serwera** — wystarczy otworzyć
`https://twoja-domena.pl/signup` w przeglądarce.

Sprawdź, że wszystko wstało:
```bash
curl -s https://twoja-domena.pl/health
# {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}, ...}
```

## 2. Weryfikacja przed przekazaniem pierwszemu klientowi

- [ ] `GET /health` zwraca `status: ok`.
- [ ] `/api/docs` (Swagger) zwraca 404 — potwierdza, że kontener wystartował z `NODE_ENV=production`.
- [ ] Certyfikat HTTPS jest ważny (Caddy robi to automatycznie, ale sprawdź w przeglądarce).
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.prod ps` — `db`/`redis` NIE mają portu wystawionego poza `127.0.0.1` (`docker port <container>`).
- [ ] Test `./scripts/backup-postgres.sh` — plik `.sql.gz` faktycznie powstaje.
- [ ] Cron backupu wpisany (patrz nagłówek `scripts/backup-postgres.sh`).
- [ ] `/signup` faktycznie zakłada firmę i loguje — pełny test z audytu Etapu 6.
- [ ] W `.env.prod` NIE MA żadnej wartości skopiowanej dosłownie z `.env.prod.example` (`wygeneruj-...`, puste sekrety).

## 3. Migracje Prisma na produkcji

**Nigdy** `prisma migrate dev` na produkcji — to narzędzie interaktywne,
które może zapytać o utratę danych albo zresetować bazę. Zawsze
`prisma migrate deploy` (nieinteraktywne, tylko nakłada brakujące migracje):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  sh -c "cd apps/api && npx prisma migrate deploy"
```

Zweryfikowane na żywo (Etap 8, test wdrożeniowy) — Prisma CLI JEST dostępne w
obrazie `runtime` (instalacja `npm install` bez `--omit=dev` kopiuje też
devDependencies, w tym `prisma`), więc powyższe polecenie działa bez żadnych
obejść. `cd apps/api` jest wymagane — `npx prisma` szuka `schema.prisma`
względem katalogu roboczego, nie globalnie.

**Pierwszy deploy — zasiej też role/uprawnienia/szablony powiadomień**, bez
tego `POST /companies/signup` zawiedzie (brak roli systemowej "Administrator"):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  node apps/api/dist/prisma/seed.js
```

Uwaga: `npx prisma db seed` (standardowa komenda Prisma) NIE zadziała w tym
obrazie — konfiguracja `prisma.seed` w `package.json` wskazuje plik `.ts`,
a `ts-node` nie jest potrzebny/obecny w produkcyjnym przepływie; powyższe
`node apps/api/dist/prisma/seed.js` uruchamia już SKOMPILOWANĄ wersję tego
samego skryptu. Skrypt jest idempotentny (bezpieczny do wielokrotnego
uruchomienia, np. po każdym większym deployu, jeśli dodano nowe uprawnienia).

## 4. Aktualizacja aplikacji (deploy nowej wersji)

Kolejność ZAWSZE: **migracja bazy PRZED nowym kodem**, chyba że migracja
usuwa/zmienia kolumnę, na której nadal polega STARY kod (wtedy potrzebny
deploy dwuetapowy — dodaj kolumnę w wersji N, przełącz kod na nią w wersji
N+1, usuń starą kolumnę dopiero w N+2).

```bash
git pull
# 1) Migracja NAJPIERW (bezpieczna dla addytywnych zmian schematu)
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

# 2) Zrób backup PRZED podmianą kontenerów (patrz sekcja 5) — tania polisa,
#    kosztuje sekundy, ratuje przy nieudanym deployu.
./scripts/backup-postgres.sh

# 3) Zbuduj i podmień kontenery
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4) Sprawdź
curl -s https://twoja-domena.pl/health
```

`restart: unless-stopped` + healthcheck na `api` oznaczają, że Docker sam
zrestartuje kontener, jeśli padnie od razu po starcie — ale to NIE zastępuje
ręcznego sprawdzenia `/health` po każdym deployu.

## 5. Backup i odtwarzanie

Backup — patrz `scripts/backup-postgres.sh` (nagłówek pliku ma pełną
instrukcję, w tym przykład wpisu do crona). Domyślnie zapisuje skompresowany
`pg_dump` do `./backups/`, zachowuje 14 ostatnich kopii.

**Przetestuj odtworzenie CHOĆ RAZ, zanim będzie potrzebne naprawdę** —
backup, którego nikt nigdy nie odtworzył, to hipoteza, nie zabezpieczenie:

```bash
./scripts/restore-postgres.sh backups/smartrma-<data>.sql.gz
```

Skrypt pyta o potwierdzenie (przepisanie nazwy bazy) — to operacja
DESTRUKCYJNA, nadpisuje całą bieżącą bazę. Testuj na osobnym, jednorazowym
środowisku (np. inny VPS/inny `.env.prod` z inną nazwą bazy), nie na
działającej produkcji, chyba że to faktyczna sytuacja awaryjna.

**WAŻNE — `pg_dump` NIE obejmuje załączników klientów.** Zweryfikowane na
żywo (Etap 8): zdjęcia/dokumenty leżą na osobnym wolumenie Dockera
(`uploads_data`, montowany jako `/data/uploads` w kontenerze `api`), poza
bazą danych — `backup-postgres.sh` go nie dotyka. Backup samej bazy bez
kopii tego wolumenu odtworzy organizacje/sprawy/użytkowników, ale KAŻDY
załącznik będzie martwym odnośnikiem (rekord `Document` istnieje, plik nie).
Kopia całego wolumenu:

```bash
docker run --rm -v smartrma_uploads_data:/data -v "$(pwd)/backups:/backup" alpine \
  tar czf /backup/smartrma-uploads-$(date -u +%Y%m%d-%H%M%S).tar.gz -C /data .
```

(nazwa wolumenu to `<COMPOSE_PROJECT_NAME>_uploads_data` — sprawdź przez
`docker volume ls`, jeśli `COMPOSE_PROJECT_NAME` inny niż domyślne `smartrma`).
Odtworzenie — analogicznie, `tar xzf ... -C /data` do NOWEGO, pustego
wolumenu, PRZED pierwszym startem kontenera `api` na tym wolumenie.

## 6. Rollback

Jeśli nowa wersja jest zepsuta:

```bash
# Cofnij kod do poprzedniego commitu/tagu
git checkout <poprzedni-tag-lub-commit>
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Jeśli deploy zawierał migrację, która nie da się bezpiecznie cofnąć (np.
usunęła kolumnę) — jedyna pewna droga to **odtworzenie backupu sprzed
migracji** (sekcja 5), nie próba ręcznego "down-migration" na żywej bazie.
Dlatego backup PRZED każdym deployem (sekcja 4, krok 2) nie jest opcjonalny.

## 7. Rotacja sekretów

Potrzebna, jeśli: podejrzenie wycieku `.env.prod`, zmiana osoby z dostępem,
albo cykliczna higiena (np. raz w roku).

```bash
node scripts/generate-prod-secrets.js --write .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

**Efekt uboczny, oczekiwany:** zmiana `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
wylogowuje WSZYSTKICH użytkowników wszystkich organizacji (istniejące tokeny
przestają się weryfikować) — zaplanuj to poza godzinami szczytu, poinformuj
klientów z wyprzedzeniem.

## 8. Monitoring — czego dziś brakuje

`GET /health`/`GET /version` istnieją i nadają się pod zewnętrzny monitoring
(np. UptimeRobot, Better Uptime — dowolny serwis odpytujący URL cyklicznie).
Brak natomiast śledzenia błędów aplikacyjnych (Sentry lub podobne) — do
rozważenia jako osobne zadanie, wymaga założenia konta u zewnętrznego
dostawcy i wklejenia DSN do konfiguracji `apps/api`.
