"use client";

import { useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { Button } from "@/components/ui/Button";

/**
 * Presentational auth card. Real Supabase auth wiring lands in Phase 2 — for now
 * the form is fully designed and shows a friendly note on submit.
 */
export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const isSignup = mode === "signup";

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          {brand.name}
        </Link>

        <div className="rounded-2xl border border-border bg-background p-6 shadow-soft">
          <h1 className="text-xl font-semibold tracking-tight">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup ? "Your first bot is free — no credit card." : "Log in to continue."}
          </p>

          <button
            onClick={() => setNote("Google sign-in is coming in the next update.")}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.9Z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.4L6 10.2c.9-2.6 3.2-4.8 6-4.8Z"/></svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setNote("Thanks! Email sign-in will be enabled in an upcoming update.");
            }}
            className="space-y-3"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            />
            <Button type="submit" className="w-full">
              {isSignup ? "Create account" : "Send magic link"}
            </Button>
          </form>

          {note && (
            <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">{note}</p>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account?" : "Don’t have an account?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-accent hover:underline">
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
      </div>
    </main>
  );
}
