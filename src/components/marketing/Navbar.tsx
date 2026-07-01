"use client";

import { useState } from "react";
import Link from "next/link";
import { brand, navLinks } from "@/lib/brand";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/marketing/Logo";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
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
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Get started
          </ButtonLink>
        </div>

        <button
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden"
        >
          <span className="text-lg leading-none">{open ? "✕" : "≡"}</span>
        </button>
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
              {l.label}
            </a>
          ))}
          <div className="mt-2 flex gap-2">
            <ButtonLink href="/login" variant="ghost" size="sm" className="flex-1">
              Log in
            </ButtonLink>
            <ButtonLink href="/signup" size="sm" className="flex-1">
              Get started
            </ButtonLink>
          </div>
        </div>
      </div>
    </header>
  );
}
