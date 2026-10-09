// Build-time only: reads the repository's quick-install/ files and turns them
// into what the stack explorer shows for each component - key facts plus
// syntax-highlighted source.
import { createHighlighter } from "shiki";
import { parse, parseAllDocuments } from "yaml";
import { COMPONENTS, type Mode } from "./stack-model";

export interface Fact {
  label: string;
  value: string;
}

export interface SourceFile {
  name: string;
  html: string;
  raw: string;
}

export interface ComponentView {
  facts: Fact[];
  files: SourceFile[];
}

export type StackData = Record<Mode, Record<string, ComponentView>>;

// quick-install/ sits next to website/ in the repository (see server.fs.allow
// in astro.config.mjs for the dev server).
const dockerFiles = import.meta.glob<string>(
  ["../../../quick-install/docker/docker-compose.yaml", "../../../quick-install/docker/nginx/nginx.conf"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);
const k8sFiles = import.meta.glob<string>("../../../quick-install/kubernetes/**/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});

const byName = (files: Record<string, string>, prefix: string) =>
  Object.fromEntries(Object.entries(files).map(([path, raw]) => [path.slice(prefix.length), raw]));

const docker = byName(dockerFiles, "../../../quick-install/docker/");
const k8s = byName(k8sFiles, "../../../quick-install/kubernetes/");

const highlighter = await createHighlighter({
  themes: ["github-dark-default"],
  langs: ["yaml", "nginx"],
});

function file(name: string, raw: string): SourceFile {
  const lang = name.endsWith(".conf") ? "nginx" : "yaml";
  return {
    name,
    raw,
    html: highlighter.codeToHtml(raw.trimEnd(), { lang, theme: "github-dark-default" }),
  };
}

// --- Docker Compose -------------------------------------------------------

const composeText = docker["docker-compose.yaml"];
const compose = parse(composeText) as {
  services: Record<string, Record<string, unknown>>;
  volumes?: Record<string, unknown>;
};

/** The service's block from docker-compose.yaml, with the comment above it. */
function serviceBlock(service: string): string {
  const lines = composeText.split("\n");
  let start = lines.findIndex((line) => line === `  ${service}:`);
  let end = start + 1;
  while (end < lines.length && !/^ {0,2}\S/.test(lines[end])) end++;
  while (start > 0 && /^\s*#/.test(lines[start - 1])) start--;
  return lines.slice(start, end).join("\n");
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value && typeof value === "object" ? Object.keys(value) : [];

function dockerView(sources: string[]): ComponentView {
  const facts: Fact[] = [];
  const files: SourceFile[] = [];
  for (const source of sources) {
    const service = compose.services[source];
    if (!service) {
      files.push(file(source, docker[source]));
      continue;
    }
    facts.push({ label: "Service", value: source });
    facts.push({ label: "Image", value: String(service.image) });
    const command = service.command;
    if (command) facts.push({ label: "Command", value: list(command).join(" ") });
    const ports = list(service.ports);
    facts.push({
      label: "Ports",
      value: ports.length ? ports.join(", ") : "none published - internal network only",
    });
    const volumes = list(service.volumes);
    if (volumes.length) facts.push({ label: "Volumes", value: volumes.join(", ") });
    const dependsOn = list(service.depends_on);
    if (dependsOn.length) facts.push({ label: "Depends on", value: dependsOn.join(", ") });
    files.unshift(file(`docker-compose.yaml › ${source}`, serviceBlock(source)));
  }
  return { facts, files };
}

// --- Kubernetes -----------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function k8sFacts(doc: any): Fact[] {
  const name = doc.metadata?.name;
  switch (doc.kind) {
    case "Deployment": {
      const spec = doc.spec.template.spec;
      const facts: Fact[] = [{ label: "Deployment", value: `${name} · ${doc.spec.replicas ?? 1} replica` }];
      for (const c of spec.containers) {
        facts.push({ label: "Image", value: c.image });
        const ports = (c.ports ?? []).map((p: any) => p.containerPort);
        if (ports.length) facts.push({ label: "Container port", value: ports.join(", ") });
        for (const ref of c.envFrom ?? []) {
          if (ref.secretRef) facts.push({ label: "Secret", value: `${ref.secretRef.name} (created by apply.sh)` });
        }
      }
      return facts;
    }
    case "Service": {
      const ports = doc.spec.ports
        .map((p: any) => (p.nodePort ? `${p.port} → NodePort ${p.nodePort}` : String(p.port)))
        .join(", ");
      return [{ label: "Service", value: `${name} · ${doc.spec.type ?? "ClusterIP"} · ${ports}` }];
    }
    case "PersistentVolumeClaim":
      return [{ label: "PVC", value: `${name} · ${doc.spec.resources.requests.storage}` }];
    case "Ingress":
      return doc.spec.rules.map((rule: any) => ({
        label: "Ingress",
        value: `${rule.host} → ${rule.http.paths
          .map((p: any) => `${p.path} ${p.backend.service.name.replace(/-service.*$/, "")}`)
          .join(", ")}`,
      }));
    case "ConfigMap":
      return [{ label: "ConfigMap", value: name }];
    default:
      return [];
  }
}

const KIND_ORDER = ["Deployment", "Image", "Container port", "Service", "Ingress", "PVC", "ConfigMap", "Secret"];

function k8sView(sources: string[]): ComponentView {
  const facts = sources
    .flatMap((source) =>
      parseAllDocuments(k8s[source]).flatMap((doc) => k8sFacts(doc.toJS())),
    )
    .sort((a, b) => KIND_ORDER.indexOf(a.label) - KIND_ORDER.indexOf(b.label));
  return { facts, files: sources.map((source) => file(source, k8s[source])) };
}

// --------------------------------------------------------------------------

export function loadStackData(): StackData {
  const data: StackData = { docker: {}, k8s: {} };
  for (const component of COMPONENTS) {
    if (component.sources.docker) data.docker[component.id] = dockerView(component.sources.docker);
    if (component.sources.k8s) data.k8s[component.id] = k8sView(component.sources.k8s);
  }
  return data;
}

/** Overall counts shown in the explorer. */
export function stackSummary() {
  const docs = Object.values(k8s).flatMap((raw) => parseAllDocuments(raw).map((doc) => doc.toJS()));
  return {
    services: Object.keys(compose.services).length,
    volumes: Object.keys(compose.volumes ?? {}).length,
    manifests: Object.keys(k8s).length,
    deployments: docs.filter((doc) => doc?.kind === "Deployment").length,
    ingressHosts: docs.filter((doc) => doc?.kind === "Ingress").flatMap((doc) => doc.spec.rules).length,
  };
}

export type StackSummary = ReturnType<typeof stackSummary>;
