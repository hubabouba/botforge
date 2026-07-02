import { pricingTiers } from "@/lib/brand";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-accent">
      <path d="m5 10 3.5 3.5L15 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-border bg-muted/40 py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Start free. Scale when you need to.
          </h2>
          <p className="mt-4 text-muted-foreground">Monthly subscription. Cancel anytime.</p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "card-hover flex flex-col rounded-2xl border bg-background p-6",
                tier.highlighted
                  ? "border-gradient border-accent/40 shadow-glow-lg md:-translate-y-3 md:scale-[1.03]"
                  : "border-border shadow-soft",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{tier.name}</h3>
                {tier.highlighted && (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${tier.price}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>

              <ButtonLink
                href="/signup"
                variant={tier.highlighted ? "primary" : "ghost"}
                className="mt-6"
              >
                {tier.cta}
              </ButtonLink>

              <ul className="mt-6 space-y-3 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2 text-muted-foreground">
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
