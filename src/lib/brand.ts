/**
 * Single source of truth for brand + marketing content.
 * Change the name here and it updates across the whole site. Pricing itself
 * lives in `plan.ts` (`PLANS`) — the app's plan-gating logic already depends
 * on those numbers, so `pricingTiers` below reads its price from there instead
 * of keeping a second, independently-editable copy.
 */
import { PLANS } from "./plan";

export const brand = {
  name: "Botforge",
  /**
   * The domain we actually serve from, and the one sitemap.xml declares
   * canonical. It was `botforge.dev` — a domain that is not ours; it resolves
   * to an empty page belonging to someone else. It was printed in the footer
   * of every marketing page, on the signup screen, and in the footer of every
   * transactional email, where it was also the link target whenever
   * BOTFORGE_PUBLIC_URL was unset.
   *
   * A visitor arriving from an ad reads usebotforge.com in the address bar and
   * a different domain at the bottom of the page. That reads as a template
   * nobody finished, or as a phishing page — either way it costs trust at the
   * exact moment we are asking a stranger for it.
   */
  domain: "usebotforge.com",
  /** Public contact for support, billing, and legal questions. */
  email: "maskazajca.yt@gmail.com",
  /** Operator + governing law shown in the legal pages. */
  operator: "Botforge",
  jurisdiction: "Poland",
  tagline: "Bots built for you — by voice. AI writes the code, you ship it.",
  description:
    "Botforge is an AI lab where you describe a bot in plain words and AI writes real, working code for Telegram and Discord. Edit, run, and download — all in your browser.",
} as const;

export interface PricingTier {
  id: "free" | "basic" | "pro" | "max";
  name: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

/** Landing-page copy for each tier. Price/name come from `plan.ts`'s `PLANS`. */
const PRICING_COPY: Record<PricingTier["id"], Omit<PricingTier, "id" | "name">> = {
  free: {
    tagline: "See how it works and build a first simple bot.",
    features: ["2 projects", "Basic AI model", "30 AI messages/month", "Run in sandbox", "Download code (ZIP)"],
    cta: "Start free",
  },
  basic: {
    // Size of project, not vague seriousness: the point of these three lines is
    // that someone lands on the page and knows which one is theirs.
    tagline: "One straightforward bot — a few commands, one job.",
    features: [
      "Up to 15 projects",
      "Standard AI model",
      "100 AI messages/month",
      "Automatic error fixing",
      "Chat & version history",
      "Email support",
    ],
    cta: "Get Basic",
  },
  pro: {
    tagline: "The right choice for a real, mid-sized bot.",
    features: [
      "Unlimited projects",
      "Advanced AI model",
      "150 AI messages/month",
      "Deeper reasoning on every message",
      "Analytics & logs",
      "Priority support",
    ],
    cta: "Get Pro",
    highlighted: true,
  },
  max: {
    tagline: "For large projects — many files, complex logic.",
    features: [
      "Everything in Pro",
      "Most advanced AI model",
      "200 AI messages/month",
      "Handles big codebases in one pass",
      "Unlimited projects",
      "Priority support",
    ],
    cta: "Get Max",
  },
};

export const pricingTiers: (PricingTier & { price: number })[] = PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  price: p.price,
  ...PRICING_COPY[p.id],
}));

export const navLinks = [
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];
