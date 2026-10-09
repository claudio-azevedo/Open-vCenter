import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Container, Ship } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  COMPONENTS,
  CONNECTIONS,
  POSITIONS,
  REQUEST_FLOW,
  labelFor,
  routeFor,
  type Kind,
  type Mode,
  type Side,
} from "../../lib/stack-model";
import type { StackData, StackSummary } from "../../lib/stack-data";
import { DetailPanel } from "./DetailPanel";
import { ICONS, KIND_COLOR } from "./visual";

type Emphasis = "idle" | "focus" | "related" | "dim";

type StackNodeData = {
  id: string;
  label: string;
  tagline: string;
  kind: Kind;
  emphasis: Emphasis;
};

type FlowEdgeData = {
  label: string;
  emphasis: Emphasis;
  /** Packet direction while emphasised: 1 along the arrow, -1 against it. */
  packet: 0 | 1 | -1;
};

/** Arrowhead colours: the same skin variables as the .flow-edge strokes. */
const EDGE_COLOR: Record<Emphasis, string> = {
  idle: "var(--flow-edge-idle)",
  focus: "var(--flow-edge-lit)",
  related: "var(--flow-edge-lit)",
  dim: "var(--flow-edge-dim)",
};

type StackNode = Node<StackNodeData, "stack">;
type FlowEdge = Edge<FlowEdgeData, "flow">;

const SIDES: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function StackNodeCard({ data }: NodeProps<StackNode>) {
  const Icon = ICONS[data.id];
  const color = KIND_COLOR[data.kind];
  return (
    <div
      className="stack-node"
      data-emphasis={data.emphasis}
      style={{ "--kind": color } as React.CSSProperties}
    >
      {(Object.keys(SIDES) as Side[]).map((side) => (
        <Fragment key={side}>
          <Handle type="source" id={`${side}-s`} position={SIDES[side]} isConnectable={false} />
          <Handle type="target" id={`${side}-t`} position={SIDES[side]} isConnectable={false} />
        </Fragment>
      ))}
      <span className="stack-node-icon">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-[13px] font-semibold text-fg">{data.label}</span>
        <span className="block truncate text-xs text-muted">{data.tagline}</span>
      </span>
    </div>
  );
}

