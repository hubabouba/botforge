"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Hero call-to-action that adapts to whether the visitor is signed in. */
export function HeroCta() {
  const { signedIn, loading } = useAuthUser();
  const { t } = useI18n();
  const primaryHref = signedIn ? "/dashboard" : "/signup";

  return (
    <>
      <div className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <ButtonLink href={primaryHref} size="lg" className="w-full sm:w-auto">
          {signedIn ? t("hero.ctaOpenDashboard") : t("hero.ctaBuild")}
        </ButtonLink>
        <ButtonLink href="#how" variant="ghost" size="lg" className="w-full sm:w-auto">
          {t("hero.ctaHow")}
        </ButtonLink>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {loading ? " " : signedIn ? t("hero.welcomeBack") : t("hero.freeNote")}
      </p>
    </>
  );
}
