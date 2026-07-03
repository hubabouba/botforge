import type { Metadata } from "next";
import { brand, pricingTiers } from "@/lib/brand";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const paid = pricingTiers.filter((t) => t.price > 0);
  const priceList = paid.map((t) => `${t.name} ($${t.price}/month)`).join(" and ");

  return (
    <LegalShell title="Terms of Service" updated="July 3, 2026">
      <p>
        {brand.name} (“{brand.operator}”, “we”) provides an AI service for building bots. By using
        it, you agree to these terms. This document is a plain-language draft and should be reviewed
        by a lawyer before relying on it commercially.
      </p>

      <h2>Account</h2>
      <p>You are responsible for keeping your account secure and for actions taken under it.</p>

      <h2>Acceptable use</h2>
      <p>
        You may not build bots for spam, fraud, malware, or anything that breaks the law or the
        rules of Telegram/Discord. We may suspend accounts for violations.
      </p>

      <h2>Your content and code</h2>
      <p>
        The generated code is yours. You are responsible for how you use and deploy your bots, and
        for the keys and tokens you add to them.
      </p>

      <h2>Plans and pricing</h2>
      <p>
        We offer a free plan and paid plans: {priceList}. Prices are in US dollars and may change
        with prior notice; changes never affect a period you have already paid for. The features of
        each plan are described on our pricing page and may evolve over time.
      </p>

      <h2>Subscriptions and payment</h2>
      <p>
        Paid plans are subscriptions billed monthly through <strong>Stripe</strong>, our payment
        processor. Stripe handles your card details securely; we never see or store your full card
        data. Your subscription renews automatically each month until you cancel.
      </p>

      <h2>Cancellation and refunds</h2>
      <p>
        You can cancel anytime from your account; access continues until the end of the paid period,
        and you are not charged again. Payments are otherwise non-refundable, except where a refund
        is required by applicable consumer law. If you are a consumer in the EU, you keep any
        mandatory statutory rights; by starting a subscription and using paid features immediately,
        you agree the service begins before any withdrawal period ends.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The service is provided “as is.” We do not guarantee uninterrupted operation and are not
        liable for indirect damages to the extent permitted by law.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of {brand.jurisdiction}, without prejudice to mandatory
        consumer-protection rules that may apply where you live.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms or your subscription:{" "}
        <a href={`mailto:${brand.email}`}>{brand.email}</a>.
      </p>
    </LegalShell>
  );
}
