# Open vCenter - Kubernetes quick install

Batteries-included Kubernetes manifests for the whole Open vCenter stack,
using the published [container images](../../docs/kubernetes.md#container-images).
This is the same design as [`docs/kubernetes.md`](../../docs/kubernetes.md),
hardened for an actual "apply it and it works" deploy:

- **Keycloak is Postgres-backed with the `ovc` realm auto-imported** on first
  boot (`ovc-keycloak/configmap-realm.yaml`) - no manual realm/client
  creation, and the realm survives a pod restart (the narrative doc's
  example uses Keycloak's embedded dev DB, which doesn't).
- **`BETTER_AUTH_SECRET` is generated, not hardcoded** - `apply.sh` creates
  it as a one-off Secret on first run instead of shipping a fixed value in a
  public repo.
- **NodePorts are pinned** to the values in the doc's NodePort table
  (some of the doc's own YAML leaves them to auto-assignment).
- **Postgres, Valkey and webrdp are `ClusterIP`, not `NodePort`** - nothing
  outside the cluster ever needs to reach them directly (see "NodePorts"
  below), unlike the narrative doc which exposes everything as `NodePort` for
  teaching purposes.
- **`OVC_PUBLIC_BASE_URL` is set** - without it, the Setup Agent one-liner /
  agent binary downloads fail outright with `OVC_AGENT_STORAGE=local`.

Target: a **kubernetes** cluster with Traefik as the Ingress controller for
name-based routing. Persistent data uses `ReadWriteOnce` PVCs.

## Layout

One folder per service, same shape as `docs/kubernetes.md`. Service names
carry a `-service-nodeport` or `-service` suffix matching their actual
`Type` below:

| Deployment                             | Service                         | Type      | ConfigMap(s)                                              | PVC                   |
| -------------------------------------- | ------------------------------- | --------- | --------------------------------------------------------- | --------------------- |
| `ovc-postgres`                         | `ovc-postgres-service`          | ClusterIP | `ovc-postgres-configmap`, `ovc-postgres-initdb-configmap` | `ovc-postgres-data`   |
| `ovc-rabbitmq`                         | `ovc-rabbitmq-service-nodeport` | NodePort  | `ovc-rabbitmq-configmap`                                  | `ovc-rabbitmq-data`   |
| `ovc-valkey`                           | `ovc-valkey-service`            | ClusterIP | `ovc-valkey-configmap`                                    | `ovc-valkey-data`     |
| `ovc-keycloak`                         | `ovc-keycloak-service-nodeport` | NodePort  | `ovc-keycloak-configmap`, `ovc-keycloak-realm-configmap`  | -                     |
| `ovc-webrdp` (+ guacd sidecar)         | `ovc-webrdp-service`            | ClusterIP | `ovc-webrdp-configmap`                                    | -                     |
| `ovc-backend` (+ `ovc-backend-worker`) | `ovc-backend-service-nodeport`  | NodePort  | `ovc-backend-configmap`                                   | `ovc-backend-uploads` |
| `ovc-frontend`                         | `ovc-frontend-service-nodeport` | NodePort  | `ovc-frontend-configmap` + `ovc-frontend-secret` (Secret) | -                     |

`guacd` has no folder of its own - it runs as a sidecar container in the
`ovc-webrdp` Pod (same as the narrative doc), reached over `localhost`.

All resources go into the **`ovc-infra`** namespace.

## Config / passwords

Per the project convention, container env vars - passwords included - live
in ConfigMaps (`*-configmap`). This is a dev/lab stack. For a production
deployment, move the passwords into `Secret`s and switch the
`envFrom.configMapRef` entries to `secretRef`.

Defaults: user `ovc` / password `PleaseChangeMe1` (Postgres, RabbitMQ,
Keycloak's own DB), Keycloak admin `admin` / `admin`. The one exception is
`BETTER_AUTH_SECRET` - a session-signing key, not a shared default - which
`apply.sh` generates into a `ovc-frontend-secret` Secret on first run and
never overwrites afterwards.

## Roles / test logins

The imported realm ships three client roles on `ovc-frontend` and one test
user per role (see [Roles](../../docs/kubernetes.md#roles) for what each
grants):

| Login                   | Role            | What happens                                                                                                                     |
| ----------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `admin` / `admin`       | `ADMINISTRATOR` | Full access to every cluster/host/folder/VM.                                                                                     |
| `operator` / `operator` | `MANAGE_VMS`    | Logs in, sees nothing until a scope grant is added (there's no admin UI for that yet - it's a `ScopeGrant` row in the database). |
| `noroles` / `noroles`   | _(none)_        | Redirected to `/access-denied`.                                                                                                  |

Change or remove these once you're past a first login - they're plain-text
in `ovc-keycloak/configmap-realm.yaml`, meant for kicking the tyres only.

## NodePorts

| Service             | Node port | Container port | Notes                                          |
| ------------------- | --------- | -------------- | ---------------------------------------------- |
| rabbitmq AMQP       | 30672     | 5672           | Hyper-V hosts connect here directly (external) |
| rabbitmq management | 31672     | 15672          | web UI                                         |
| keycloak            | 30080     | 8080           | admin console + `ovc` realm                    |
| backend             | 30800     | 8000           | REST API, Swagger at `/api/docs`               |
| frontend            | 30300     | 3000           |                                                |

Reach them at `http://<node-ip>:<node-port>`.

**Not exposed as NodePort** (`ClusterIP` only - nothing outside the cluster
needs them):

| Service  | Why                                                                                                                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| postgres | Only `ovc-backend` and `ovc-keycloak` connect to it, both in-cluster.                                                                                                                                                                                                                                       |
| valkey   | Only `ovc-backend`/`ovc-backend-worker` connect to it, in-cluster.                                                                                                                                                                                                                                          |
| webrdp   | `ovc-frontend`'s own server proxies `/webrdp/tunnel` to it server-to-server (`WEBRDP_ORIGIN`) - the browser never talks to `ovc-webrdp` directly, so it needs no public exposure at all. `ovc-webrdp/ingress.yaml` still gives optional direct/debug access over `webrdp.openvcenter.local` if you want it. |

Add a `nodePort:` back to any of these `service.yaml` files (and switch
`type` to `NodePort`) if you need direct external access for debugging.

## Ingress (openvcenter.local)

One `ingress.yaml` per service folder, all under Traefik:

| Host                                    | Routes to                                              |
| --------------------------------------- | ------------------------------------------------------ |
| `rabbitmq-management.openvcenter.local` | `ovc-rabbitmq` management UI                           |
| `keycloak.openvcenter.local`            | `ovc-keycloak`                                         |
| `webrdp.openvcenter.local`              | `ovc-webrdp`                                           |
| `frontend.openvcenter.local`            | `ovc-frontend` at `/`, `ovc-backend` at `/api` (debug) |

Point every one of these hostnames at the node's IP (`/etc/hosts` on each
client machine, or a DNS server) - Traefik listens on the node at ports
80/443 and dispatches by the `Host` header, so no extra NodePort is needed.

**If you skip DNS/hosts and use `http://<node-ip>:30300` instead:** login
will fail with a Keycloak `redirect_uri` mismatch, because the imported
realm only registers `http://frontend.openvcenter.local/*`. Either set up
the hostname (simplest), or add your NodePort URL as an extra Redirect URI /
Web Origin on the `ovc-frontend` client by hand in the Keycloak admin
console.

`rabbitmq` (plain AMQP) is intentionally absent from the app-facing part of
this table - it's a binary protocol, so an `Ingress` can't route it by
hostname; clients keep using the `30672` NodePort directly.

## Apply

```sh
./apply.sh
# or manually:
kubectl apply -f 00-namespace.yaml
kubectl create secret generic ovc-frontend-secret -n ovc-infra \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
kubectl apply -f ovc-postgres/ -f ovc-rabbitmq/ -f ovc-valkey/ -f ovc-keycloak/ -f ovc-webrdp/ -f ovc-backend/ -f ovc-frontend/
```

Tear down (keeps PVCs + the frontend secret):

```sh
./delete.sh            # keep data
./delete.sh --purge    # also drop PVCs, the secret, and the namespace
```

## Notes

- **Postgres**: `PGDATA` is set one level below the mount point so initdb
  never trips over a non-empty directory (`lost+found`, etc). The
  `keycloak` database is created on first boot by
  `ovc-postgres-initdb-configmap` (mounted at `/docker-entrypoint-initdb.d`).
- **RabbitMQ**: `RABBITMQ_NODENAME=rabbit@localhost` pins the Erlang node
  name so a pod restart keeps the same Mnesia DB. Deployments with a PVC use
  the `Recreate` strategy (RWO volume).
- **Keycloak**: `--import-realm` only runs on first boot. If you change
  `ovc-keycloak/configmap-realm.yaml` later, either edit the client by hand
  in the admin console, or delete and reapply `ovc-keycloak/` (loses realm
  state) to re-trigger the import.
- **webrdp / backend / frontend**: published as **public** GHCR images
  (`ghcr.io/claudio-azevedo/ovc-webrdp`, `ovc-backend`, `ovc-frontend`), no
  `imagePullSecret` needed. If your own fork publishes to a private
  registry instead, add one to each Deployment.
- **backend**: `OVC_AUTH_MODE=oidc` - the frontend's image always requires
  real login in production (`NODE_ENV` is baked to `production`, disabling
  its dev-bypass path), so the backend verifies real tokens too. The
  startup preflight (`OVC_PREFLIGHT*`) runs migrations and reconciles
  RabbitMQ users on boot; `ovc-backend-worker` reuses the same
  image/ConfigMap with `command: python -m app.worker`.
- **frontend**: all of its config is runtime (`ovc-frontend-configmap` +
  `ovc-frontend-secret`), including `WEBRDP_ORIGIN` (the `/webrdp/tunnel`
  proxy target for the VM Console tab) - confirmed working end-to-end
  (VMConnect and host RDP both tested) against a real `ovc-webrdp`/guacd.
  Requires an `ovc-frontend` image built after its `WEBRDP_ORIGIN` fix -
  older images ignore this ConfigMap value and expect a Service named
  `ovc-webrdp-service-nodeport` instead, baked in at build time. Not a
  concern here (no production deploy ever used one of those images), but if
  you ever need to run an older image against this manifest set, either add
  that name as an extra alias on `ovc-webrdp/service.yaml`, or rebuild the
  image.
