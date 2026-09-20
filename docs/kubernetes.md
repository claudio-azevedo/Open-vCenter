---
title: Kubernetes
layout: default
nav_order: 7
---

# Kubernetes

{: .no_toc }

---

Plain manifests for the whole stack, targeting a single-node **k3s** cluster
with no LoadBalancer - every Service is exposed as `NodePort`. Persistent data
uses `ReadWriteOnce` PVCs served by k3s's default `local-path` StorageClass.
Everything below goes in one namespace, `ovc-infra`.

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

PostgreSQL, RabbitMQ and Valkey, each with a PVC. `PGDATA` is set one level
below the mount point so initdb never trips over a non-empty directory
(`lost+found`, etc). `RABBITMQ_NODENAME` pins the Erlang node name so a pod
restart keeps the same Mnesia database.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-postgres-configmap
  namespace: ovc-infra
data:
  POSTGRES_DB: ovc
  POSTGRES_USER: ovc
  POSTGRES_PASSWORD: PleaseChangeMe1
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ovc-postgres-data
  namespace: ovc-infra
spec:
  accessModes: ["ReadWriteOnce"]
  resources: { requests: { storage: 3Gi } }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-postgres
  namespace: ovc-infra
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app: ovc-postgres } }
  template:
    metadata: { labels: { app: ovc-postgres } }
    spec:
      securityContext: { fsGroup: 999 } # local-path PVCs mount root-owned
      containers:
        - name: ovc-postgres
          image: postgres:17
          envFrom: [{ configMapRef: { name: ovc-postgres-configmap } }]
          env: [{ name: PGDATA, value: /var/lib/postgresql/data/pgdata }]
          ports: [{ containerPort: 5432 }]
          volumeMounts: [{ name: data, mountPath: /var/lib/postgresql/data }]
          readinessProbe:
            exec: { command: ["sh", "-c", "pg_isready -U $POSTGRES_USER"] }
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: ovc-postgres-data }
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-postgres-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-postgres }
  ports: [{ name: postgres, port: 5432, targetPort: 5432, nodePort: 30432 }]
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-rabbitmq-configmap
  namespace: ovc-infra
data:
  RABBITMQ_DEFAULT_USER: ovc
  RABBITMQ_DEFAULT_PASS: PleaseChangeMe1
  RABBITMQ_NODENAME: rabbit@localhost
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ovc-rabbitmq-data
  namespace: ovc-infra
spec:
  accessModes: ["ReadWriteOnce"]
  resources: { requests: { storage: 1Gi } }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-rabbitmq
  namespace: ovc-infra
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app: ovc-rabbitmq } }
  template:
    metadata: { labels: { app: ovc-rabbitmq } }
    spec:
      securityContext: { fsGroup: 999, fsGroupChangePolicy: OnRootMismatch }
      containers:
        - name: ovc-rabbitmq
          image: rabbitmq:4-management
          envFrom: [{ configMapRef: { name: ovc-rabbitmq-configmap } }]
          ports: [{ containerPort: 5672 }, { containerPort: 15672 }]
          volumeMounts: [{ name: data, mountPath: /var/lib/rabbitmq }]
          readinessProbe:
            exec: { command: ["rabbitmq-diagnostics", "-q", "check_running"] }
            initialDelaySeconds: 20
            periodSeconds: 15
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: ovc-rabbitmq-data }
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-rabbitmq-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-rabbitmq }
  ports:
    - { name: amqp, port: 5672, targetPort: 5672, nodePort: 30672 }
    - { name: management, port: 15672, targetPort: 15672, nodePort: 31672 }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-valkey-configmap
  namespace: ovc-infra
data:
  VALKEY_ARGS: "--save 60 1 --protected-mode no"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ovc-valkey-data
  namespace: ovc-infra
