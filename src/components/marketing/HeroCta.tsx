"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useAuthUser } from "@/hooks/useAuthUser";

/** Hero call-to-action that adapts to whether the visitor is signed in. */
export function HeroCta() {
  const { signedIn, loading } = useAuthUser();
  const primaryHref = signedIn ? "/dashboard" : "/signup";

  return (
    <>
      <div className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <ButtonLink href={primaryHref} size="lg" className="w-full sm:w-auto">
          {signedIn ? "Open your dashboard" : "Build a bot for free"}
        </ButtonLink>
        <ButtonLink href="#how" variant="ghost" size="lg" className="w-full sm:w-auto">
          See how it works
        </ButtonLink>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {loading ? " " : signedIn ? "Welcome back — pick up where you left off" : "No credit card · 3 projects free"}
      </p>
    </>
  );
}
