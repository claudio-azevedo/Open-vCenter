import { Check, Copy, ExternalLink, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { StackData, StackSummary } from "../../lib/stack-data";
import { COMPONENTS, CONNECTIONS, KIND_LABEL, REQUEST_FLOW, labelFor, type Kind, type Mode } from "../../lib/stack-model";
import { ICONS, KIND_COLOR, tint } from "./visual";

interface Props {
  mode: Mode;
  data: StackData;
  summary: StackSummary;
  selected: string | null;
  step: number | null;
  playing: boolean;
  onStep: (step: number) => void;
  onTogglePlay: () => void;
  onStopFlow: () => void;
  onSelect: (id: string | null) => void;
}

export function DetailPanel(props: Props) {
  return (
    <aside className="flex max-h-[600px] min-h-[320px] flex-col overflow-y-auto border-t border-line @4xl:h-[600px] @4xl:border-t-0">
      {props.step !== null ? (
        <FlowPanel {...props} step={props.step} />
      ) : props.selected ? (
        <ComponentPanel {...props} selected={props.selected} />
      ) : (
        <OverviewPanel {...props} />
      )}
    </aside>
  );
}

function FlowPanel({ step, playing, onStep, onTogglePlay, onStopFlow }: Props & { step: number }) {
  const current = REQUEST_FLOW[step];
  const last = REQUEST_FLOW.length - 1;
  return (
    <div className="flex flex-1 flex-col p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Life of a request</p>
        <button onClick={onStopFlow} aria-label="Stop" className="icon-btn">
          <X size={16} />
        </button>
      </div>
      <ol className="mt-4 space-y-1">
        {REQUEST_FLOW.map((s, i) => (
          <li key={s.title}>
            <button
              onClick={() => onStep(i)}
              data-active={i === step}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 data-[active=true]:bg-surface-2"
            >
              <span
                data-done={i <= step}
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line font-mono text-[10px] text-muted data-[done=true]:border-brand data-[done=true]:text-brand"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className={i === step ? "font-medium text-fg" : "text-muted"}>{s.title}</span>
                {i === step ? <span className="mt-1 block leading-relaxed text-muted">{current.text}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-auto flex items-center gap-2 pt-5">
        <button onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous step" className="icon-btn">
          <SkipBack size={16} />
        </button>
        <button onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"} className="icon-btn">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={() => onStep(Math.min(last, step + 1))} disabled={step === last} aria-label="Next step" className="icon-btn">
          <SkipForward size={16} />
        </button>
        <span className="ml-auto font-mono text-xs text-muted">
          {step + 1} / {REQUEST_FLOW.length}
        </span>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: KIND_COLOR[kind], borderColor: tint(KIND_COLOR[kind], 33) }}
    >
      <span className="size-1.5 rounded-full" style={{ background: KIND_COLOR[kind] }} />
      {KIND_LABEL[kind]}
    </span>
  );
}

function ComponentPanel({ mode, data, selected, onSelect }: Props & { selected: string }) {
  const component = COMPONENTS.find((c) => c.id === selected)!;
  const view = data[mode][selected];
  const Icon = ICONS[selected];
  const [file, setFile] = useState(0);
  useEffect(() => setFile(0), [selected, mode]);

  return (
    <div className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl border"
          style={{
            color: KIND_COLOR[component.kind],
            borderColor: tint(KIND_COLOR[component.kind], 27),
            background: tint(KIND_COLOR[component.kind], 8),
          }}
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-base font-semibold text-fg">{labelFor(component.label, mode)}</h3>
          <p className="text-sm text-muted">{component.tagline}</p>
        </div>
        <button onClick={() => onSelect(null)} aria-label="Close" className="icon-btn">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3">
        <KindBadge kind={component.kind} />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">{component.description}</p>
      {component.repo ? (
        <a href={component.repo} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
          Source on GitHub <ExternalLink size={13} />
        </a>
      ) : null}

      <Connections mode={mode} selected={selected} onSelect={onSelect} />

      {view ? (
        <>
          <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-bg/60 text-[13px]">
            {view.facts.map((fact, i) => (
              <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3 py-2">
                <dt className="text-muted">{fact.label}</dt>
                <dd className="break-words font-mono text-[12px] text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <SourceViewer files={view.files} active={Math.min(file, view.files.length - 1)} onChange={setFile} />
        </>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          Not part of the {mode === "docker" ? "Compose file" : "manifests"} - this runs outside the stack.
        </p>
      )}
    </div>
  );
}

function Connections({ mode, selected, onSelect }: { mode: Mode; selected: string; onSelect: (id: string) => void }) {
  const links = CONNECTIONS.filter((c) => c.source === selected || c.target === selected);
  return (
    <ul className="mt-5 space-y-1">
      {links.map((c) => {
        const outgoing = c.source === selected;
        const other = COMPONENTS.find((x) => x.id === (outgoing ? c.target : c.source))!;
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(other.id)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2"
            >
              <span className="mt-px font-mono text-brand">{outgoing ? "→" : "←"}</span>
              <span className="min-w-0">
                <span className="font-mono text-fg">{labelFor(other.label, mode)}</span>
                <span className="block text-xs text-muted">{labelFor(c.detail, mode)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SourceViewer({
  files,
  active,
  onChange,
}: {
  files: StackData["docker"][string]["files"];
  active: number;
  onChange: (index: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const current = files[active];
  async function copy() {
    await navigator.clipboard.writeText(current.raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        {files.map((f, i) => (
          <button
            key={f.name}
            onClick={() => onChange(i)}
            data-active={i === active}
            className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-muted hover:text-fg data-[active=true]:bg-surface-2 data-[active=true]:text-fg"
          >
            {f.name.split("/").pop()}
          </button>
        ))}
        <button onClick={copy} aria-label="Copy file" className="icon-btn ml-auto shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <p className="border-b border-line px-3 py-1.5 font-mono text-[11px] text-muted">{current.name}</p>
      <div className="code max-h-80 overflow-auto" dangerouslySetInnerHTML={{ __html: current.html }} />
    </div>
  );
}

function OverviewPanel({ mode, summary, onSelect }: Props) {
  const kinds = Object.keys(KIND_LABEL) as Kind[];
  return (
    <div className="flex flex-1 flex-col p-5">
      <p className="eyebrow">{mode === "docker" ? "quick-install/docker" : "quick-install/kubernetes"}</p>
      <h3 className="mt-2 text-lg font-semibold text-fg">
        {mode === "docker" ? "One Compose file, one entrypoint" : "Plain manifests, one namespace"}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {mode === "docker"
          ? `${summary.services} services and ${summary.volumes} named volumes behind a single nginx on :80. Published images from GHCR - run ./up.sh and open http://localhost.`
          : `${summary.manifests} manifests in the ovc-infra namespace: one Deployment and one Service per component, Traefik Ingress for name-based routing, ReadWriteOnce PVCs for data. Run ./apply.sh.`}
      </p>
      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        {(mode === "docker"
          ? [
              [summary.services, "containers"],
              [summary.volumes, "volumes"],
              [1, "port to open"],
            ]
          : [
              [summary.manifests, "manifests"],
              [summary.deployments, "deployments"],
              [summary.ingressHosts, "ingress hosts"],
            ]
        ).map(([value, label]) => (
          <div key={label} className="rounded-xl border border-line bg-bg/60 px-2 py-3">
            <dt className="sr-only">{label}</dt>
            <dd className="font-mono text-xl font-semibold text-fg">{value}</dd>
            <dd className="text-[11px] text-muted">{label}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted">Components</p>
      <ul className="mt-2 grid grid-cols-2 gap-1">
        {COMPONENTS.map((c) => {
          const Icon = ICONS[c.id];
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <Icon size={14} style={{ color: KIND_COLOR[c.kind] }} />
                <span className="truncate">{labelFor(c.label, mode)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
        {kinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-full" style={{ background: KIND_COLOR[kind] }} />
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>
    </div>
  );
}
