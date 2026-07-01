import { ButtonLink } from "@/components/ui/Button";
import { WorkspacePreview } from "@/components/marketing/WorkspacePreview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Dotted grid backdrop, faded at edges */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid mask-fade" />
      {/* Soft accent glow behind the headline */}
      <div className="pointer-events-none absolute left-1/2 top-[-6rem] -z-10 h-[28rem] w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-accent/25 via-violet-400/15 to-transparent blur-3xl" />

      <div className="container-x pt-20 pb-16 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <a
            href="#how"
            className="animate-fade-up group inline-flex items-center gap-2 rounded-full border border-border bg-background/70 py-1 pl-1 pr-3 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              New
            </span>
            From idea to a working bot in minutes
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </a>

          <h1 className="animate-fade-up mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Bots written by <span className="text-gradient">AI</span>.
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
          <div className="relative">
            {/* Glow under the product mock */}
            <div className="pointer-events-none absolute -inset-x-8 -bottom-8 top-8 -z-10 rounded-[2rem] bg-gradient-to-b from-accent/10 to-transparent blur-2xl" />
            <WorkspacePreview />
          </div>
        </div>
      </div>
    </section>
  );
}
