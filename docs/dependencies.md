---
title: Dependencies
layout: default
nav_order: 4
---

# Dependencies

{: .no_toc }

---

The backing services OVC needs. They are plain containers - run them with Docker
Compose, Kubernetes, or use managed equivalents. Minimum versions below. For a
ready-made deployment of the whole stack, see
[Docker Compose](docker-compose) or [Kubernetes](kubernetes).

## PostgreSQL - 17

**Used by:** `ovc-backend`

System of record: clusters, hosts, folders, VMs (extended inventory),
templates, ISOs, tasks (with the raw agent request/response), and scope grants
for RBAC. The schema is managed by **Alembic** migrations (`alembic upgrade head`).
The database starts empty - register hosts with `POST /api/hosts`.

## RabbitMQ - 4

**Used by:** `ovc-backend` ⇄ `ovc-agent`

The **only** channel between the backend and the hosts. Per-host queues carry
requests one way and task responses + last-value inventory the other way - see
[Architecture › RabbitMQ queues](architecture#rabbitmq-queues-per-host).

A per-host agent user can be locked to just its own queues via the regex from
`app.messaging.agent_permission_pattern(host_id)`.

Give the container a **stable hostname** (e.g. `hostname: ovc-rabbitmq`) so the
Erlang node name - and therefore the durable queues, users and permissions -
survives a container recreate.

## Valkey - 8.0 (or Redis 7+)

**Used by:** `ovc-backend`

Cache and coordination, not a system of record:

- **Agent liveness / online-offline state** per host.
- **Per-VM mutation locks** (`vm:lock:<id>`) - one mutating agent task per VM at
  a time.
- **VM delete tombstones** - short-lived, prevent a stale inventory snapshot
  from resurrecting a deleted row.
- **Cached inventory reads.**

## OIDC provider - any

**Used by:** `ovc-frontend` (login) and `ovc-backend` (token verification)

Any OpenID Connect provider with a discovery document works - Keycloak, Auth0,
Okta, Entra ID. The frontend runs `better-auth` in cookie mode; the backend
verifies the JWT when `OVC_AUTH_MODE=oidc`. Roles are read from a configurable
claim (default `resource_access.${client_id}.roles`); the `ADMINISTRATOR` role
bypasses every scope filter.

Register `${app}/frontend-api/auth/callback/oidc` as a redirect URI.

{: .note }

> For local UI work without any provider, set `OVC_AUTH_MODE=stub` on both the
> frontend and the backend.

## guacd - 1.6.0

**Used by:** `ovc-webrdp`

The Guacamole proxy daemon. `ovc-webrdp` speaks the Guacamole protocol to it;
`guacd` speaks RDP (3389) and Hyper-V `vmconnect` (2179) to the target hosts, so
it needs network reach to every Hyper-V host. Only required for the VM
**Console** tab.

## Minimal Docker Compose

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: ovc
      POSTGRES_USER: ovc
      POSTGRES_PASSWORD: ovc123
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  rabbitmq:
    image: rabbitmq:4-management
    hostname: ovc-rabbitmq # stable Erlang node name across recreates
    environment:
      RABBITMQ_DEFAULT_USER: ovc
      RABBITMQ_DEFAULT_PASS: ovc123
    ports: ["5672:5672", "15672:15672"]
    volumes: ["rabbitmq:/var/lib/rabbitmq"]

  valkey:
    image: valkey/valkey:8
    command: ["--save", "60", "1"]
    ports: ["6379:6379"]
    volumes: ["valkey:/data"]

  guacd: # only needed for the VM Console tab
    image: guacamole/guacd:1.6.0
    ports: ["4822:4822"]

volumes: { pgdata: {}, rabbitmq: {}, valkey: {} }
```

Backend environment to match:

```
OVC_DATABASE_URL=postgresql+asyncpg://ovc:ovc123@localhost:5432/ovc
OVC_VALKEY_URL=redis://localhost:6379/0
OVC_RABBITMQ_URL=amqp://ovc:ovc123@localhost:5672/
```
