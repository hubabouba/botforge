import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/components/workspace/Workspace";

export const metadata: Metadata = { title: "Workspace" };

// Auth is enforced on the server; the project itself is fetched client-side from
// Supabase (behind RLS) by id via the /api/projects routes.
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Workspace projectId={projectId} />;
}
