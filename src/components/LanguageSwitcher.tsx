"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LOCALES } from "@/lib/i18n/messages";
import { Globe, Check } from "@/components/icons";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LOCALES.find((l) => l.code === lang) ?? LOCALES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        title="Change language"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Globe className="h-4 w-4" />
        <span className="text-sm">{current.flag}</span>
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-40 overflow-hidden rounded-xl border border-border bg-background py-1 shadow-lift">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  l.code === lang ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{l.flag}</span>
                <span className="flex-1">{l.label}</span>
                {l.code === lang && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
