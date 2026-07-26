"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { brand, navLinks } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

// Maps a nav href to its translation key.
const NAV_KEY: Record<string, string> = {
  "#features": "nav.features",
  "#services": "nav.services",
  "#pricing": "nav.pricing",
  "#faq": "nav.faq",
};

function Avatar({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <Link
      href="/dashboard"
      title={email}
      aria-label="Dashboard"
      className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover"
    >
      {initials}
    </Link>
  );
}

function GetStarted({ label }: { label: string }) {
  return (
    <Link
      href="/signup"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
    >
      {label}
    </Link>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { email, signedIn, loading } = useAuthUser();
  const { t } = useI18n();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:pt-4">
      <nav
        className={cn(
          "container-x flex h-14 items-center justify-between rounded-2xl border px-3 transition-all duration-300",
          scrolled
            ? "border-white/10 bg-[#0B0D13]/85 backdrop-blur-xl"
            : "border-white/[0.06] bg-white/[0.02] backdrop-blur-md",
        )}
      >
        <Link href="/" className="flex items-center gap-2 pl-1 font-semibold tracking-tight text-white">
          <Logo className="h-6 w-6" />
          <span className="font-display">{brand.name}</span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-white/60 transition-colors hover:text-white"
            >
              {NAV_KEY[l.href] ? t(NAV_KEY[l.href]) : l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          {loading ? (
            <span className="h-9 w-24" />
          ) : signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
              >
                {t("nav.dashboard")}
              </Link>
              <Avatar email={email!} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
              >
                {t("nav.login")}
              </Link>
              <GetStarted label={t("nav.getStarted")} />
            </>
          )}
        </div>

        {/* mobile controls */}
        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher />
          <button
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white"
          >
            <span className="text-lg leading-none">{open ? "✕" : "≡"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="container-x mt-2 rounded-2xl border border-white/10 bg-[#0B0D13]/95 p-3 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                {NAV_KEY[l.href] ? t(NAV_KEY[l.href]) : l.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">
              {signedIn ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-medium text-white"
                >
                  {t("nav.goToDashboard")}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-center text-sm text-white/80"
                  >
                    {t("nav.login")}
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-medium text-white"
                  >
                    {t("nav.getStarted")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
