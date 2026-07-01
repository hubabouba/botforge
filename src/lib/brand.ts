/**
 * Single source of truth for brand + marketing content.
 * Change the name/pricing here and it updates across the whole site.
 */
export const brand = {
  name: "Botforge",
  domain: "botforge.dev",
  tagline: "Боты на заказ — голосом. ИИ пишет код, вы запускаете.",
  description:
    "Botforge — AI-лаборатория, где вы описываете бота словами, а ИИ пишет настоящий рабочий код для Telegram и Discord. Редактируйте, запускайте и скачивайте — всё в браузере.",
} as const;

export interface PricingTier {
  id: "free" | "basic" | "pro";
  name: string;
  price: number; // USD / month
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  // Filled once Stripe products are created (Fase 6).
  stripePriceId?: string;
}

export const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Попробовать и собрать первого бота.",
    features: ["1 проект", "Базовая ИИ-модель", "Запуск в песочнице", "Скачать код (ZIP)"],
    cta: "Начать бесплатно",
  },
  {
    id: "basic",
    name: "Basic",
    price: 9,
    tagline: "Для личных ботов и небольших проектов.",
    features: [
      "До 5 проектов",
      "Стандартная ИИ-модель",
      "Авто-исправление ошибок",
      "История чата и версий",
      "Email-поддержка",
    ],
    cta: "Оформить Basic",
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    tagline: "Для тех, кто делает ботов всерьёз.",
    features: [
      "Безлимит проектов",
      "Продвинутая ИИ-модель",
      "Приоритетная генерация",
      "Аналитика и логи",
      "Приоритетная поддержка",
    ],
    cta: "Оформить Pro",
    highlighted: true,
  },
];

export const navLinks = [
  { label: "Возможности", href: "#features" },
  { label: "Как это работает", href: "#how" },
  { label: "Тарифы", href: "#pricing" },
  { label: "Вопросы", href: "#faq" },
];
