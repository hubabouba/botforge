/**
 * Shared bot-hosting types (client + server).
 *
 * Deployment status mirrors the `project_deployments.status` check in
 * supabase/hosting.sql. "active" (occupies a machine slot) = starting | running
 * | stopping; the rest are terminal-ish resting states.
 */

export type DeploymentStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed"
  | "crash_looping"
  | "killed";

/** Statuses that occupy a machine slot (count against the concurrency cap). */
export const ACTIVE_STATUSES: DeploymentStatus[] = ["starting", "running", "stopping"];

export interface DeploymentView {
  status: DeploymentStatus;
  /** Machine start time (epoch ms) while running, else null. */
  startedAt: number | null;
  restartCount: number;
  /** Monthly runtime budget usage, for the "X of Y hours" UI. */
  usage: { usedSeconds: number; limitSeconds: number } | null;
  /** Which secret keys are set (names only — never values). */
  secretNames: string[];
  /** The env-var name this platform requires (TELEGRAM_TOKEN / DISCORD_TOKEN). */
  requiredSecret: string;
}

export interface LogLine {
  id: number;
  stream: "stdout" | "stderr" | "system";
  line: string;
  at: number; // epoch ms
}
