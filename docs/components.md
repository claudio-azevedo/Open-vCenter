---
title: Components
layout: default
nav_order: 3
---

# Components

{: .no_toc }

---

Each component lives in its own repository. This page is the map; see each
repo's `README.md` and `LLM.md` for detail.

## ovc-frontend

**React 19 · TanStack Start (SSR) · TanStack Router / Query · TypeScript (strict)
· Vite · Tailwind CSS v4 · ag-grid-community**

The web console. A single maximised Windows 95/98 window: menu bar, toolbar, a
resizable split (left: Cluster → Host → Folder → VM tree; right: detail tabs for
the selection), a full-width **Recent Tasks** dock, and a status bar.

- **Only REST client.** The browser calls the frontend; the frontend server
  proxies `/api/*` to `ovc-backend` and attaches the OIDC bearer token.
- **Auth** is OIDC via `better-auth` (cookie mode) against any OpenID Connect
  provider. `OVC_AUTH_MODE=stub` (same variable as `ovc-backend`) skips login.
- **Data** is polled by TanStack Query (clusters 30 s, hosts 15 s, VMs 10 s).
- **Power actions** are optimistic + task-tracked.
- Custom Win95 component kit under `src/components/win95/`.

## ovc-backend

**Python 3.11+ · FastAPI · Pydantic v2 · SQLAlchemy 2.0 (async) · asyncpg ·
Alembic · aio-pika · redis-py**

Two processes - the **API** and the **worker** (see
[Architecture](architecture#two-backend-processes)).

- Owns PostgreSQL (system of record) and Valkey (cache + locks).
- Publishes `AgentRequest` messages; records a `Task` for every mutating op.
- Persists the raw `AgentRequest` / `AgentResponse` per task (JSONB) for a
  "Details" view.
- RBAC (Cluster > Host > Folder) enforced entirely server-side.
- The database starts **empty** - register hosts with `POST /api/hosts`.

## ovc-agent (Hyper-V)

**Go 1.25+ · Windows service · PowerShell / Hyper-V cmdlets**

Installed on each Hyper-V host. Communicates **exclusively** via RabbitMQ.

- No fixed install folder - `config.ini`, `agent.log`, `jobs.db` and upgrade
  binaries all sit next to `ovc-agent.exe`. Configuration is read only from
  `config.ini`.
- Persistent job queue in SQLite; each job runs in a subprocess
  (`ovc-agent.exe job <id>`); self-upgrade with checksum + drain mode.
- Validates the Hyper-V role at startup.
- Supported `AgentRequest.function` values:
  - **vm_management:** `vm_create`, `vm_edit`, `vm_start`, `vm_stop`,
    `vm_shutdown`, `vm_restart`, `vm_delete`, `vm_inventory`, `snapshot_*`,
    `vm_migrate`, `mount_dvd`, `eject_dvd`, `enable_ha`, `disable_ha`,
    `vm_export_template`, `vm_rename`, `vm_move`, `vm_clone`, `notes_edit`,
    `refresh_status`, `vm_batch_start`, `vm_batch_stop`
  - **host_management:** `host_hwinventory`, `host_update_agent`,
    `host_restart_agent`, and cluster ops (`suspend`, `suspend_drain`, `resume`,
    `resume_fallback`, `restart`)
  - **periodic inventories:** `agent_status`, `vm_inventory`, `host_hwinventory`,
    `template_inventory`, `iso_inventory`

## ovc-webrdp

**Java (Apache Guacamole client) + `guacd`**

Browser RDP / Hyper-V `vmconnect` (port 2179) gateway. The frontend's VM
**Console** tab embeds a `guacamole-common-js` client that connects to the
webrdp HTTP tunnel at `${VITE_WEBRDP_URL}/tunnel`. Runs with
`WEBAPP_CONTEXT=webrdp` and needs a `guacd` sidecar.

## Backing services

Not first-party code - ordinary containers you run alongside the components:
PostgreSQL, RabbitMQ, Valkey, an OIDC provider, and `guacd`. See
[Dependencies](dependencies) for versions and a minimal Compose file.
