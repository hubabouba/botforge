/**
 * Transactional email via Resend's REST API (no SDK dependency — one fetch).
 * Env-gated exactly like Stripe/Sentry: with RESEND_API_KEY unset, every send
 * is a silent no-op, so the app runs unchanged until email is turned on.
 *
 * These are best-effort notifications from trusted server code (the Stripe
 * webhook, the hosting reconcile path) — a send must NEVER throw into or block
 * its caller, so everything here swallows failures and returns a boolean.
 */
import { brand } from "./brand";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

/** Low-level send. Returns true on a 2xx from Resend, false otherwise (never throws). */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // e.g. "Botforge <noreply@botforge.dev>"
  if (!apiKey || !from) return false;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- shared shell ----------------------------------------------------------

const SITE_URL = (process.env.BOTFORGE_PUBLIC_URL || `https://${brand.domain}`).replace(/\/$/, "");

/** Minimal, inline-styled shell — email clients don't do external CSS. */
function shell(heading: string, bodyHtml: string, cta?: { label: string; href: string }): string {
  const button = cta
    ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;padding:10px 18px;background:#6366F1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${cta.label}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0b0d12;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#12141b;border:1px solid #232733;border-radius:16px;padding:28px">
    <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.01em">${brand.name}</div>
    <h1 style="margin:18px 0 10px;font-size:19px;color:#fff;font-weight:700">${heading}</h1>
    <div style="font-size:14px;line-height:1.6;color:#aab0be">${bodyHtml}</div>
    ${button}
    <div style="margin-top:26px;border-top:1px solid #232733;padding-top:16px;font-size:12px;color:#6b7280">
      ${brand.name} · <a href="${SITE_URL}" style="color:#8b93a7">${brand.domain}</a><br/>
      Questions? Reply to this email or contact ${brand.email}.
    </div>
  </div>
</body></html>`;
}

// --- specific notifications ------------------------------------------------

/** A recurring charge failed — Stripe will retry, but the user should know. */
export function sendPaymentFailedEmail(to: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: `${brand.name}: your payment didn't go through`,
    html: shell(
      "Your payment didn't go through",
      `We couldn't process your latest ${brand.name} subscription payment. Stripe will try again over the next few days,
       but your plan may be paused if it keeps failing. Please check that your card details are up to date.`,
      { label: "Update payment method", href: `${SITE_URL}/dashboard` },
    ),
  });
}

/** The subscription fully ended (period over / canceled) — back on Free. */
export function sendSubscriptionEndedEmail(to: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: `${brand.name}: your subscription has ended`,
    html: shell(
      "Your subscription has ended",
      `Your paid ${brand.name} plan has ended and your account is back on the Free plan. Your projects are safe — you can
       resubscribe any time to restore your paid limits and features.`,
      { label: "View plans", href: `${SITE_URL}/dashboard` },
    ),
  });
}

/** A hosted bot was auto-stopped because the month's runtime budget ran out. */
export function sendHostingBudgetEmail(to: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: `${brand.name}: this month's hosting hours are used up`,
    html: shell(
      "Your bot was paused",
      `One of your bots was stopped because you've used up this month's hosting hours on your plan. Your budget resets at
       the start of next month, or you can upgrade for more hours.`,
      { label: "Manage hosting", href: `${SITE_URL}/dashboard` },
    ),
  });
}
