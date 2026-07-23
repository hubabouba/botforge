"use client";

import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          {brand.name}
        </Link>
        <p className="mt-10 font-mono text-6xl font-bold tracking-tight text-accent">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("notFound.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFound.desc")}</p>
        <Link
          href="/"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          {t("notFound.back")}
        </Link>
      </div>
    </main>
  );
}