function FlowEdgeLine(props: EdgeProps<FlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const emphasis = data?.emphasis ?? "idle";
  const lit = emphasis === "focus" || emphasis === "related";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className="flow-edge" data-emphasis={emphasis} />
      {data?.packet ? (
        <circle r={5} className="flow-packet">
          <animateMotion
            dur="1.6s"
            repeatCount="indefinite"
            path={path}
            keyPoints={data.packet === 1 ? "0;1" : "1;0"}
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      ) : null}
      {lit && data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="flow-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { stack: StackNodeCard };
const edgeTypes = { flow: FlowEdgeLine };

const STEP_MS = 5200;

export default function StackExplorer({
  data,
  summary,
  initialMode = "docker",
}: {
  data: StackData;
  summary: StackSummary;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || step === null) return;
    const timer = window.setTimeout(() => {
      setStep((current) => (current === null ? null : (current + 1) % REQUEST_FLOW.length));
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  // What is lit: the current request-flow step, or the selected node and its neighbours.
  const lit = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Map<string, 1 | -1>();
    if (step !== null) {
      for (const ref of REQUEST_FLOW[step].connections) {
        const reverse = ref.startsWith("~");
        const connection = CONNECTIONS.find((c) => c.id === ref.replace("~", ""))!;
        edges.set(connection.id, reverse ? -1 : 1);
        nodes.add(connection.source).add(connection.target);
      }
    } else if (selected) {
      nodes.add(selected);
      for (const c of CONNECTIONS) {
        if (c.source === selected || c.target === selected) {
          edges.set(c.id, 1);
          nodes.add(c.source).add(c.target);
        }
      }
    }
    return { nodes, edges, active: step !== null || selected !== null };
  }, [step, selected]);

  const nodes: StackNode[] = useMemo(
    () =>
      COMPONENTS.map((c) => ({
        id: c.id,
        type: "stack",
        position: POSITIONS[c.id],
        data: {
          id: c.id,
          label: labelFor(c.label, mode),
          tagline: c.tagline,
          kind: c.kind,
          emphasis: !lit.active
            ? "idle"
            : c.id === selected && step === null
              ? "focus"
              : lit.nodes.has(c.id)
                ? "related"
                : "dim",
        },
      })),
    [mode, lit, selected, step],
  );

  const edges: FlowEdge[] = useMemo(
    () =>
      CONNECTIONS.map((c) => {
        const direction = lit.edges.get(c.id);
        const [from, to] = routeFor(c);
        const emphasis: Emphasis = !lit.active ? "idle" : direction ? (step !== null ? "focus" : "related") : "dim";
        return {
          id: c.id,
          type: "flow",
          source: c.source,
          target: c.target,
          sourceHandle: `${from}-s`,
          targetHandle: `${to}-t`,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: EDGE_COLOR[emphasis] },
          data: {
            label: labelFor(c.label, mode),
            emphasis,
            packet: step !== null && direction ? direction : 0,
          },
        };
      }),
    [mode, lit, step],
  );

  function startFlow() {
    setSelected(null);
    setStep(0);
    setPlaying(true);
  }

  function stopFlow() {
    setStep(null);
    setPlaying(false);
  }

  return (
    <div className="stack-explorer window @container">
      {/* Only the retro skins show the title bar (see .window-titlebar). */}
      <div className="window-titlebar" aria-hidden="true">
        <span className="truncate">
          Stack Explorer - {mode === "docker" ? "quick-install/docker" : "quick-install/kubernetes"}
        </span>
        <span className="window-titlebar-buttons">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="window-body">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div role="tablist" aria-label="Deployment" className="flex rounded-lg border border-line bg-bg p-1">
          {(
            [
              ["docker", "Docker Compose", Container, `${summary.services} services`],
              ["k8s", "Kubernetes", Ship, `${summary.manifests} manifests`],
            ] as const
          ).map(([value, label, Icon, count]) => (
            <button
              key={value}
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg aria-selected:bg-surface-2 aria-selected:text-fg"
            >
              <Icon size={16} />
              {label}
              <span className="hidden font-mono text-[11px] text-muted @xl:inline">{count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {step === null ? (
            <button onClick={startFlow} className="btn-primary !py-2 text-sm">
              ▶ Follow a request
            </button>
          ) : (
            <button onClick={stopFlow} className="btn-ghost !py-2 text-sm">
              ■ Stop
            </button>
          )}
        </div>
      </div>

      <div className="grid @4xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative h-[420px] border-line @2xl:h-[520px] @4xl:h-[600px] @4xl:border-r">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.06 }}
            minZoom={0.2}
            maxZoom={1.6}
            nodesConnectable={false}
            nodesDraggable
            zoomOnScroll={false}
            preventScrolling={false}
            onNodeClick={(_, node) => {
              stopFlow();
              setSelected((current) => (current === node.id ? null : node.id));
            }}
            onPaneClick={() => setSelected(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--flow-dot)" />
            <Controls showInteractive={false} position="top-right" orientation="horizontal" />
          </ReactFlow>
          {step === null && !selected ? (
            <p className="pointer-events-none absolute bottom-3 left-4 hidden text-xs text-muted @xl:block">
              Click a component · drag to rearrange
            </p>
          ) : null}
        </div>
        <DetailPanel
          mode={mode}
          data={data}
          summary={summary}
          selected={selected}
          step={step}
          playing={playing}
          onStep={(next) => {
            setPlaying(false);
            setStep(next);
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
          onStopFlow={stopFlow}
          onSelect={setSelected}
        />
      </div>
      </div>
    </div>
  );
}
