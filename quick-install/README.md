# Open vCenter - quick install

One-command, batteries-included deployments of the whole Open vCenter stack,
using the published container images. Pick one:

- **[`docker/`](docker)** - a single `docker-compose.yaml` behind an nginx
  entrypoint (`http://localhost`). Best for a single machine or a quick
  local trial.
- **[`kubernetes/`](kubernetes)** - plain manifests for a k3s single node,
  NodePorts + Traefik Ingress (`*.openvcenter.local`). Best for anything
  that should keep running.

Both auto-import a ready-to-use Keycloak realm (`ovc`, client
`ovc-frontend`) with three test logins:

| Login                     | Role            | What happens                                    |
| ------------------------- | --------------- | -------------------------------------------------- |
| `admin` / `admin`         | `ADMINISTRATOR` | Full access.                                     |
| `operator` / `operator`   | `MANAGE_VMS`    | Logs in, sees nothing until a scope grant exists. |
| `noroles` / `noroles`     | *(none)*        | Redirected to `/access-denied`.                  |

These are for kicking the tyres - see each folder's README for how to
change them, and [Roles](../docs/kubernetes.md#roles) for what the app
actually does with a role once you're past login.

## How this relates to `docs/`

[`docs/docker-compose.md`](../docs/docker-compose.md) and
[`docs/kubernetes.md`](../docs/kubernetes.md) explain the stack piece by
piece, with a manual Keycloak setup left as an exercise. The two folders
here are a ready-to-run version of the same design, with the pieces those
docs leave manual (realm import, a generated session secret, a working VM
Console tab out of the box) already wired up. Read the docs to understand
*why* something is configured a certain way; run quick-install to actually
stand the thing up.

Each folder's own README has the full breakdown of what it adds on top of
the narrative docs, and why.
