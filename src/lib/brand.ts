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
  domain: "botforge.dev",
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
  id: "free" | "basic" | "pro";
  name: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

/** Landing-page copy for each tier. Price/name come from `plan.ts`'s `PLANS`. */
const PRICING_COPY: Record<PricingTier["id"], Omit<PricingTier, "id" | "name">> = {
  free: {
    tagline: "Try it and build your first bots.",
    features: ["3 projects", "Basic AI model", "5 AI messages/day", "Run in sandbox", "Download code (ZIP)"],
    cta: "Start free",
  },
  basic: {
    tagline: "For personal bots and small projects.",
    features: [
      "Up to 15 projects",
      "Standard AI model",
      "10 AI messages/day",
      "Automatic error fixing",
      "Chat & version history",
      "Email support",
    ],
    cta: "Get Basic",
  },
  pro: {
    tagline: "For people who build bots seriously.",
    features: [
      "Unlimited projects",
      "Advanced AI model",
      "40 AI messages/day",
      "Priority generation",
      "Analytics & logs",
      "Priority support",
    ],
    cta: "Get Pro",
    highlighted: true,
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
  { label: "Case studies", href: "#cases" },
  { label: "FAQ", href: "#faq" },
];
