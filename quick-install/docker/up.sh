#!/usr/bin/env bash
#
# up.sh - bring up Open vCenter (published images) behind a single nginx
# entrypoint on http://localhost:
#
#   postgres 17 / rabbitmq / valkey / guacd / keycloak (postgres-backed,
#   "ovc" realm auto-imported) / webrdp / backend + worker / frontend / nginx
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: 'docker' not found. Install Docker: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker is not running." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: 'docker compose' not available." >&2
  exit 1
fi

# BETTER_AUTH_SECRET is a session-signing key, not a shared default - unlike
# every other password here it doesn't belong hardcoded in a public repo.
# Generate one into .env on first run and keep reusing it afterwards.
if [ ! -f .env ]; then
  echo "==> generating .env (BETTER_AUTH_SECRET)"
  echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .env
fi

echo "==> pulling images..."
"${COMPOSE[@]}" pull

echo "==> starting containers..."
"${COMPOSE[@]}" up -d

echo
echo "==> status:"
"${COMPOSE[@]}" ps

cat <<'EOF'

Open vCenter:  http://localhost
  test logins (realm "ovc", client "ovc-frontend"):
    admin/admin        - ADMINISTRATOR (full access)
    operator/operator  - MANAGE_VMS   (login only - no scope granted yet, sees nothing)
    noroles/noroles    - no role      (redirected to /access-denied)

Other services:
  keycloak admin console   http://localhost:8080         (admin/admin)
  rabbitmq management      http://localhost:15672        (ovc/PleaseChangeMe1)
  backend direct/Swagger   http://localhost:8000/api/docs
  webrdp direct            http://localhost:8090/webrdp/

Logs:  docker compose logs -f
Stop:  ./down.sh
EOF
