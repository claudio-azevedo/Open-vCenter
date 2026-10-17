// Hand-curated model of the Open vCenter stack: what each component is, how
// the components connect, where they sit in the diagram and how a request
// flows through them. Image, ports, volumes and the YAML itself are not
// here - stack-data.ts reads those from the real deployment files.

export type Mode = "docker" | "k8s";

export type Kind = "external" | "edge" | "app" | "data" | "auth";

export const KIND_LABEL: Record<Kind, string> = {
  external: "Outside the stack",
  edge: "Entrypoint",
  app: "Open vCenter",
  data: "Backing service",
  auth: "Identity",
};

export const GITHUB = "https://github.com/openvcenter/Open-vCenter";
export const DEMO = "https://demo.openvcenter.com/";

export interface ComponentMeta {
  id: string;
  /** Per-mode label; a string applies to both modes. */
  label: string | Record<Mode, string>;
  kind: Kind;
  tagline: string;
  description: string;
  repo?: string;
  /** Compose service names (docker) or quick-install/kubernetes files (k8s). */
  sources: Partial<Record<Mode, string[]>>;
}

export const COMPONENTS: ComponentMeta[] = [
  {
    id: "browser",
    label: "Browser",
    kind: "external",
    tagline: "Operators",
    description:
      "The browser only ever talks to ovc-frontend - never to the backend, guacd or RabbitMQ. It logs in against the OIDC provider and gets a session cookie.",
    sources: {},
  },
  {
    id: "edge",
    label: { docker: "nginx", k8s: "Traefik Ingress" },
    kind: "edge",
    tagline: "Single entrypoint",
    description:
      "One origin for everything: /api/ goes to ovc-backend (Swagger, agent binary downloads), everything else to ovc-frontend. Keycloak redirect URIs, CORS and OVC_PUBLIC_BASE_URL only have to agree on that one origin.",
    sources: {
      docker: ["nginx", "nginx/nginx.conf"],
      k8s: ["ovc-frontend/ingress.yaml", "ovc-keycloak/ingress.yaml", "ovc-rabbitmq/ingress.yaml"],
    },
  },
  {
    id: "frontend",
    label: "ovc-frontend",
    kind: "app",
    tagline: "React 19 · SSR web UI",
    description:
      "The web console and the only REST client. Its server proxies /api/* to the backend with the OIDC bearer token attached, and serves the Guacamole tunnel for the VM consoles itself.",
    repo: "https://github.com/openvcenter/Open-vCenter-Frontend",
    sources: {
      docker: ["ovc-frontend"],
      k8s: [
        "ovc-frontend/deployment.yaml",
        "ovc-frontend/service.yaml",
        "ovc-frontend/configmap.yaml",
        "ovc-frontend/ingress.yaml",
      ],
    },
  },
  {
    id: "backend",
    label: "ovc-backend",
    kind: "app",
    tagline: "FastAPI · REST API",
    description:
      "Serves /api/*, enforces RBAC, records a Task for every mutating operation and publishes it to the host's RabbitMQ queue. It never talks to a host directly and never blocks on an agent.",
    repo: "https://github.com/openvcenter/Open-vCenter-Backend",
    sources: {
      docker: ["ovc-backend"],
      k8s: [
        "ovc-backend/deployment.yaml",
        "ovc-backend/service.yaml",
        "ovc-backend/configmap.yaml",
        "ovc-backend/pvc.yaml",
      ],
    },
  },
  {
    id: "worker",
    label: "ovc-backend-worker",
    kind: "app",
    tagline: "RabbitMQ consumer",
    description:
      "Same image as the API, different command. Consumes every host's response and inventory queues, applies results to PostgreSQL and the Valkey cache, and times out stale tasks.",
    repo: "https://github.com/openvcenter/Open-vCenter-Backend",
    sources: {
      docker: ["ovc-backend-worker"],
      k8s: ["ovc-backend/deployment-worker.yaml", "ovc-backend/configmap.yaml"],
    },
  },
  {
    id: "guacd",
    label: "guacd",
    kind: "data",
    tagline: "Console proxy",
    description:
      "The Guacamole proxy daemon behind the HTML5 VM and host consoles. Only ovc-frontend's server reaches it; guacd speaks RDP (3389) and Hyper-V vmconnect (2179) to the hosts.",
    sources: {
      docker: ["ovc-guacd"],
      k8s: ["ovc-guacd/deployment.yaml", "ovc-guacd/service.yaml"],
    },
  },
  {
    id: "keycloak",
    label: "Keycloak",
    kind: "auth",
    tagline: "OIDC · optional",
    description:
      "Any OpenID Connect provider works - Keycloak, Auth0, Okta, Entra ID. The quick install imports an \"ovc\" realm with three roles and test users. The frontend exchanges login codes with it; the backend verifies tokens through its JWKS.",
    sources: {
      docker: ["ovc-keycloak"],
      k8s: [
        "ovc-keycloak/deployment.yaml",
        "ovc-keycloak/service.yaml",
        "ovc-keycloak/configmap.yaml",
        "ovc-keycloak/configmap-realm.yaml",
        "ovc-keycloak/ingress.yaml",
      ],
    },
  },
  {
    id: "rabbitmq",
    label: "RabbitMQ",
    kind: "data",
    tagline: "Message bus",
    description:
      "Per-host queues carry requests to the agents and results back. Last-value queues (x-max-length=1) hold the latest inventory snapshot, so a slow consumer never sees a backlog.",
    sources: {
      docker: ["ovc-rabbitmq"],
      k8s: [
        "ovc-rabbitmq/deployment.yaml",
        "ovc-rabbitmq/service.yaml",
        "ovc-rabbitmq/configmap.yaml",
        "ovc-rabbitmq/pvc.yaml",
        "ovc-rabbitmq/ingress.yaml",
      ],
    },
  },
  {
    id: "postgres",
    label: "PostgreSQL",
    kind: "data",
    tagline: "System of record",
    description:
      "Clusters, hosts, folders, VMs, templates, ISOs, tasks (with the raw agent request and response) and RBAC scope grants. Schema managed by Alembic. Keycloak keeps its own database on the same server.",
    sources: {
      docker: ["ovc-postgres"],
      k8s: [
        "ovc-postgres/deployment.yaml",
        "ovc-postgres/service.yaml",
        "ovc-postgres/configmap.yaml",
        "ovc-postgres/configmap-initdb.yaml",
        "ovc-postgres/pvc.yaml",
      ],
    },
  },
  {
    id: "valkey",
    label: "Valkey",
    kind: "data",
    tagline: "Cache & locks",
    description:
      "Agent liveness, per-VM mutation locks (one mutating task per VM at a time), delete tombstones and cached inventory reads. Redis 7+ works too.",
    sources: {
      docker: ["ovc-valkey"],
      k8s: [
        "ovc-valkey/deployment.yaml",
        "ovc-valkey/service.yaml",
        "ovc-valkey/configmap.yaml",
        "ovc-valkey/pvc.yaml",
      ],
    },
  },
  {
    id: "hosts",
    label: "Hyper-V hosts",
    kind: "external",
    tagline: "ovc-agent per host",
    description:
      "A Go Windows service on each Hyper-V host. It connects out to RabbitMQ, runs the work with PowerShell / Hyper-V cmdlets in a persistent job queue, and publishes progress, results and periodic inventory back. It self-upgrades, downloading new binaries through /api.",
    repo: "https://github.com/openvcenter/Open-vCenter-Agent-HyperV",
    sources: {},
  },
];

