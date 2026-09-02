#!/usr/bin/env bash
# Etap 7 — odtworzenie kopii zapisanej przez `backup-postgres.sh`.
# DESTRUKCYJNE: nadpisuje bieżącą bazę `$POSTGRES_DB` całkowicie. Pyta o
# potwierdzenie, chyba że `--yes` jest podane (np. do testu na osobnym,
# jednorazowym środowisku odtworzeniowym — patrz docs/DEPLOYMENT.md,
# sekcja "Przetestuj odtworzenie backupu").
#
# Użycie:
#   ./scripts/restore-postgres.sh backups/smartrma-20260830-030000.sql.gz
#   ./scripts/restore-postgres.sh backups/smartrma-20260830-030000.sql.gz --yes
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_FILE="${1:-}"
CONFIRM="${2:-}"
# Etap 8 — patrz identyczny doc-comment w backup-postgres.sh: bez tego
# `docker compose exec`/`stop`/`start` mogą po cichu trafić do innego stacku
# Compose na tym samym hoście, jeśli nazwa katalogu kiedykolwiek się zmieni.
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smartrma}"
export COMPOSE_PROJECT_NAME

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Użycie: $0 <plik-kopii.sql.gz> [--yes]" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "Brak $ENV_FILE — uruchom z katalogu, w którym wdrożono docker-compose.prod.yml." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [ "$CONFIRM" != "--yes" ]; then
  echo "UWAGA: to NADPISZE CAŁKOWICIE bazę '${POSTGRES_DB}' zawartością ${BACKUP_FILE}."
  read -r -p "Wpisz DOKŁADNIE nazwę bazy (${POSTGRES_DB}), żeby potwierdzić: " TYPED
  if [ "$TYPED" != "$POSTGRES_DB" ]; then
    echo "Nie zgadza się — przerwano, nic nie zmieniono." >&2
    exit 1
  fi
fi

echo "[restore-postgres] Zatrzymuję API (żeby nie pisało do bazy w trakcie odtwarzania)…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop api

echo "[restore-postgres] Odtwarzam ${BACKUP_FILE} do '${POSTGRES_DB}'…"
gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --set ON_ERROR_STOP=on

echo "[restore-postgres] Uruchamiam API ponownie…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start api

echo "[restore-postgres] Gotowe. Sprawdź GET /health i zaloguj się testowym kontem."
