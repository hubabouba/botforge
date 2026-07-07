import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/marketing/Logo";
import { GitHub, Mail } from "@/components/icons";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Services", href: "#services" },
      { label: "Pricing", href: "#pricing" },
      { label: "Case studies", href: "#cases" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: `mailto:${brand.email}` },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.02] text-white/60 transition-colors hover:border-white/20 hover:text-white"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.08] py-14">
      <div className="container-x grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
            <Logo className="h-6 w-6" />
            <span className="font-display">{brand.name}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-white/50">{brand.tagline}</p>
          <div className="mt-5 flex gap-2">
            <Social href="https://github.com/hubabouba/botforge" label="GitHub">
              <GitHub className="h-4 w-4" />
            </Social>
            <Social href={`mailto:${brand.email}`} label="Email">
              <Mail className="h-4 w-4" />
            </Social>
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <div className="text-sm font-medium text-white">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-white/50 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="container-x mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/[0.08] pt-6 text-sm text-white/45 sm:flex-row">
        <span>
          © {new Date().getFullYear()} {brand.name}. All rights reserved.
        </span>
        <span className="font-mono text-xs">Built in the lab · {brand.domain}</span>
      </div>
    </footer>
  );
}
