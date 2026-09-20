---
title: Running in dev mode
layout: default
nav_order: 5
---

# Running in dev mode

{: .no_toc }

---

Each component run per-process, straight from source - not containers; see
[Docker Compose](docker-compose) or [Kubernetes](kubernetes) for that instead.
Each step below is per-repository; see each repo's own `README.md` for detail.

## 1. Backing services

Run PostgreSQL, RabbitMQ and Valkey (plus `guacd` for the Console tab, and an
OIDC provider unless you use dev-bypass). Use the
[minimal Compose file](dependencies#minimal-docker-compose), or any equivalent -
managed services work too.

Default local endpoints assumed by the other repos' `.env.example` files:

| Service    | Endpoint                      | Credentials                |
| ---------- | ----------------------------- | -------------------------- |
| PostgreSQL | `localhost:5432`              | `ovc` / `ovc123`, db `ovc` |
| RabbitMQ   | `localhost:5672` (UI `15672`) | `ovc` / `ovc123`           |
| Valkey     | `localhost:6379`              | -                          |
| guacd      | `localhost:4822`              | -                          |

## 2. Backend - `ovc-backend`

API + worker. The database starts empty.

```sh
cp .env.example .env            # defaults match the endpoints above
alembic upgrade head
uvicorn app.main:app --reload --port 8000   # terminal 1
python -m app.worker                         # terminal 2
```

Or with Docker (API + worker only; reaches the infra via
`host.docker.internal`):

```sh
docker compose up -d
curl localhost:8000/api/health   # {"ok":true,"db":true,"cache":true,"rabbit":true}
docker compose --profile demo up -d   # optional synthetic agent, no Windows host
```

## 3. Frontend - `ovc-frontend`

Requires **Node 24**.

```sh
npm install
cp .env.example .env.local       # set OVC_AUTH_MODE=stub for local UI work
npm run dev                       # http://localhost:3000
```

## 4. Agent - `ovc-agent-hyperv` (on each Hyper-V host)

Hosts and agents are registered through the **frontend**, not by calling the
backend directly:

1. In the inventory tree, right-click → **Add Host** (optionally under a
   cluster).
2. Open the new host's detail pane. While its agent has never checked in, the
   only tab is **Setup Agent**: a paste-ready, elevated-PowerShell one-liner
   that creates `C:\Program Files\ovc-agent`, downloads and checksums the
   agent, writes `config.ini`, and installs the Windows service.
3. On the host, run that command in an **elevated** PowerShell. It opens the
   written `config.ini` in Notepad - set the two storage paths
   (`template_path`, `local_iso_path`), save, then `Start-Service ovc-agent`.

The tab disappears - and the host's FQDN/IP fill in - once the agent's first
`agent_status` arrives. See the agent's own README for the `config.ini` format
and the manual `ovc-agent.exe install/start/stop/uninstall` commands the
one-liner wraps.

## Containerized deployments

The steps above are for local, per-process development. To run the whole
stack as containers instead:

- **[Docker Compose](docker-compose)** - one `docker-compose.yaml` for
  everything (backing services, backend API + worker, webrdp), using the
  published container images.
- **[Kubernetes](kubernetes)** - the same stack as plain manifests, targeting
  a single-node k3s cluster with `NodePort` services.

Both use the same [container images](kubernetes#container-images) and treat
the OIDC provider (Keycloak or any other) as optional, same as local dev.

## Deploying behind one domain

A reverse proxy splits one hostname by path prefix:

```
ovc.domain.net/         →  ovc-frontend   (SSR pages, assets, /frontend-api/*)
ovc.domain.net/api/     →  ovc-backend    (the REST API)
```

The browser only ever calls the frontend - REST goes through
`/frontend-api/api/*`, which the frontend server forwards to `ovc-backend` with
the bearer token attached. See `ovc-frontend/README.md` for an nginx sketch.
