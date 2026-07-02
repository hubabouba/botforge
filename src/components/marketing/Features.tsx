import type { ReactNode } from "react";

function Icon({ path }: { path: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {path}
    </svg>
  );
}

const features = [
  {
    title: "Real code, not a black box",
    body: "You see every file and own the source. No vendor lock-in.",
    icon: <Icon path={<><path d="m8 6-6 6 6 6" /><path d="m16 6 6 6-6 6" /></>} />,
  },
  {
    title: "Telegram and Discord",
    body: "One description — a bot for the platform you need, with idiomatic code.",
    icon: <Icon path={<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>} />,
  },
  {
    title: "Automatic error fixing",
    body: "Bot crashed? The AI reads the logs, finds the cause, and sends back fixed code.",
    icon: <Icon path={<><path d="M12 3v3" /><path d="M18.4 6.6 16 9" /><circle cx="12" cy="14" r="6" /><path d="M12 11v3l2 1" /></>} />,
  },
  {
    title: "Run in a sandbox",
    body: "Check how your bot behaves right in the browser — no server setup required.",
    icon: <Icon path={<><path d="m5 3 14 9-14 9V3Z" /></>} />,
  },
  {
    title: "Download the source",
    body: "Grab the finished project as a ZIP and deploy it on any host.",
    icon: <Icon path={<><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></>} />,
  },
  {
    title: "Logs and analytics",
    body: "Live execution logs and usage metrics — on their own tabs.",
    icon: <Icon path={<><path d="M3 3v18h18" /><path d="m7 15 3-4 3 3 4-6" /></>} />,
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Features</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            A lab, not a throwaway generator
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to take a bot from idea to production — in one window.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative bg-background p-6 transition-colors duration-300 hover:bg-muted/40"
            >
              {/* Accent wash that fades in on hover */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/[0.06] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-violet-500 text-white shadow-glow transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105">
                {f.icon}
              </div>
              <h3 className="relative mt-4 font-medium">{f.title}</h3>
              <p className="relative mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
