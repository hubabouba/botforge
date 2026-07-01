import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="July 1, 2026">
      <p>
        By using {brand.name}, you agree to these terms. This document is a draft and
        should be reviewed by a lawyer before launch.
      </p>

      <h2>Account</h2>
      <p>You are responsible for keeping your account secure and for actions taken under it.</p>

      <h2>Acceptable use</h2>
      <p>
        You may not build bots for spam, fraud, malware, or anything that breaks the law
        or the rules of Telegram/Discord. We may suspend accounts for violations.
      </p>

      <h2>Your content and code</h2>
      <p>
        The generated code is yours. You are responsible for how you use and deploy your
        bots, and for the keys and tokens you add to them.
      </p>

      <h2>Subscriptions and payment</h2>
      <p>
        Paid plans are billed monthly via Stripe. You can cancel anytime; access stays
        until the end of the paid period. Refunds follow applicable law.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The service is provided “as is.” We do not guarantee uninterrupted operation and
        are not liable for indirect damages to the extent permitted by law.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:legal@${brand.domain}`}>legal@{brand.domain}</a>.
      </p>
    </LegalShell>
  );
}
