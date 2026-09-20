---
title: Kubernetes
layout: default
nav_order: 7
---

# Kubernetes

{: .no_toc }

---

Plain manifests for the whole stack, one namespace (`ovc-infra`) and
`ReadWriteOnce` PVCs for persistent data.

{: .note }

> **Ready to deploy?** [`quick-install/kubernetes`](https://github.com/claudio-azevedo/Open-Virtualization-Manager/tree/main/quick-install/kubernetes)
> is a hardened, ready-to-apply version of everything below - Keycloak's
> realm auto-imported, the session secret generated, NodePorts pinned and an
> Ingress included. This page explains the *why* behind that design; the
> linked README has the actual manifests, ports and `apply.sh`.

## Container images

`ovc-frontend`, `ovc-backend` and `ovc-webrdp` are built by GitHub Actions and
published to GHCR:

| Component      | Image                                         |
| -------------- | --------------------------------------------- |
| `ovc-frontend` | `ghcr.io/claudio-azevedo/ovc-frontend:latest` |
| `ovc-backend`  | `ghcr.io/claudio-azevedo/ovc-backend:latest`  |
| `ovc-webrdp`   | `ghcr.io/claudio-azevedo/ovc-webrdp:latest`   |

`ovc-backend`'s worker Deployment reuses the same `ovc-backend` image with
`command: python -m app.worker` instead of `uvicorn`. `ovc-agent-hyperv` isn't
distributed as a container - it's a Windows service binary uploaded through
the frontend's Agent Management dialog (stored by the backend) and installed
directly on each Hyper-V host.

## Backing services

PostgreSQL, RabbitMQ and Valkey, each with its own PVC:

- `PGDATA` is set one level below the mount point so initdb never trips over
  a non-empty directory (`lost+found`, etc).
- `RABBITMQ_NODENAME` pins the Erlang node name so a pod restart keeps the
  same Mnesia database.
- `guacd` isn't a backing service of its own - it runs as a sidecar in the
  `ovc-webrdp` Pod, see [ovc-webrdp](#ovc-webrdp) below.

Per the project convention, container env vars - passwords included - live
in ConfigMaps. For a production deployment, move the passwords into
`Secret`s and switch `envFrom.configMapRef` to `secretRef`.

## OIDC provider

`ovc-backend` and `ovc-frontend` default to real OIDC login against a
provider - any works (Keycloak, Auth0, Okta, Entra ID). Roles are read from a
configurable claim (`resource_access.<client_id>.roles` by default) - see
[Roles](#roles) below.

**No IdP, lab/demo deployment:** set `OVC_AUTH_MODE: stub` in both
`ovc-backend`'s and `ovc-frontend`'s config instead.

### Roles

The app recognizes exactly one role by name:

| Role               | Grants                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMINISTRATOR`    | Full access to every cluster, host, folder and VM - no further setup needed. Configurable via `OVC_ADMIN_ROLE` on the backend.                                                     |
| _(any other role)_ | Login only. Visibility is then controlled per-user by scope grants (global/cluster/host/folder) recorded on the backend - none yet means the user sees nothing until one is added. |
| _(no role at all)_ | Redirected to `/access-denied` right after login.                                                                                                                                  |

For a first deployment, assign `ADMINISTRATOR` to at least one user so
someone can log in and add hosts.

## ovc-webrdp

`ovc-guacd` runs as a sidecar in the same Pod as `ovc-webrdp`, matching
`ovc-webrdp`'s own
[`deployment-app.yaml`](https://github.com/claudio-azevedo/Open-vCenter-WebRDP/blob/main/deployment-app.yaml) -
it reaches `guacd` over `localhost` (same network namespace), and nothing
outside the Pod needs to, so there's no separate `guacd` Service.

## ovc-backend and ovc-frontend

The API and the worker are two Deployments sharing one image and ConfigMap.
`OVC_AGENT_STORAGE=local` needs its own PVC (mounted only on the API pod) so
uploaded `ovc-agent` binaries survive a redeploy.

All of `ovc-frontend`'s config is **runtime** (changeable without a
rebuild): `API_URL`, `WEBRDP_ORIGIN`, `OIDC_*` and `BETTER_AUTH_*` are read
from the environment on every request. `WEBRDP_ORIGIN` is the base URL of
`ovc-webrdp` (including its context path) - `ovc-frontend`'s own server
proxies the Console tab's Guacamole tunnel to it, server-to-server, so the
browser never talks to `ovc-webrdp` directly.

## Deploying

See [`quick-install/kubernetes`](https://github.com/claudio-azevedo/Open-Virtualization-Manager/tree/main/quick-install/kubernetes)
for the actual manifests, NodePorts, optional Ingress and `apply.sh` /
`delete.sh`.

Once `ovc-frontend` is reachable, open it to add a host and install its
agent - see
[Running in dev mode › Agent](running#4-agent---ovc-agent-hyperv-on-each-hyper-v-host)
for the Add Host / Setup Agent steps.