export type Side = "top" | "right" | "bottom" | "left";

export interface Connection {
  id: string;
  source: string;
  target: string;
  /** Short on-diagram label. */
  label: string | Record<Mode, string>;
  /** What actually travels over it, shown in the side panel. */
  detail: string | Record<Mode, string>;
  /** Handle sides when the automatic choice would cut through a node. */
  route?: [Side, Side];
}

export const CONNECTIONS: Connection[] = [
  { id: "browser-edge", source: "browser", target: "edge", label: "HTTP", detail: { docker: "HTTP on :80 - the only port a user opens", k8s: "HTTP to frontend.openvcenter.local through Traefik" } },
  { id: "browser-keycloak", source: "browser", target: "keycloak", label: "OIDC login", detail: { docker: "OIDC login redirect, :8080", k8s: "OIDC login redirect, keycloak.openvcenter.local" } },
  { id: "edge-frontend", source: "edge", target: "frontend", label: "/", detail: "Everything except /api" },
  { id: "edge-backend", source: "edge", target: "backend", label: "/api", detail: "/api - Swagger and the agent binary downloads" },
  { id: "frontend-backend", source: "frontend", target: "backend", label: "REST", detail: "REST /api/* with the OIDC bearer token attached server-side" },
  { id: "frontend-guacd", source: "frontend", target: "guacd", label: ":4822", detail: "Guacamole protocol on :4822 (GUACD_URL)" },
  { id: "guacd-hosts", source: "guacd", target: "hosts", label: "RDP · vmconnect", detail: "RDP (3389) to the host, Hyper-V vmconnect (2179) to the VMs" },
  { id: "backend-rabbitmq", source: "backend", target: "rabbitmq", label: "publish", detail: "Publishes AgentRequest to <hostid>.request" },
  { id: "rabbitmq-hosts", source: "rabbitmq", target: "hosts", label: { docker: "AMQP :5672", k8s: "AMQP :30672" }, detail: { docker: "AMQP on :5672 - the agents connect from outside Docker", k8s: "AMQP on NodePort 30672 - the agents connect from outside the cluster" } },
  { id: "rabbitmq-worker", source: "rabbitmq", target: "worker", label: "consume", detail: "Consumes <hostid>.response and the last-value inventory queues" },
  { id: "backend-postgres", source: "backend", target: "postgres", label: "SQL", detail: "System of record (asyncpg), migrations on start" },
  { id: "backend-valkey", source: "backend", target: "valkey", label: "locks · cache", detail: "Per-VM locks, agent liveness, cached reads" },
  { id: "worker-postgres", source: "worker", target: "postgres", label: "apply results", detail: "Updates tasks and inventory from agent results", route: ["bottom", "bottom"] },
  { id: "worker-valkey", source: "worker", target: "valkey", label: "release lock", detail: "Releases VM locks, refreshes the cache" },
  { id: "keycloak-postgres", source: "keycloak", target: "postgres", label: "keycloak DB", detail: "Keycloak's own \"keycloak\" database" },
];

