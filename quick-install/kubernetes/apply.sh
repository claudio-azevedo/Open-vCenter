#!/usr/bin/env bash
#
# apply.sh - deploy Open vCenter to a k3s cluster in one shot:
#
#   postgres 17 / rabbitmq / valkey / keycloak (postgres-backed, "ovc" realm
#   auto-imported) / webrdp+guacd / backend+worker / frontend
#
# All resources live in the "ovc-infra" namespace. Services are NodePort (no
# LoadBalancer assumed). Data is on ReadWriteOnce PVCs (k3s local-path).
# See README.md before running this on anything but a throwaway lab cluster.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

kubectl apply -f 00-namespace.yaml

# BETTER_AUTH_SECRET is a session-signing key, not a shared default - unlike
# every other value here it doesn't belong in a checked-in ConfigMap.
# Generate one on first apply and keep reusing it (re-running this script
# never rotates it).
if ! kubectl -n ovc-infra get secret ovc-frontend-secret >/dev/null 2>&1; then
  echo "==> generating ovc-frontend-secret (BETTER_AUTH_SECRET)"
  kubectl -n ovc-infra create secret generic ovc-frontend-secret \
    --from-literal=BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
fi

for svc in ovc-postgres ovc-rabbitmq ovc-valkey ovc-keycloak ovc-webrdp ovc-backend ovc-frontend; do
  echo "==> applying $svc"
  kubectl apply -f "$svc/"
done

echo
echo "==> waiting for deployments to become available..."
kubectl -n ovc-infra rollout status deploy/ovc-postgres       --timeout=180s
kubectl -n ovc-infra rollout status deploy/ovc-rabbitmq       --timeout=180s
kubectl -n ovc-infra rollout status deploy/ovc-valkey         --timeout=120s
kubectl -n ovc-infra rollout status deploy/ovc-keycloak       --timeout=300s || true
kubectl -n ovc-infra rollout status deploy/ovc-webrdp         --timeout=120s
kubectl -n ovc-infra rollout status deploy/ovc-backend        --timeout=180s
kubectl -n ovc-infra rollout status deploy/ovc-backend-worker --timeout=180s
kubectl -n ovc-infra rollout status deploy/ovc-frontend       --timeout=120s

echo
echo "==> ingress hosts (point each at the node IP - see README \"Ingress\"):"
kubectl -n ovc-infra get ingress

cat <<'EOF'

Test logins (realm "ovc", client "ovc-frontend"):
  admin/admin        - ADMINISTRATOR (full access)
  operator/operator  - MANAGE_VMS   (login only - no scope granted yet, sees nothing)
  noroles/noroles    - no role      (redirected to /access-denied)

Open http://frontend.openvcenter.local once DNS/hosts resolves it, or
http://<node-ip>:30300 directly (NodePort) - see README for the redirect_uri
caveat on that second path.
EOF

kubectl -n ovc-infra get pods,svc
