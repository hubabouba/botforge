// Sentry browser SDK — runs on the client. Disabled automatically when no DSN.
import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";
const enabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Full sampling in dev, 10% in prod to control volume.
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Session Replay: sample a slice of sessions, but always record around errors.
  replaysSessionSampleRate: isProd ? 0.1 : 0,
  replaysOnErrorSampleRate: 1.0,
  // Replay is added below, after the page is idle — see the note there.
  integrations: [],
  enabled,
  debug: false,
});

/**
 * Session Replay, off the critical path.
 *
 * Measured: it is 41 kB of the shared bundle — every page, including the
 * landing page a phone loads cold from an ad. Error capture is what must be
 * instant (a crash during startup still has to be reported, and Sentry.init
 * above handles that eagerly); a recording of how the user got there can start
 * a moment later.
 *
 * The trade to be explicit about: a crash in the first second has a stack trace
 * but no replay attached, because there was no buffer running yet. That is the
 * cheaper half of the pair to lose.
 */
if (enabled && typeof window !== "undefined") {
  const start = () => {
    void import("@sentry/nextjs").then(({ replayIntegration }) => {
      Sentry.addIntegration(replayIntegration({ maskAllText: true, blockAllMedia: true }));
    });
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(start, { timeout: 5000 });
  else setTimeout(start, 2000);
}

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
