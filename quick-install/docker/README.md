# Open vCenter - Docker Compose quick install

A batteries-included version of [`docs/docker-compose.md`](../../docs/docker-compose.md):
one `docker-compose.yaml`, published images, everything behind a single
**nginx** entrypoint on `http://localhost` instead of separate per-service
ports for the app itself. Compared to the narrative doc, this adds:

- **nginx as the "ingress"** - one public entrypoint (`:80`) routing `/api/`
  to `ovc-backend` and everything else to `ovc-frontend`, the same
  single-domain pattern documented in `ovc-frontend/README.md`'s nginx
  sketch, so Keycloak's `redirect_uri`, `OVC_CORS_ORIGINS` and
  `OVC_PUBLIC_BASE_URL` only ever have to agree on one origin.
- **Keycloak is Postgres-backed with the `ovc` realm auto-imported** on
  first boot (`keycloak/ovc-realm.json`) - no manual realm/client creation,
  and it survives a `docker compose down` / `up` cycle (the narrative doc's
  `start-dev` with no `--import-realm` doesn't persist anything).
- **`BETTER_AUTH_SECRET` is generated, not hardcoded** - `up.sh` writes it
  to `.env` on first run instead of shipping a fixed value in a public repo.
- **`WEBRDP_ORIGIN` is set explicitly on `ovc-frontend`** - confirmed working
  end-to-end (VMConnect and host RDP both tested) against a real
  `ovc-webrdp`/guacd. Requires an `ovc-frontend` image built after its
  `WEBRDP_ORIGIN` fix (see `docs/kubernetes.md` "ovc-frontend").
- **`OVC_PUBLIC_BASE_URL` is set** - without it, the Setup Agent one-liner /
  agent binary downloads fail outright with `OVC_AGENT_STORAGE=local`.

## Bring it up

```sh
./up.sh
```

Open `http://localhost` and log in with one of the realm's test users (see
below). Tear down with `./down.sh` (`--purge` also drops the data volumes
and `.env`).

## Roles / test logins

| Login                   | Role            | What happens                                                                                                             |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `admin` / `admin`       | `ADMINISTRATOR` | Full access to every cluster/host/folder/VM.                                                                             |
| `operator` / `operator` | `MANAGE_VMS`    | Logs in, sees nothing until a scope grant is added (no admin UI for that yet - it's a `ScopeGrant` row in the database). |
| `noroles` / `noroles`   | _(none)_        | Redirected to `/access-denied`.                                                                                          |

See [Roles](../../docs/kubernetes.md#roles) for what each role actually
grants. Change or remove these test users once you're past a first login -
they're plain-text in `keycloak/ovc-realm.json`.

## Layout

```
docker-compose.yaml    everything: backing services, keycloak, webrdp,
                        backend + worker, frontend, nginx
init-db/01-keycloak.sql   creates the "keycloak" DB on Postgres's first boot
keycloak/ovc-realm.json   the "ovc" realm, imported automatically
nginx/nginx.conf          the single entrypoint (:80 -> frontend / backend)
up.sh / down.sh
```

## Ports

| Service             | Port   | Notes                                               |
| ------------------- | ------ | --------------------------------------------------- |
| **nginx (the app)** | **80** | **This is what you open in a browser.**             |
| postgres            | 5432   |                                                     |
| rabbitmq AMQP       | 5672   |                                                     |
| rabbitmq management | 15672  | web UI, `ovc` / `PleaseChangeMe1`                   |
| valkey              | 6379   |                                                     |
| guacd               | 4822   |                                                     |
| keycloak            | 8080   | admin console (`admin`/`admin`) + `ovc` realm       |
| webrdp (direct)     | 8090   | raw `ovc-webrdp` app - the frontend never uses this |
| backend (direct)    | 8000   | REST API, Swagger at `/api/docs`                    |
| frontend (direct)   | 3000   | debug only - login here fails, see below            |

`frontend` and `backend` stay published on their own ports too, for `curl`
and Swagger - but **log in through `http://localhost` (nginx), not
`:3000`**: the imported realm only registers `http://localhost/*` and
`http://localhost:3000/*` as redirect URIs, and `BETTER_AUTH_URL` /
`OVC_PUBLIC_BASE_URL` are both pinned to the nginx origin, so a session
started on `:3000` will misbehave past the login screen.

## Notes

- **Postgres**: uses the official `postgres:17` image with a named volume
  (`pgdata`), so no `PGDATA` workaround is needed. The `keycloak` database
  is created on first boot by `init-db/01-keycloak.sql`.
- **RabbitMQ**: `hostname: ovc-rabbitmq` pins the Erlang node name so a
  `docker compose up` after a `down` (not `down -v`) keeps the same Mnesia
  DB (users, permissions, vhosts, durable queues).
- **Keycloak**: `--import-realm` only runs on first boot (i.e., against an
  empty `keycloak` database). Edit the client by hand in the admin console
  afterwards, or `./down.sh --purge` and `./up.sh` again to re-trigger the
  import (loses all Postgres data, not just Keycloak's).
- **Agent RabbitMQ URL**: `OVC_AGENT_RABBITMQ_URL` defaults to
  `amqp://localhost:5672/`, which only works if a Hyper-V host's agent runs
  on this same machine. Real Hyper-V hosts are separate Windows machines on
  the LAN - point this at the Docker host's LAN-reachable IP or hostname
  instead (edit it in `docker-compose.yaml` under `ovc-backend`, then
  `docker compose up -d ovc-backend` to pick it up).
- **webrdp / backend / frontend**: published as **public** GHCR images
  (`ghcr.io/claudio-azevedo/ovc-webrdp`, `ovc-backend`, `ovc-frontend`) -
  no registry login needed to pull them.
- **`WEBRDP_ORIGIN`**: read at runtime by `ovc-frontend` on every request
  (see `docs/kubernetes.md` "ovc-frontend").
