import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Scripts allow 'unsafe-inline' (Next injects an
 * inline bootstrap without a nonce, and PostHog injects nonce-less inline
 * scripts — a per-request-nonce CSP was tried and reverted: a nonce in the
 * policy makes browsers IGNORE 'unsafe-inline', which breaks PostHog outright)
 * plus PostHog's asset hosts (it script-loads its remote config/array.js;
 * connect-src alone only covers event fetch()es, which is why basic capture
 * worked while remote config was silently blocked). worker-src allows the
 * blob: worker PostHog spawns for session-recording compression.
 * 'unsafe-eval' is dev-only (HMR).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://*.posthog.com https://*.i.posthog.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.i.posthog.com https://*.sentry.io https://*.ingest.sentry.io",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// PostHog region host (eu.i / us.i); its asset CDN is the same host with an
// "-assets" infix (eu.i.posthog.com → eu-assets.i.posthog.com).
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssets = posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com");

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // First-party PostHog proxy — tracker blockers (Firefox ETP, uBlock, …)
  // block *.posthog.com by DOMAIN, which silently kills analytics for every
  // visitor running one. Routing through our own /ingest sails past them —
  // the exact same reasoning as Sentry's tunnelRoute below.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  // PostHog's API paths use trailing slashes; Next would otherwise 308 them.
  skipTrailingSlashRedirect: true,
};

export default withSentryConfig(nextConfig, {
  // Org/project/token come from env; source maps upload only when a token is set.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet build logs locally; verbose only in CI.
  silent: !process.env.CI,
  // Upload a wider set of client bundles for better stack traces.
  widenClientFileUpload: true,
  // Route Sentry requests through our domain to dodge ad-blockers.
  tunnelRoute: "/monitoring",
});
