/**
 * Single source of truth for brand + marketing content.
 * Change the name/pricing here and it updates across the whole site.
 */
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
  price: number; // USD / month
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  // Filled once Stripe products are created (Phase 6).
  stripePriceId?: string;
}

export const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Try it and build your first bots.",
    features: ["3 projects", "Basic AI model", "Run in sandbox", "Download code (ZIP)"],
    cta: "Start free",
  },
  {
    id: "basic",
    name: "Basic",
    price: 9,
    tagline: "For personal bots and small projects.",
    features: [
      "Up to 15 projects",
      "Standard AI model",
      "Automatic error fixing",
      "Chat & version history",
      "Email support",
    ],
    cta: "Get Basic",
  },
  {
    id: "pro",
    name: "Pro",
    price: 19,
    tagline: "For people who build bots seriously.",
    features: [
      "Unlimited projects",
      "Advanced AI model",
      "Priority generation",
      "Analytics & logs",
      "Priority support",
    ],
    cta: "Get Pro",
    highlighted: true,
  },
];

export const navLinks = [
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "Case studies", href: "#cases" },
  { label: "FAQ", href: "#faq" },
];
