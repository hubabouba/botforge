const steps = [
  {
    n: "01",
    title: "Describe your bot in words",
    body: "“A bot that sends the BTC price every morning and on the /price command.” No flowcharts, no docs to read.",
  },
  {
    n: "02",
    title: "AI writes the code and fixes errors",
    body: "Botforge generates a full project file by file, explains its choices, and repairs failures from the logs itself.",
  },
  {
    n: "03",
    title: "Run it or download it",
    body: "Test the bot in a sandbox right in your browser, or grab the source as a ZIP and deploy it anywhere.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-border bg-muted/40 py-24">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps from idea to a live bot
          </h2>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          {/* connector line on desktop */}
          <div className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background font-mono text-sm font-medium text-accent shadow-soft">
                {s.n}
              </div>
              <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
