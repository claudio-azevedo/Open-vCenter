import {
  AppWindow,
  Braces,
  Cog,
  Database,
  Globe,
  KeyRound,
  MonitorPlay,
  Rabbit,
  Route,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Kind } from "../../lib/stack-model";

export const ICONS: Record<string, LucideIcon> = {
  browser: Globe,
  edge: Route,
  frontend: AppWindow,
  backend: Braces,
  worker: Cog,
  guacd: MonitorPlay,
  keycloak: KeyRound,
  rabbitmq: Rabbit,
  postgres: Database,
  valkey: Zap,
  hosts: Server,
};

/** Kind colours are skin variables (theme.css / site-themes.css). */
export const KIND_COLOR: Record<Kind, string> = {
  external: "var(--kind-external)",
  edge: "var(--kind-edge)",
  app: "var(--kind-app)",
  data: "var(--kind-data)",
  auth: "var(--kind-auth)",
};

/** `color` at `percent` opacity - works with the CSS variables above. */
export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
