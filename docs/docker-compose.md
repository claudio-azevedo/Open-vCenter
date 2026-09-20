---
title: Docker Compose
layout: default
nav_order: 6
---

# Docker Compose

{: .no_toc }

---

One `docker-compose.yaml` for the whole stack: backing services, `ovc-backend`
(API + worker), `ovc-webrdp` and `ovc-frontend`, using the published [container
images](kubernetes#container-images). The example wires `ovc-backend` and
`ovc-frontend` to `ovc-keycloak` for real OIDC login by default - see
[Bring it up](#bring-it-up) for the no-IdP auth-bypass alternative, commented
in both services' `environment` below.

## Compose file

```yaml
services:
  ovc-postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: ovc
      POSTGRES_USER: ovc
      POSTGRES_PASSWORD: PleaseChangeMe1
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ovc"]
      interval: 10s
      timeout: 5s
      retries: 5

  ovc-rabbitmq:
    image: rabbitmq:4-management
    hostname: ovc-rabbitmq # stable Erlang node name across recreates
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ovc
      RABBITMQ_DEFAULT_PASS: PleaseChangeMe1
    ports: ["5672:5672", "15672:15672"]
    volumes: ["rabbitmq:/var/lib/rabbitmq"]

  ovc-valkey:
    image: valkey/valkey:8
    restart: unless-stopped
    command: ["--save", "60", "1"]
    ports: ["6379:6379"]
    volumes: ["valkey:/data"]

  ovc-guacd: # only needed for the VM Console tab
    image: guacamole/guacd:1.6.0
    restart: unless-stopped
    ports: ["4822:4822"]

  # A real OpenID Connect provider. Any OIDC/OAuth2 IdP works (Keycloak,
  # Auth0, Okta, Entra ID, ...); this is just one example. Not needed at all
  # if you use the OVC_AUTH_MODE: stub alternative commented into ovc-backend
  # and ovc-frontend below - drop this service in that case.
  ovc-keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start-dev
    restart: unless-stopped
    ports: ["8080:8080"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin

  ovc-webrdp:
    image: ghcr.io/claudio-azevedo/ovc-webrdp:latest
    restart: unless-stopped
    depends_on: [ovc-guacd]
    ports: ["8090:8080"]
    environment:
      GUACD_HOSTNAME: ovc-guacd
      GUACD_PORT: "4822"
      WEBAPP_CONTEXT: webrdp
      # dev: allow the frontend (any origin) to embed the console iframe
      WEBRDP_FRAME_ANCESTORS: "*"

  ovc-backend:
    image: ghcr.io/claudio-azevedo/ovc-backend:latest
    restart: unless-stopped
    depends_on:
      ovc-postgres: { condition: service_healthy }
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    ports: ["8000:8000"]
    volumes: ["agent-binaries:/app/uploads"]
    environment:
      OVC_DATABASE_URL: postgresql+asyncpg://ovc:PleaseChangeMe1@ovc-postgres:5432/ovc
      OVC_VALKEY_URL: redis://ovc-valkey:6379/0
      OVC_RABBITMQ_URL: amqp://ovc:PleaseChangeMe1@ovc-rabbitmq:5672/
      OVC_RABBITMQ_MGMT_URL: http://ovc-rabbitmq:15672
      OVC_CORS_ORIGINS: '["http://localhost:3000"]'
      OVC_AUTH_MODE: oidc
      OVC_OIDC_ISSUER: http://localhost:8080/realms/ovc
      OVC_OIDC_JWKS_URL: http://ovc-keycloak:8080/realms/ovc/protocol/openid-connect/certs
      OVC_OIDC_AUDIENCE: ovc-frontend
      OVC_OIDC_CLIENT_ID: ovc-frontend
      # Auth bypass alternative (no IdP needed) - same variable, same value
      # as ovc-frontend's below, then you can drop ovc-keycloak entirely.
      # "stub" trusts every request as OVC_STUB_USER_EMAIL, no token checked:
      # OVC_AUTH_MODE: stub

  ovc-backend-worker:
    image: ghcr.io/claudio-azevedo/ovc-backend:latest
    restart: unless-stopped
    depends_on: [ovc-backend]
    command: ["python", "-m", "app.worker"]
    environment:
      OVC_DATABASE_URL: postgresql+asyncpg://ovc:PleaseChangeMe1@ovc-postgres:5432/ovc
      OVC_VALKEY_URL: redis://ovc-valkey:6379/0
      OVC_RABBITMQ_URL: amqp://ovc:PleaseChangeMe1@ovc-rabbitmq:5672/
      OVC_RABBITMQ_MGMT_URL: http://ovc-rabbitmq:15672

  ovc-frontend:
    image: ghcr.io/claudio-azevedo/ovc-frontend:latest
    restart: unless-stopped
    depends_on: [ovc-backend]
    ports: ["3000:3000"]
    environment:
      API_URL: http://ovc-backend:8000/api
      OIDC_ISSUER: http://localhost:8080/realms/ovc
      OIDC_CLIENT_ID: ovc-frontend
      OIDC_CLIENT_SECRET: <client secret from the IdP>
      BETTER_AUTH_SECRET: <openssl rand -hex 32>
      BETTER_AUTH_URL: http://localhost:3000/frontend-api/auth
      # Auth bypass alternative (no IdP, no login - every request is a fixed
      # admin user). Same variable, same value as ovc-backend's above, then
      # you can drop ovc-keycloak entirely. ovc-frontend shows a standing
      # warning dialog while this is active - never use it beyond a trusted
      # network:
      # OVC_AUTH_MODE: stub

volumes:
  pgdata:
  rabbitmq:
  valkey:
  agent-binaries:
```

## Bring it up

```sh
docker compose up -d
curl localhost:8000/api/health   # {"ok":true,"db":true,"cache":true,"rabbit":true}
```

By default this wires `ovc-backend` and `ovc-frontend` to `ovc-keycloak` for real
OIDC login. Open `http://localhost:8080`, create an `ovc` realm and an
`ovc-frontend` client in it (confidential, standard flow), then set
`ovc-frontend`'s `OIDC_CLIENT_SECRET` and `BETTER_AUTH_SECRET` to real values and
restart it. Open `http://localhost:3000` and log in.

Hosts are added and agents installed from the frontend once you're logged in -
see [Running in dev mode › Agent](running#4-agent---ovc-agent-hyperv-on-each-hyper-v-host)
for the Add Host / Setup Agent steps.

**No IdP, quick testing only:** comment out the `OVC_OIDC_*` / `OIDC_*` block in
`ovc-backend` and `ovc-frontend` above and uncomment `OVC_AUTH_MODE: stub` in
both instead - same variable, same value on each side - every request is then
treated as a fixed admin user, no login and no `ovc-keycloak` needed.
`ovc-frontend` shows a standing warning dialog while this is active; never
expose an instance running this way beyond a trusted network. For local UI
development the bypass is also available outside Docker - see
[Running in dev mode](running#3-frontend---ovc-frontend).
