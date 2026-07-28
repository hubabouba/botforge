import type { Metadata } from "next";
import { brand, pricingTiers } from "@/lib/brand";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const paid = pricingTiers.filter((t) => t.price > 0);
  const priceList = paid.map((t) => `${t.name} ($${t.price}/month)`).join(" and ");

  return (
    <LegalShell title="Terms of Service" updated="July 26, 2026">
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

      <h2>AI providers</h2>
      <p>
        {brand.name} generates code and assistant responses using third-party AI models, including
        Google Gemini and Anthropic’s Claude. When you use the assistant, your prompts and the
        relevant project files are sent to the applicable provider to produce a response, and are
        handled under that provider’s terms and privacy policy. Which model runs depends on your
        plan.
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
        Paid plans are subscriptions billed through <strong>Stripe</strong>, our payment processor.
        You choose the billing period when you subscribe: <strong>monthly</strong>, or{" "}
        <strong>annually</strong> at a discount, charged in full at the start of the year. Stripe
        handles your card details securely; we never see or store your full card data. Your
        subscription renews automatically at the end of each paid period — each month on a monthly
        plan, each year on an annual one — until you cancel.
      </p>

      <h2>Cancellation and refunds</h2>
      <p>
        You can cancel anytime from your account. When you cancel, your plan stays active until the
        end of the current paid period and then does not renew — you are not charged again.
      </p>
      <p>
        <strong>Changed your mind early.</strong> You can ask for a refund of a payment within{" "}
        <strong>7 days</strong> on a monthly plan, or <strong>14 days</strong> on an annual one — no
        reason needed. On the first day that is the full amount; after that we refund the part of
        the period you have not used yet, so the sooner you ask, the more comes back. Contact us and
        we will work it out from your account.
      </p>
      <p>
        <strong>Once the plan has done its job.</strong> If you have downloaded your bot&apos;s code
        or started a bot on Botforge hosting, that is what you paid for and it has been delivered —
        the current period is not refundable after that. The code you generated stays yours either
        way, which is precisely why we treat it as delivered rather than asking for it back. Your
        access continues to the end of the period you paid for.
      </p>
      <p>
        <strong>Annual plans, at any time.</strong> Months you have not reached yet are a different
        matter: they have not been delivered, whatever you did in the months before. So if you
        cancel partway through a year we refund the whole months remaining — cancel in month four of
        twelve and eight months come back to you. This has no deadline and needs no reason, and it
        applies even once the current period counts as delivered above.
      </p>
      <p>
        <strong>Accidental or mistaken charges.</strong> If you were charged in error, or forgot to
        turn off auto-renewal, contact support — we review these case by case and refund where fair.
      </p>
      <p>
        None of this limits mandatory consumer-protection rights you may have in the EU or where you
        live. When you subscribe, you expressly request and consent that we begin providing the
        service immediately — access to the paid features is granted the moment payment completes —
        and you acknowledge that, once performance has begun, you lose the statutory 14-day right of
        withdrawal for that purchase. We do not rely on that: the refunds described above are
        offered on top of it, and the 14-day window and the annual pro-rata refund are given as a
        matter of policy whether or not the statutory right still applies.
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
