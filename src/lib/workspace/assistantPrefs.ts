/**
 * Assistant persona preferences, stored per-browser in localStorage.
 *
 * These control *how* the in-workspace assistant talks (language, verbosity,
 * character) — not what it can do. They're sent with each chat request and
 * folded into the system prompt server-side. Global to the user (not per
 * project) so the assistant feels consistent everywhere.
 */
import { DEFAULT_PREFERENCES, type AssistantPreferences } from "@/lib/ai/types";

const KEY = "bf:assistant-prefs";

export type { AssistantPreferences };
export { DEFAULT_PREFERENCES };

export function loadPrefs(): AssistantPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AssistantPreferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePrefs(prefs: AssistantPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}