spec:
  accessModes: ["ReadWriteOnce"]
  resources: { requests: { storage: 1Gi } }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-valkey
  namespace: ovc-infra
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app: ovc-valkey } }
  template:
    metadata: { labels: { app: ovc-valkey } }
    spec:
      securityContext: { fsGroup: 1000 }
      containers:
        - name: ovc-valkey
          image: valkey/valkey:8
          command: ["sh", "-c", "exec valkey-server $VALKEY_ARGS"]
          envFrom: [{ configMapRef: { name: ovc-valkey-configmap } }]
          ports: [{ containerPort: 6379 }]
          volumeMounts: [{ name: data, mountPath: /data }]
          readinessProbe:
            exec: { command: ["valkey-cli", "ping"] }
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: ovc-valkey-data }
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-valkey-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-valkey }
  ports: [{ name: valkey, port: 6379, targetPort: 6379, nodePort: 30379 }]
```

`guacd` isn't listed here - it runs as a sidecar in the `ovc-webrdp` Pod, not as
its own backing service. See [ovc-webrdp](#ovc-webrdp) below.

Per the project convention, all container env vars - passwords included -
live in ConfigMaps for this dev/lab target. For an internet-facing deployment,
move the passwords into `Secret`s and switch `envFrom.configMapRef` to
`secretRef`.

## OIDC provider

`ovc-backend` and `ovc-frontend` below default to real OIDC login against a
provider - any works (Keycloak, Auth0, Okta, Entra ID). Keycloak, as one
example:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-keycloak-configmap
  namespace: ovc-infra
data:
  KC_BOOTSTRAP_ADMIN_USERNAME: admin
  KC_BOOTSTRAP_ADMIN_PASSWORD: admin
  KC_HEALTH_ENABLED: "true"
  KC_HOSTNAME_STRICT: "false" # dev: needed behind a NodePort / plain HTTP
  KC_HTTP_ENABLED: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-keycloak
  namespace: ovc-infra
spec:
  replicas: 1
  selector: { matchLabels: { app: ovc-keycloak } }
  template:
    metadata: { labels: { app: ovc-keycloak } }
    spec:
      containers:
        - name: ovc-keycloak
          image: quay.io/keycloak/keycloak:latest
          args: ["start-dev"]
          envFrom: [{ configMapRef: { name: ovc-keycloak-configmap } }]
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /health/ready, port: 9000 }
            initialDelaySeconds: 20
            periodSeconds: 15
            failureThreshold: 30
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-keycloak-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-keycloak }
  ports: [{ name: http, port: 8080, targetPort: 8080, nodePort: 30080 }]
```

Once it's up, create an `ovc` realm and an `ovc-frontend` client in the admin
console (`admin`/`admin`), and point `ovc-backend`'s `OVC_OIDC_*` /
`ovc-frontend`'s `OIDC_*` ConfigMap values at it (see below).

**No IdP, lab/demo deployment:** skip this section and set `OVC_AUTH_MODE: stub`
in both `ovc-backend`'s and `ovc-frontend`'s ConfigMaps below instead - same
variable, same value on each side, no login and no `ovc-keycloak` needed. See
the commented alternative in each.

## ovc-webrdp

`ovc-guacd` runs as a sidecar in this same Pod, matching `ovc-webrdp`'s own
[`deployment-app.yaml`](https://github.com/claudio-azevedo/Open-vCenter-WebRDP/blob/main/deployment-app.yaml) -
`webrdp` reaches it over `localhost` (same network namespace), and nothing
outside the Pod needs to, so there's no separate `guacd` Service.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-webrdp-configmap
  namespace: ovc-infra
data:
  WEBAPP_CONTEXT: webrdp
  GUACD_HOSTNAME: localhost
  GUACD_PORT: "4822"
  WEBRDP_FRAME_ANCESTORS: "*" # dev: allow the frontend (any origin) to embed the console iframe
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-webrdp
  namespace: ovc-infra
spec:
  replicas: 1
  selector: { matchLabels: { app: ovc-webrdp } }
  template:
    metadata: { labels: { app: ovc-webrdp } }
    spec:
      containers:
        - name: ovc-webrdp
          image: ghcr.io/claudio-azevedo/ovc-webrdp:latest
          envFrom: [{ configMapRef: { name: ovc-webrdp-configmap } }]
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /webrdp/, port: 8080 }
            initialDelaySeconds: 15
            periodSeconds: 10
        - name: ovc-guacd
          image: guacamole/guacd:1.6.0
          ports: [{ containerPort: 4822 }]
          volumeMounts: [{ name: guacd-home, mountPath: /home/guacd }]
          readinessProbe:
            tcpSocket: { port: 4822 }
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: guacd-home
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-webrdp-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-webrdp }
  ports: [{ name: http, port: 8080, targetPort: 8080, nodePort: 30081 }]
