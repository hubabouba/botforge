import { ButtonLink } from "@/components/ui/Button";
import { WorkspacePreview } from "@/components/marketing/WorkspacePreview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Dotted grid backdrop, faded at edges */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid mask-fade" />

      <div className="container-x pt-20 pb-16 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <a
            href="#how"
            className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            From idea to a working bot in minutes
          </a>

          <h1 className="animate-fade-up mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Bots written by AI.
            <br />
            <span className="text-muted-foreground">Code that belongs to you.</span>
          </h1>

          <p className="animate-fade-up mx-auto mt-6 max-w-xl text-balance text-lg text-muted-foreground">
            Describe a bot in plain words — Botforge writes real code for Telegram and Discord.
            Edit it in your browser, run it in one click, and download the source.
          </p>

          <div className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
              Build a bot for free
            </ButtonLink>
            <ButtonLink href="#how" variant="ghost" size="lg" className="w-full sm:w-auto">
              See how it works
            </ButtonLink>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">No credit card · first project free</p>
        </div>

        <div className="animate-fade-up mx-auto mt-16 max-w-4xl [animation-delay:120ms]">
          <WorkspacePreview />
        </div>
      </div>
    </section>
  );
}