/** Diagram coordinates (top-left of each node). Shared by both modes. */
export const POSITIONS: Record<string, { x: number; y: number }> = {
  browser: { x: 0, y: 0 },
  edge: { x: 310, y: 0 },
  frontend: { x: 620, y: 0 },
  guacd: { x: 930, y: 0 },
  keycloak: { x: 0, y: 250 },
  backend: { x: 310, y: 250 },
  rabbitmq: { x: 620, y: 250 },
  hosts: { x: 930, y: 250 },
  postgres: { x: 0, y: 500 },
  valkey: { x: 310, y: 500 },
  worker: { x: 620, y: 500 },
};

/** Picks the facing sides of two nodes from their relative position. */
export function routeFor(connection: Connection): [Side, Side] {
  if (connection.route) return connection.route;
  const a = POSITIONS[connection.source];
  const b = POSITIONS[connection.target];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) return dx > 0 ? ["right", "left"] : ["left", "right"];
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

export interface FlowStep {
  title: string;
  text: string;
  /** Connection ids; a leading "~" plays the packet against the arrow. */
  connections: string[];
}

/** "How a request flows" from docs/architecture.md, as diagram steps. */
export const REQUEST_FLOW: FlowStep[] = [
  {
    title: "An operator clicks Start",
    text: "The UI optimistically flips the VM to Starting and calls POST /api/vms/{id}/actions/start - on ovc-frontend, the only thing the browser ever talks to.",
    connections: ["browser-edge", "edge-frontend"],
  },
  {
    title: "Frontend → backend",
    text: "The frontend server proxies the call to ovc-backend and attaches the OIDC bearer token. No identity or scope is ever sent from the browser.",
    connections: ["frontend-backend"],
  },
  {
    title: "Lock the VM, record a Task",
    text: "The API takes the per-VM lock in Valkey and writes a Task row (queued) in PostgreSQL. A second mutation on the same VM now gets 409 VM_LOCKED.",
    connections: ["backend-valkey", "backend-postgres"],
  },
  {
    title: "Publish to the host's queue",
    text: "An AgentRequest goes to <hostid>.request with correlation_id = task id, and the API returns 202 { task } right away. The host's agent consumes it.",
    connections: ["backend-rabbitmq", "rabbitmq-hosts"],
  },
  {
    title: "The agent does the work",
    text: "ovc-agent runs the Hyper-V operation and publishes progress and the final result to <hostid>.response, where the backend worker picks it up.",
    connections: ["~rabbitmq-hosts", "rabbitmq-worker"],
  },
  {
    title: "The worker applies the result",
    text: "The Task and the VM row are updated from the result payload, the lock is released and the cache refreshed.",
    connections: ["worker-postgres", "worker-valkey"],
  },
  {
    title: "The UI catches up",
    text: "The frontend's TaskWatcher polls GET /tasks/:id until it is done, refetches inventory, and the task shows up in the Recent Tasks dock.",
    connections: ["browser-edge", "edge-frontend", "frontend-backend"],
  },
];

export function labelFor(value: string | Record<Mode, string>, mode: Mode): string {
  return typeof value === "string" ? value : value[mode];
}
