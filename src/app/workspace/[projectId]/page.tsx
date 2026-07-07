import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/components/workspace/Workspace";

export const metadata: Metadata = { title: "Workspace" };

// Auth is enforced on the server; the project itself is loaded client-side from
// the store (localStorage) by id. Swaps to a DB fetch when persistence moves to
// Supabase alongside the AI generator.
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

  return <Workspace projectId={projectId} userId={user.id} />;
}