```

## ovc-backend

The API and the worker are two Deployments sharing one image and ConfigMap.
`OVC_AGENT_STORAGE=local` needs a PVC (`ovc-backend-uploads`), mounted only on
the API pod, so uploaded `ovc-agent` binaries survive a redeploy.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-backend-configmap
  namespace: ovc-infra
data:
  OVC_ENV: dev
  OVC_CORS_ORIGINS: '["http://localhost:3000"]'
  OVC_DATABASE_URL: postgresql+asyncpg://ovc:PleaseChangeMe1@ovc-postgres-service-nodeport:5432/ovc
  OVC_VALKEY_URL: redis://ovc-valkey-service-nodeport:6379/0
  OVC_RABBITMQ_URL: amqp://ovc:PleaseChangeMe1@ovc-rabbitmq-service-nodeport:5672/
  OVC_RABBITMQ_MGMT_URL: http://ovc-rabbitmq-service-nodeport:15672
  # Base (scheme/host/port/vhost) for the amqp:// URL baked into each host's
  # generated config.ini / install one-liner (Setup Agent tab) - credentials
  # are per-host, added by the backend. OVC_RABBITMQ_URL above is only
  # reachable inside the cluster, but the agent runs on a Hyper-V host
  # outside it, so this needs the NodePort and a hostname/IP the hosts can
  # actually reach - not routable through the Ingress either (see the AMQP
  # note under Ingress below). Falls back to OVC_RABBITMQ_URL (unreachable
  # from outside) if unset.
  OVC_AGENT_RABBITMQ_URL: amqp://rabbitmq.openvcenter.local:30672/
  OVC_AUTH_MODE: oidc
  OVC_OIDC_ISSUER: http://ovc-keycloak-service-nodeport:8080/realms/ovc
  OVC_OIDC_JWKS_URL: http://ovc-keycloak-service-nodeport:8080/realms/ovc/protocol/openid-connect/certs
  OVC_OIDC_AUDIENCE: ovc-frontend
  OVC_OIDC_CLIENT_ID: ovc-frontend
  # Auth bypass alternative (no IdP needed) - same variable, same value as
  # ovc-frontend's below, then you can drop ovc-keycloak entirely.
  # "stub" trusts every request as OVC_STUB_USER_EMAIL, no token checked:
  # OVC_AUTH_MODE: stub
  OVC_AGENT_STORAGE: local
  OVC_AGENT_STORAGE_DIR: /app/uploads/agent-binaries
  OVC_PREFLIGHT: "true"
  OVC_PREFLIGHT_RUN_MIGRATIONS: "true"
  OVC_PREFLIGHT_MANAGE_RABBITMQ_USERS: "true"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ovc-backend-uploads
  namespace: ovc-infra
spec:
  accessModes: ["ReadWriteOnce"]
  resources: { requests: { storage: 5Gi } }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-backend
  namespace: ovc-infra
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app: ovc-backend } }
  template:
    metadata: { labels: { app: ovc-backend } }
    spec:
      containers:
        - name: ovc-backend
          image: ghcr.io/claudio-azevedo/ovc-backend:latest
          command:
            ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
          envFrom: [{ configMapRef: { name: ovc-backend-configmap } }]
          ports: [{ containerPort: 8000 }]
          volumeMounts: [{ name: uploads, mountPath: /app/uploads }]
          readinessProbe:
            httpGet: { path: /api/openapi.json, port: 8000 }
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: uploads
          persistentVolumeClaim: { claimName: ovc-backend-uploads }
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-backend-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-backend }
  ports: [{ name: http, port: 8000, targetPort: 8000, nodePort: 30800 }]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-backend-worker
  namespace: ovc-infra
spec:
  replicas: 1
  selector: { matchLabels: { app: ovc-backend-worker } }
  template:
    metadata: { labels: { app: ovc-backend-worker } }
    spec:
      containers:
        - name: ovc-backend-worker
          image: ghcr.io/claudio-azevedo/ovc-backend:latest
          command: ["python", "-m", "app.worker"]
          envFrom: [{ configMapRef: { name: ovc-backend-configmap } }]
```

