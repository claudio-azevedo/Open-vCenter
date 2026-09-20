#!/usr/bin/env bash
#
# delete.sh - tear down Open vCenter. Keeps the PVCs and the generated
# ovc-frontend-secret by default, so data and the login-session signing key
# survive; pass --purge to also drop those and the namespace.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

for svc in ovc-frontend ovc-backend ovc-webrdp ovc-keycloak ovc-valkey ovc-rabbitmq ovc-postgres; do
  kubectl delete -f "$svc/" --ignore-not-found
done

if [[ "${1:-}" == "--purge" ]]; then
  kubectl -n ovc-infra delete secret ovc-frontend-secret --ignore-not-found
  kubectl -n ovc-infra delete pvc --all
  kubectl delete -f 00-namespace.yaml --ignore-not-found
fi
