"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { messages, type Locale } from "@/lib/i18n/messages";

interface I18nCtx {
  lang: Locale;
  setLang: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });
const STORAGE_KEY = "bf:lang";

/**
 * Starts in English (so server HTML and first client render match — no hydration
 * mismatch), then on mount switches to the saved choice or the browser language.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>("en");

  useEffect(() => {
    let next: Locale = "en";
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved in messages) {
        next = saved as Locale;
      } else {
        const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
        if (nav in messages) next = nav as Locale;
      }
    } catch {
      /* ignore */
    }
    setLangState(next);
    document.documentElement.lang = next;
  }, []);

  const setLang = (l: Locale) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  };

  const t = (key: string) => messages[lang][key] ?? messages.en[key] ?? key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
