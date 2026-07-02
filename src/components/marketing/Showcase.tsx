/**
 * The "magic moment" section: a dark mock of the AI chat generating code and
 * auto-fixing a crash — the thing that makes the product feel alive. Echoes the
 * real workspace (chat · reasoning · one-click fix).
 */
import { Plus } from "@/components/icons";

export function Showcase() {
  return (
    <section className="py-24">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2">
        {/* Copy */}
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">The workspace</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Chat. Generate. <span className="text-accent">Fix.</span> Ship.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            You talk to Botforge like a teammate. It writes the files, explains its reasoning,
            and when something breaks it reads the logs and repairs the code itself.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              { t: "Reasoning you can follow", d: "See why the AI chose each library and pattern — no black box." },
              { t: "One-click auto-fix", d: "A crash becomes a fixed diff, not an afternoon of debugging." },
              { t: "Always real code", d: "Every step edits actual project files you can read and own." },
            ].map((f) => (
              <li key={f.t} className="flex gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
                    <path d="m5 10 3.5 3.5L15 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-medium">{f.t}</div>
                  <div className="text-sm text-muted-foreground">{f.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Chat / auto-fix mock */}
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 shadow-lift">
            <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2.5">
              <span className="grid h-5 w-5 place-items-center rounded bg-accent text-[11px] text-white">B</span>
              <span className="text-sm font-medium text-neutral-200">Assistant</span>
              <span className="ml-auto font-mono text-[11px] text-neutral-500">crypto-alert-bot</span>
            </div>

            <div className="space-y-3 p-4 text-sm">
              {/* user */}
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-white">
                Add a daily report at 9:00 that sends each subscriber their prices.
              </div>

              {/* reasoning */}
              <div className="rounded-xl border border-ink-800 bg-ink-900/70 p-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Reasoning
                </div>
                <p className="mt-1.5 text-neutral-400">
                  I&apos;ll add a <span className="font-mono text-neutral-300">JobQueue</span> in{" "}
                  <span className="font-mono text-neutral-300">jobs.py</span> and register a daily
                  9:00 UTC task that iterates subscribers…
                </p>
              </div>

              {/* file written */}
              <div className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-neutral-300">
                <Plus className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-mono text-xs">jobs.py</span>
                <span className="ml-auto text-[11px] text-emerald-400">+38 lines</span>
              </div>

              {/* error + auto-fix */}
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
                <div className="flex items-center gap-2 text-rose-300">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  <span className="text-xs">Process exited with an error — <span className="font-mono">TypeError in poll</span></span>
                </div>
                <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-soft">
                  Fix automatically
                </button>
              </div>

              {/* success */}
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Fixed and redeployed · bot is polling
                <span className="animate-blink text-accent">▍</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