## ovc-frontend

Two kinds of config, don't confuse them: **runtime** (this ConfigMap,
changeable without a rebuild) covers `API_URL`, `OIDC_*` and `BETTER_AUTH_*`;
**build-time** config (`WEBRDP_ORIGIN`, a Docker build-arg baked into the
image by `ovc-frontend`'s own GitHub Actions workflow) configures the
`/webrdp/tunnel` proxy target and requires rebuilding the image to change.

`VITE_API_URL` / `VITE_WEBRDP_URL` are left unset on purpose - both default to
relative paths (`/frontend-api/api`, `/webrdp`), correct once a reverse proxy
or Ingress puts the frontend and the API on one domain.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ovc-frontend-configmap
  namespace: ovc-infra
data:
  API_URL: http://ovc-backend-service-nodeport:8000/api
  # Point these at the provider from the OIDC provider section above, or any
  # other OIDC/OAuth2 IdP.
  OIDC_ISSUER: http://ovc-keycloak-service-nodeport:8080/realms/ovc
  OIDC_CLIENT_ID: ovc-frontend
  OIDC_CLIENT_SECRET: <client secret from the IdP>
  BETTER_AUTH_SECRET: <openssl rand -hex 32>
  BETTER_AUTH_URL: http://localhost:30300/frontend-api/auth
  # Auth bypass alternative (no IdP, no login - every request is a fixed
  # admin user). Same variable, same value as ovc-backend's above, then you
  # can drop ovc-keycloak entirely and the OIDC_* / BETTER_AUTH_* vars above
  # aren't required. ovc-frontend shows a standing warning dialog while this
  # is active - never use it beyond a trusted network:
  # OVC_AUTH_MODE: stub
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ovc-frontend
  namespace: ovc-infra
spec:
  replicas: 1
  selector: { matchLabels: { app: ovc-frontend } }
  template:
    metadata: { labels: { app: ovc-frontend } }
    spec:
      containers:
        - name: ovc-frontend
          image: ghcr.io/claudio-azevedo/ovc-frontend:latest
          envFrom: [{ configMapRef: { name: ovc-frontend-configmap } }]
          ports: [{ containerPort: 3000 }]
          readinessProbe:
            httpGet: { path: /, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: ovc-frontend-service-nodeport
  namespace: ovc-infra
spec:
  type: NodePort
  selector: { app: ovc-frontend }
  ports: [{ name: http, port: 3000, targetPort: 3000, nodePort: 30300 }]
```

## NodePorts

| Service             | Node port | Container port | Notes                                                        |
| ------------------- | --------- | -------------- | ------------------------------------------------------------ |
| postgres            | 30432     | 5432           |                                                              |
| rabbitmq AMQP       | 30672     | 5672           |                                                              |
| rabbitmq management | 31672     | 15672          | web UI                                                       |
| valkey              | 30379     | 6379           |                                                              |
| keycloak (optional) | 30080     | 8080           | admin console + realm                                        |
| webrdp              | 30081     | 8080           | browser RDP client, `/webrdp` - `guacd` sidecar, no NodePort |
| backend             | 30800     | 8000           | REST API, Swagger `/api/docs`                                |
| frontend            | 30300     | 3000           |                                                              |

Reach them at `http://<node-ip>:<node-port>`. A `Traefik` (or any) `Ingress`
per web UI is optional on top of this, for name-based routing instead of
raw ports - see below.

## Ingress (optional)

Name-based routing on top of the NodePorts above, once remembering which port
is which gets old. k3s ships **Traefik** as its built-in Ingress controller -
no extra pod to deploy. It listens on the node's ports 80/443 and dispatches
by the `Host` header, so point each hostname below at the node's IP with a
DNS record.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ovc-rabbitmq-ingress
  namespace: ovc-infra
spec:
  ingressClassName: traefik
  rules:
    # AMQP itself (port 5672) is a binary protocol, not HTTP, so it can't be
    # routed by hostname here - clients (including the Hyper-V hosts, via
    # OVC_AGENT_RABBITMQ_URL above) keep using the 30672 NodePort directly,
    # with a DNS record for the node (not this Ingress) if a hostname is
    # wanted over the raw node IP. Only the management web UI goes through
    # Traefik.
    - host: rabbitmq-management.openvcenter.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ovc-rabbitmq-service-nodeport
                port: { name: management }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ovc-keycloak-ingress # optional, only if you deployed ovc-keycloak
  namespace: ovc-infra
spec:
  ingressClassName: traefik
  rules:
    - host: keycloak.openvcenter.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ovc-keycloak-service-nodeport
                port: { name: http }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ovc-webrdp-ingress
  namespace: ovc-infra
spec:
  ingressClassName: traefik
  rules:
    - host: webrdp.openvcenter.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ovc-webrdp-service-nodeport
                port: { name: http }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ovc-frontend-ingress
  namespace: ovc-infra
spec:
  ingressClassName: traefik
  rules:
    - host: frontend.openvcenter.local
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: ovc-backend-service-nodeport
                port: { name: http }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ovc-frontend-service-nodeport
                port: { name: http }
```

| Host                                    | Routes to                                              |
| --------------------------------------- | ------------------------------------------------------ |
| `rabbitmq-management.openvcenter.local` | `ovc-rabbitmq` management UI                           |
| `keycloak.openvcenter.local` (optional) | `ovc-keycloak`                                         |
| `webrdp.openvcenter.local`              | `ovc-webrdp`                                           |
| `frontend.openvcenter.local`            | `ovc-frontend` at `/`, `ovc-backend` at `/api` (debug) |

There's no separate rule for `ovc-guacd` - it's a sidecar with no Service of
its own (see [ovc-webrdp](#ovc-webrdp) above). There's also none for the
Console tab's Guacamole tunnel specifically: the frontend's own server proxies
`/webrdp/tunnel` to `ovc-webrdp` internally, server-to-server between the two
Pods, never through this Ingress - `webrdp.openvcenter.local` above is only for
reaching the rest of the webrdp app directly (which the frontend itself never
uses).

## Apply

Create the namespace first, then everything else - order matters only
loosely (Kubernetes retries until dependencies are ready):

```sh
kubectl create namespace ovc-infra

kubectl apply -f postgres.yaml -f rabbitmq.yaml -f valkey.yaml
kubectl apply -f keycloak.yaml   # optional
kubectl apply -f webrdp.yaml -f backend.yaml -f frontend.yaml
kubectl apply -f ingress.yaml   # optional, name-based routing - see Ingress above

kubectl -n ovc-infra rollout status deploy/ovc-postgres
kubectl -n ovc-infra rollout status deploy/ovc-backend
kubectl -n ovc-infra rollout status deploy/ovc-backend-worker
kubectl -n ovc-infra rollout status deploy/ovc-frontend
```

Open `ovc-frontend` once it's reachable to add a host and install its agent -
see [Running in dev mode › Agent](running#4-agent---ovc-agent-hyperv-on-each-hyper-v-host)
for the Add Host / Setup Agent steps.

Tear down with `kubectl delete namespace ovc-infra` (drops the PVCs too), or
delete individual resources to keep the data volumes.
