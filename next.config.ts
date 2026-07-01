import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["grammy", "discord.js", "@prisma/client"],
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
