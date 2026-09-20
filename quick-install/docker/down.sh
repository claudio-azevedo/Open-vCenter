#!/usr/bin/env bash
#
# down.sh - tear down Open vCenter. Keeps the data volumes and .env (the
# generated BETTER_AUTH_SECRET) by default; pass --purge to drop those too.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

if [[ "${1:-}" == "--purge" ]]; then
  "${COMPOSE[@]}" down -v
  rm -f .env
else
  "${COMPOSE[@]}" down
fi
