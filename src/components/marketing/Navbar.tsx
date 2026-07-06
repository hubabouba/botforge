"use client";

import { useState } from "react";
import Link from "next/link";
import { brand, navLinks } from "@/lib/brand";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/marketing/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

// Maps a marketing nav href to its translation key.
const NAV_KEY: Record<string, string> = {
  "#features": "nav.features",
  "#how": "nav.how",
  "#pricing": "nav.pricing",
  "#faq": "nav.faq",
};

function AvatarLink({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <Link
      href="/dashboard"
      aria-label="Dashboard"
      title={email}
      className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[12px] font-semibold text-accent-foreground transition-transform hover:scale-105"
    >
      {initials}
    </Link>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { email, signedIn, loading } = useAuthUser();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <nav className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-6 w-6" />
          {brand.name}
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {NAV_KEY[l.href] ? t(NAV_KEY[l.href]) : l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher />
          <ThemeToggle />
          {loading ? (
            <span className="h-9 w-9" />
          ) : signedIn ? (
            <>
              <ButtonLink href="/dashboard" size="sm">
                {t("nav.dashboard")}
              </ButtonLink>
              <AvatarLink email={email!} />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                {t("nav.login")}
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                {t("nav.getStarted")}
              </ButtonLink>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border"
          >
            <span className="text-lg leading-none">{open ? "✕" : "≡"}</span>
          </button>
        </div>
      </nav>

      <div className={cn("border-t border-border md:hidden", open ? "block" : "hidden")}>
        <div className="container-x flex flex-col gap-1 py-3">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {NAV_KEY[l.href] ? t(NAV_KEY[l.href]) : l.label}
            </a>
          ))}
          <div className="mt-2 flex gap-2">
            {loading ? null : signedIn ? (
              <ButtonLink href="/dashboard" size="sm" className="flex-1" onClick={() => setOpen(false)}>
                {t("nav.goToDashboard")}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm" className="flex-1">
                  {t("nav.login")}
                </ButtonLink>
                <ButtonLink href="/signup" size="sm" className="flex-1">
                  {t("nav.getStarted")}
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
