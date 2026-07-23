"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";

/**
 * Route-level error boundary. Unlike global-error.tsx (which replaces the whole
 * document when the root layout itself throws), this keeps the layout mounted
 * and shows a recoverable, themed message for errors thrown inside a page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t("appError.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("appError.desc")}</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            {t("appError.retry")}
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t("notFound.back")}
          </Link>
        </div>
      </div>
    </main>
  );
}
