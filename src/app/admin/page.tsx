import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

// Never indexed, never linked from any nav — a personal stats panel, not a
// product surface. Metadata alone isn't the gate (see the notFound() below);
// this just keeps it out of search results on the off chance a crawler finds it.
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A uniform 404 whether signed out or signed in as a non-admin — never a
  // distinct "forbidden" response that would confirm this route exists.
  if (!user || !isAdminEmail(user.email)) notFound();

  return <AdminDashboard />;
}
