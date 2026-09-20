---
title: Architecture
layout: default
nav_order: 2
---

# Architecture

{: .no_toc }

---

## The big picture

```
                          ┌─────────────────────────────────────────────┐
   Browser  ──────────────▶            ovc-frontend  (SSR web UI)        │
   (OIDC login)           │   React 19 · TanStack Start · Win95 kit      │
                          └───────────────┬─────────────────────────────┘
                                          │  REST  /api/*   (bearer token
                                          │                  attached server-side)
                          ┌───────────────▼─────────────────────────────┐
                          │            ovc-backend                       │
                          │   ┌─────────────┐      ┌──────────────────┐  │
                          │   │  API        │      │  Worker          │  │
                          │   │ (FastAPI)   │      │ (RabbitMQ        │  │
                          │   │ publishes   │      │  consumer)       │  │
                          │   │ requests,   │      │ applies results  │  │
                          │   │ creates     │      │ to DB + cache,   │  │
                          │   │ tasks       │      │ times out tasks  │  │
                          │   └──────┬──────┘      └────────▲─────────┘  │
                          └──────────┼──────────────────────┼───────────┘
             PostgreSQL ◀────────────┤                      │
             Valkey     ◀────────────┘                      │
                                     │  RabbitMQ  (per-host queues)
                          request ───▼──────────────────────┤ response / inventory
                          ┌────────────────────────────────────────────┐
                          │   ovc-agent   (one per Hyper-V host)        │
                          │   Go · Windows service · PowerShell         │
                          └────────────────────────────────────────────┘
```

- The **frontend** is the only REST client. The browser only ever calls the
  frontend; the frontend server proxies `/api/*` to the backend and attaches the
  OIDC bearer token, so no identity or scope is ever sent from the browser.
- The **backend** owns PostgreSQL and Valkey. It publishes `AgentRequest`
  messages and records a `Task` for every mutating operation; it never blocks on
  the agent.
- Each **agent** consumes its own `<hostid>.request` queue, runs the work on the
  host (mostly PowerShell / Hyper-V cmdlets), and publishes progress, results and
  periodic inventory back onto per-host queues.

## Two backend processes

| Process    | Command                | Role                                                                                                                 |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **API**    | `uvicorn app.main:app` | Serves `/api/*`, publishes agent requests, creates tasks. On startup ensures each host's RabbitMQ queues exist.      |
| **Worker** | `python -m app.worker` | Consumes every host's `response` + inventory queues, updates PostgreSQL and the Valkey cache, times out stale tasks. |

## How a request flows

1. An operator clicks **Start** on a VM in the frontend.
2. The frontend optimistically flips the VM to a transitional state and calls
   `POST /api/vms/{id}/actions/start`.
3. The backend API takes the per-VM lock in Valkey, writes a `Task` row
   (`queued`), publishes an `AgentRequest` to `<hostid>.request` with
   `correlation_id = task id`, and returns `202 { task }`.
4. The agent on that host consumes the request, runs the Hyper-V operation, and
   publishes progress messages and a final result to `<hostid>.response`.
5. The backend worker consumes the response, updates the `Task` (and the VM row
   live from the result payload), releases the lock, and refreshes the cache.
6. The frontend's `TaskWatcher` polls `GET /tasks/:id` until it reaches a
   terminal status, then refetches inventory. The task appears in the Recent
   Tasks dock with initiator, progress, status and timestamps.

## RabbitMQ queues (per host)

`<hostid>` is a random 10-char `[A-Za-z0-9]` string assigned when the host is
registered.

| Queue                         | Direction       | Notes                                                      |
| ----------------------------- | --------------- | ---------------------------------------------------------- |
| `<hostid>.request`            | backend → agent | JSON `AgentRequest`, `correlation_id = task id`            |
| `<hostid>.response`           | agent → backend | Task progress + final result                               |
| `<hostid>.agent_status`       | agent → backend | Last value only - version, intervals, hypervisor, liveness |
| `<hostid>.vm_inventory`       | agent → backend | Last value only                                            |
| `<hostid>.host_inventory`     | agent → backend | Last value only - hardware + folders                       |
| `<hostid>.template_inventory` | agent → backend | Last value only                                            |
| `<hostid>.iso_inventory`      | agent → backend | Last value only                                            |

The last-value queues are declared with `x-max-length=1` / `x-overflow=drop-head`,
so a slow consumer always sees the latest snapshot and never a backlog.

## Offline hosts & task timeouts

If a host's `agent_status` goes stale (default **120 s**), the backend marks it
**offline**: its VMs read as `Unknown` and mutating actions return
`409 HOST_OFFLINE`. Stale tasks are moved to `timeout` by the worker (default
**300 s**).

## Concurrency & safety

- **Per-VM lock** in Valkey (`vm:lock:<id>`) - at most one mutating agent task
  per VM at a time; a second attempt gets `409 VM_LOCKED`. Read-only actions
  (e.g. `refresh_status`) skip the lock.
- **Delete tombstones** - a deleted VM's GUID is marked in Valkey briefly so a
  stale in-flight inventory snapshot can't resurrect the row.

## The contracts

- **REST:** `ovc-frontend/docs/api-contract.md` is the source of truth. Responses
  are camelCase JSON; errors are `{ "error": { "code", "message", "details"? } }`.
- **RabbitMQ payloads:** `ovc-backend/app/messaging/` is the source of truth for
  the request/response and inventory shapes the agents implement. The protocol is
  hypervisor-agnostic - future libvirt/KVM agents implement the same contract.
