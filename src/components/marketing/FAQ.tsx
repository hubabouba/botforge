const faqs = [
  {
    q: "Do I need to know how to code?",
    a: "No. You describe the bot in plain words and the AI writes the code. But if you are a developer, the code is open and you can edit it right in the editor.",
  },
  {
    q: "Is the code really mine?",
    a: "Yes. Botforge generates a standard project (Python/Node) with no hidden dependencies. Download the ZIP and deploy it anywhere.",
  },
  {
    q: "Which platforms are supported?",
    a: "Telegram and Discord at launch. The architecture is built to add new platforms without rewriting your projects.",
  },
  {
    q: "What if the bot breaks?",
    a: "Built-in auto-fixing reads the logs, finds the cause, and proposes corrected code — usually in one click.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Anytime, from your account. Access stays until the end of the paid period.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-24">
      <div className="container-x grid gap-12 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Frequently asked questions</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Didn’t find an answer? Write to us — we reply within a day.
          </p>
        </div>

        <div className="divide-y divide-border border-t border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {f.q}
                <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
