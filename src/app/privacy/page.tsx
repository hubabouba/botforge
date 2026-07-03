import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="July 3, 2026">
      <p>
        This policy describes what data {brand.name} (“{brand.operator}”, “we”), operating from{" "}
        {brand.jurisdiction}, collects and how we use it. This document is a draft and should be
        reviewed by a lawyer before launch.
      </p>

      <h2>What we collect</h2>
      <p>
        Account: your email and authentication data (via our auth provider).
        Content: bot descriptions, generated code, and the projects you create.
        Payments: handled by Stripe; we do not store card data. Technical data:
        logs, IP address, device type, and anonymized product analytics.
      </p>

      <h2>How we use data</h2>
      <p>
        To provide the service (generating and running bots), process subscriptions,
        improve the product, and keep it secure. We do not sell your data.
      </p>

      <h2>Data processors</h2>
      <p>
        We use: Supabase (database and auth), Stripe (payments), Vercel (hosting),
        Sentry (errors), PostHog (analytics), and Anthropic and Google (AI code generation).
        Some of these providers may process data outside your country under appropriate safeguards.
      </p>

      <h2>Your rights</h2>
      <p>
        You can request access to, correction of, or deletion of your data by emailing{" "}
        <a href={`mailto:${brand.email}`}>{brand.email}</a>.
      </p>

      <h2>Cookies</h2>
      <p>
        We use essential cookies for sign-in and analytics cookies to improve the product.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions: <a href={`mailto:${brand.email}`}>{brand.email}</a>.
      </p>
    </LegalShell>
  );
}
