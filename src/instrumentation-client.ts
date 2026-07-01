// Sentry browser SDK — runs on the client. Disabled automatically when no DSN.
import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Full sampling in dev, 10% in prod to control volume.
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Session Replay: sample a slice of sessions, but always record around errors.
  replaysSessionSampleRate: isProd ? 0.1 : 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  debug: false,
});

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
