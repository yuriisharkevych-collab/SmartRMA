#!/usr/bin/env bash
# Etap 7 (audyt gotowości produkcyjnej, punkty 16/17 — "backup PostgreSQL" i
# "odtworzenie backupu" były wcześniej całkowicie BRAK, poza kosmetycznym
# polem w Ustawieniach, patrz `configuration.ts::BackupConfig`). Ten skrypt
# to najprostsza rzecz, która faktycznie działa: `pg_dump` przez `docker exec`
# do usługi `db` z `docker-compose.prod.yml`, plik skompresowany, rotacja
# starych kopii. Uruchamiany ręcznie albo z crona (patrz przykład niżej).
#
# Użycie (z korzenia repo, tam gdzie leży .env.prod i docker-compose.prod.yml):
#   ./scripts/backup-postgres.sh [katalog-docelowy]
#   (domyślny katalog docelowy: ./backups)
#
# Przykład crona — codziennie o 3:00, zachowuje 14 ostatnich kopii:
#   0 3 * * * cd /sciezka/do/repo && ./scripts/backup-postgres.sh >> /var/log/smartrma-backup.log 2>&1
#
# WAŻNE: ten skrypt zapisuje kopię NA TYM SAMYM SERWERZE co baza — to
# zabezpiecza przed uszkodzeniem danych/błędem operatora, ale NIE przed
# awarią całego serwera/dysku. Przed pierwszym prawdziwym klientem
# skonfiguruj DODATKOWO wysyłkę `$BACKUP_DIR` w inne miejsce (S3, drugi
# serwer, itp.) — `rclone`/`rsync` w kolejnej linii crona, poza zakresem tego
# skryptu.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${1:-$REPO_DIR/backups}"
KEEP_LAST="${KEEP_LAST:-14}"
# Etap 8 (test wdrożeniowy) — WYKRYTE na żywo: bez jawnej nazwy projektu
# `docker compose exec` domyślnie ją zgaduje z nazwy KATALOGU roboczego. Jeśli
# na tym samym hoście działa więcej niż jeden stack Compose (np. środowisko
# testowe obok produkcyjnego, albo katalog repo zostanie kiedyś zmieniony/
# zsymlinkowany), zgadnięta nazwa może się nie zgadzać z tą użytą przy `up`,
# a `exec -T db pg_dump` po cichu trafi do INNEGO kontenera `db` (inna baza,
# błąd "database does not exist" — dokładnie tak to wygląda z zewnątrz).
# `COMPOSE_PROJECT_NAME` jawnie ustawiony przy `up` (patrz docs/DEPLOYMENT.md)
# i tu, w tej samej zmiennej, eliminuje tę niejednoznaczność.
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smartrma}"
export COMPOSE_PROJECT_NAME

if [ ! -f "$ENV_FILE" ]; then
  echo "Brak $ENV_FILE — uruchom z katalogu, w którym wdrożono docker-compose.prod.yml." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/smartrma-${TIMESTAMP}.sql.gz"

echo "[backup-postgres] Zrzucam bazę '${POSTGRES_DB}' do ${OUT_FILE}…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip > "$OUT_FILE"

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "[backup-postgres] Gotowe: ${OUT_FILE} (${SIZE})."

# Rotacja — zostaw tylko $KEEP_LAST najnowszych plików.
COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'smartrma-*.sql.gz' | wc -l)
if [ "$COUNT" -gt "$KEEP_LAST" ]; then
  TO_DELETE=$((COUNT - KEEP_LAST))
  echo "[backup-postgres] Usuwam ${TO_DELETE} najstarszych kopii (zostaje ${KEEP_LAST})…"
  find "$BACKUP_DIR" -maxdepth 1 -name 'smartrma-*.sql.gz' -printf '%T@ %p\n' \
    | sort -n | head -n "$TO_DELETE" | cut -d' ' -f2- | xargs -r rm -v
fi
