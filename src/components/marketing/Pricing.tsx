import Link from "next/link";
import { pricingTiers } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Check } from "@/components/icons";

export function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-24 py-24">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-[#818CF8]">Pricing</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start free. Scale when you need to.
          </h2>
          <p className="mt-4 text-white/55">Monthly subscription. Cancel anytime.</p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 backdrop-blur transition-all",
                tier.highlighted
                  ? "border-transparent bg-white/[0.045] shadow-[0_0_0_1px_rgba(99,102,241,0.5),0_30px_80px_-30px_rgba(99,102,241,0.65)] md:-translate-y-3"
                  : "border-white/10 bg-white/[0.02] hover:-translate-y-1 hover:border-white/20",
              )}
            >
              {tier.highlighted && (
                <div className="pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-gradient-to-b from-[#6366F1]/50 to-[#22D3EE]/25 opacity-60 blur-md" />
              )}

              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-white">{tier.name}</h3>
                {tier.highlighted && (
                  <span className="rounded-full bg-gradient-to-r from-[#6366F1] to-[#22D3EE] px-2.5 py-0.5 text-xs font-medium text-white">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/50">{tier.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold tracking-tight text-white">
                  ${tier.price}
                </span>
                <span className="text-sm text-white/45">/mo</span>
              </div>

              <Link
                href="/signup"
                className={cn(
                  "mt-6 inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-all",
                  tier.highlighted
                    ? "bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.9)] hover:-translate-y-0.5"
                    : "border border-white/12 bg-white/[0.03] text-white hover:bg-white/[0.07]",
                )}
              >
                {tier.cta}
              </Link>

              <ul className="mt-6 space-y-3 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-white/60">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#22D3EE]" />
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
