import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this, but double-check on the server.
  if (!user) redirect("/login");

  const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? "there";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container-x flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="h-6 w-6" />
            {brand.name}
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-x py-10 sm:py-12">
        <DashboardHome name={name} />
      </main>
    </div>
  );
}
