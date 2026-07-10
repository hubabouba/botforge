/**
 * Auth for the internal hosting callbacks (files / logs / exit). The caller is a
 * running Fly Machine, not a browser session, so there's no Supabase cookie —
 * it presents its run-scoped bearer token. We hash it and look up the matching
 * deployment via the service-role admin client (RLS bypassed on purpose).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashRunToken } from "./runToken";
import { getDeploymentByRunHash, type DeploymentRow } from "./deployments";

export interface RunContext {
  admin: SupabaseClient;
  dep: DeploymentRow;
}

/** Returns the run's deployment context, or null if the token is missing/unknown. */
export async function authenticateRun(req: Request): Promise<RunContext | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const admin = createAdminClient();
  const dep = await getDeploymentByRunHash(admin, hashRunToken(match[1].trim()));
  if (!dep) return null;
  return { admin, dep };
}
