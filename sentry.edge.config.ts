// Sentry SDK for the Edge runtime (middleware, edge routes). Disabled without DSN.
import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: isProd ? 0.1 : 1.0,
  enabled: !!process.env.SENTRY_DSN,
  debug: false,
});
