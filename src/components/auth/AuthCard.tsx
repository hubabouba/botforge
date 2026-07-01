"use client";

import { useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "github";

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSignup = mode === "signup";

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function signInWithProvider(provider: Provider) {
    setError(null);
    setBusy(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-ink-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-[0.05]" />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 font-semibold tracking-tight text-white">
          <Logo className="h-7 w-7" />
          {brand.name}
        </Link>
        <div className="relative">
          <h2 className="max-w-sm text-2xl font-semibold leading-snug text-white">
            The lab where AI writes your bots — and you own the code.
          </h2>
          <ul className="mt-6 space-y-3">
            {["Real code, not a black box", "Telegram & Discord", "Run in one click"].map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm text-neutral-400">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
                    <path d="m5 10 3.5 3.5L15 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative font-mono text-xs text-neutral-600">Built in the lab · {brand.domain}</p>
      </aside>

      {/* Form side */}
      <div className="relative flex flex-col justify-center bg-background px-6 py-10">
        <Link
          href="/"
          className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>←</span> Back to home
        </Link>

        <div className="mx-auto w-full max-w-sm">
          {/* Mobile logo */}
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold tracking-tight lg:hidden">
            <Logo className="h-7 w-7" />
            {brand.name}
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isSignup ? "Your first bot is free — no credit card." : "Log in to continue building."}
          </p>

          {status === "sent" ? (
            <div className="mt-8 rounded-xl border border-border bg-muted/50 p-5 text-center">
              <div className="text-3xl">📬</div>
              <p className="mt-2 font-medium">Check your email</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a magic link to <span className="font-medium text-foreground">{email}</span>.
                Open it on this device to finish signing in.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-4 text-sm font-medium text-accent hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="mt-8 space-y-2.5">
                <button
                  onClick={() => signInWithProvider("google")}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.9Z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.4L6 10.2c.9-2.6 3.2-4.8 6-4.8Z"/></svg>
                  {busy === "google" ? "Redirecting…" : "Continue with Google"}
                </button>
                <button
                  onClick={() => signInWithProvider("github")}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.16.57.67.48A10 10 0 0 0 22 12 10 10 0 0 0 12 2Z" /></svg>
                  {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
                </button>
              </div>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or continue with email <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={signInWithEmail} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                />
                <Button type="submit" className="w-full" disabled={status === "loading"}>
                  {status === "loading" ? "Sending…" : isSignup ? "Create account" : "Send magic link"}
                </Button>
              </form>

              {error && (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
              )}
            </>
          )}

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "Don’t have an account?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-accent hover:underline">
              {isSignup ? "Log in" : "Sign up"}
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
