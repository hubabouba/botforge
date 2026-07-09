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
        We offer a free plan and paid plans: {priceList}. Prices are shown in US dollars and do not
        include VAT or other sales tax; where applicable, tax is calculated at checkout based on your
        location and added to the charged amount. Prices may change with prior notice; changes never
        affect a period you have already paid for. The features of each plan are described on our
        pricing page and may evolve over time.
      </p>

      <h2>Subscriptions and payment</h2>
      <p>
        Paid plans are subscriptions billed monthly through <strong>Stripe</strong>, our payment
        processor. Stripe handles your card details securely; we never see or store your full card
        data. Your subscription renews automatically each month until you cancel.
      </p>

      <h2>Cancellation and refunds</h2>
      <p>
        You can cancel anytime from your account. When you cancel, your plan stays active until the
        end of the current paid period and then does not renew — you are not charged again.
      </p>
      <p>
        <strong>Just after purchase.</strong> If you cancel within 14 days of a payment and have made
        little or no use of paid features, contact us and we will normally refund that payment.
      </p>
      <p>
        <strong>Partway through a period.</strong> If you cancel after using the service during a paid
        period, that period is non-refundable, but your access continues until it ends.
      </p>
      <p>
        <strong>Accidental or mistaken charges.</strong> If you were charged in error, or forgot to
        turn off auto-renewal, contact support — we review these case by case and refund where fair.
      </p>
      <p>
        None of this limits mandatory consumer-protection rights you may have in the EU or where you
        live. By starting a subscription and using paid features immediately, you agree the service
        begins before any statutory withdrawal period ends.
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
