import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";

const columns = [
  {
    title: "Продукт",
    links: [
      { label: "Возможности", href: "#features" },
      { label: "Тарифы", href: "#pricing" },
      { label: "Как это работает", href: "#how" },
    ],
  },
  {
    title: "Компания",
    links: [
      { label: "Вопросы", href: "#faq" },
      { label: "Контакты", href: `mailto:hello@${brand.domain}` },
    ],
  },
  {
    title: "Правовое",
    links: [
      { label: "Конфиденциальность", href: "/privacy" },
      { label: "Условия использования", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border py-14">
      <div className="container-x grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="h-6 w-6" />
            {brand.name}
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">{brand.tagline}</p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <div className="text-sm font-medium">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="container-x mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} {brand.name}. Все права защищены.</span>
        <span className="font-mono text-xs">Сделано в лаборатории · {brand.domain}</span>
      </div>
    </footer>
  );
}
