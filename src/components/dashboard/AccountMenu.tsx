"use client";

import { useState } from "react";
import { usePlan } from "@/hooks/usePlan";
import { planMeta } from "@/lib/plan";
import { UpgradeModal } from "@/components/upgrade/UpgradeModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { Settings, Lock, LogOut } from "@/components/icons";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

function initialsOf(name: string, email: string): string {
  const src = name?.trim() || email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return chars.toUpperCase();
}

export function AccountMenu({ email, name }: { email: string; name: string }) {
  const { t } = useI18n();
  const { plan } = usePlan();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const meta = planMeta(plan);

  return (
    <>
      {/* Plan pill — a quiet nudge that also opens the plans */}
      {plan === "pro" ? (
        <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent sm:inline">
          Pro
        </span>
      ) : (
        <button
          onClick={() => setUpgrade(true)}
          className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground sm:inline-flex"
        >
          <Lock className="h-3 w-3" />
          {meta.name} · {t("account.upgrade")}
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={t("account.accountMenu")}
          className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[12px] font-semibold text-accent-foreground transition-transform hover:scale-105"
        >
          {initialsOf(name, email)}
        </button>

        {open && (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-11 z-20 w-60 overflow-hidden rounded-xl border border-border bg-background py-1 shadow-lift">
              <div className="border-b border-border px-3 py-2.5">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">{email}</div>
                <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {meta.name} {t("account.plan")}
                </span>
              </div>

              <MenuItem
                icon={<Lock className="h-3.5 w-3.5" />}
                label={plan === "pro" ? t("account.managePlan") : t("account.upgradePlan")}
                onClick={() => {
                  setOpen(false);
                  setUpgrade(true);
                }}
              />
              <MenuItem
                icon={<Settings className="h-3.5 w-3.5" />}
                label={t("account.settings")}
                onClick={() => {
                  setOpen(false);
                  setSettings(true);
                }}
              />

              <div className="my-1 h-px bg-border" />
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("account.signOut")}
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {settings && (
        <SettingsModal
          name={name}
          email={email}
          plan={plan}
          onOpenUpgrade={() => {
            setSettings(false);
            setUpgrade(true);
          }}
          onClose={() => setSettings(false)}
        />
      )}
      {upgrade && (
        <UpgradeModal current={plan} highlight={plan === "basic" ? "pro" : "basic"} onClose={() => setUpgrade(false)} />
      )}
    </>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted")}
    >
      {icon}
      {label}
    </button>
  );
}
