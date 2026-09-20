---
title: Docker Compose
layout: default
nav_order: 6
---

# Docker Compose

{: .no_toc }

---

One `docker-compose.yaml` for the whole stack: backing services,
`ovc-backend` (API + worker), `ovc-webrdp` and `ovc-frontend`, using the
published [container images](kubernetes#container-images).

{: .note }

> **Ready to deploy?** [`quick-install/docker`](https://github.com/claudio-azevedo/Open-Virtualization-Manager/tree/main/quick-install/docker)
> is a hardened, ready-to-run version of this - everything behind a single
> nginx entrypoint, Keycloak's realm auto-imported, the session secret
> generated on first run. This page explains the *why*; the linked README
> has the actual compose file and `up.sh` / `down.sh`.

## OIDC login

By default `ovc-backend` and `ovc-frontend` wire up to Keycloak (or any
other OIDC/OAuth2 provider) for real login - see
[OIDC provider](kubernetes#oidc-provider) and [Roles](kubernetes#roles) for
how roles are read and what each one grants.

**No IdP, quick testing only:** set `OVC_AUTH_MODE: stub` on both
`ovc-backend` and `ovc-frontend` instead - every request is then treated as
a fixed admin user, no login and no IdP needed. `ovc-frontend` shows a
standing warning dialog while this is active; never use it beyond a trusted
network. For local UI development the bypass is also available outside
Docker - see [Running in dev mode](running#3-frontend---ovc-frontend).

## Bring it up

```sh
docker compose up -d
curl localhost:8000/api/health   # {"ok":true,"db":true,"cache":true,"rabbit":true}
```

Hosts are added and agents installed from the frontend once you're logged
in - see
[Running in dev mode › Agent](running#4-agent---ovc-agent-hyperv-on-each-hyper-v-host)
for the Add Host / Setup Agent steps.
