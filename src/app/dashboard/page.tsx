import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { AccountMenu } from "@/components/dashboard/AccountMenu";
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
    <div className="forge dark relative min-h-screen overflow-x-clip text-white">
      {/* Premium backdrop — calmer than the landing (no particles) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#080A0F]" />
        <div className="forge-grid forge-grid-fade absolute inset-0 opacity-40" />
        <div className="forge-aurora absolute -top-40 left-1/3 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[#6366F1]/18" />
        <div className="forge-aurora absolute -top-20 right-[10%] h-[28rem] w-[28rem] rounded-full bg-[#22D3EE]/10 [animation-delay:-8s]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0B0D13]/70 backdrop-blur-xl">
        <div className="container-x flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
            <Logo className="h-6 w-6" />
            <span className="font-display">{brand.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <AccountMenu email={user.email ?? ""} name={name} />
          </div>
        </div>
      </header>

      <main className="container-x py-10 sm:py-12">
        <DashboardHome name={name} />
      </main>
    </div>
  );
}
