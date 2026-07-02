import { ButtonLink } from "@/components/ui/Button";

export function CTA() {
  return (
    <section className="py-24">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl border border-ink-800 bg-ink-950 px-6 py-16 text-center shadow-lift sm:px-16">
          <div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-[0.06]" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your first bot — tonight
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-neutral-400">
              Describe the idea — Botforge does the rest. Free, no credit card.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/signup" size="lg">
                Build a bot
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-neutral-500">No credit card · cancel anytime</p>
          </div>
        </div>
      </div>
    </section>
  );
}
