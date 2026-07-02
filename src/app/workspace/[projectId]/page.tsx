import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/components/workspace/Workspace";
import { sampleProject, sampleChat } from "@/lib/workspace/sample";

export const metadata: Metadata = { title: "Workspace" };

// UI phase: every project id serves the sample project. Real projects load from
// the DB (and the AI writes their files) in the next sub-step.
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await params; // reserved: will select the project by id once persisted
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Workspace project={sampleProject} seedChat={sampleChat} />;
}
