import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
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
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-x py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name} 👋</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your bots live here. Build your first one.</p>
          </div>
          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-soft hover:bg-accent-hover"
            title="Coming in the next update"
          >
            + New bot
          </button>
        </div>

        {/* Empty state — the real builder lands in the next phase. */}
        <div className="mt-10 grid place-items-center rounded-2xl border border-dashed border-border bg-background py-20 text-center">
          <div className="max-w-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Logo className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-medium">No bots yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The AI builder is being wired up next. Soon you’ll describe a bot here and watch it come to life.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
