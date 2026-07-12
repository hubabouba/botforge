import type { Locale } from "./messages";

/**
 * Picks the grammatically correct plural form for a count. English has two
 * forms; Russian has three (1 / 2-4 / 5+, with the usual "teen" exception) —
 * `t()`'s single-key lookup can't express that, so counted strings compose
 * this instead of a translation key.
 */
export function plural(
  lang: Locale,
  n: number,
  forms: { en: [one: string, many: string]; ru: [one: string, few: string, many: string] },
): string {
  if (lang === "ru") {
    const [one, few, many] = forms.ru;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }
  const [one, many] = forms.en;
  return n === 1 ? one : many;
}
