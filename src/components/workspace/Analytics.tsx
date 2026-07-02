"use client";

/** Lightweight analytics view. Sample data until real runtime metrics land. */

const metrics = [
  { label: "Messages · 24h", value: "1,284", delta: "+12%", up: true },
  { label: "Active users", value: "342", delta: "+5%", up: true },
  { label: "Avg. response", value: "180ms", delta: "−22ms", up: true },
  { label: "Errors · 24h", value: "3", delta: "−40%", up: true },
];

const week = [42, 58, 47, 73, 66, 91, 84];
const days = ["M", "T", "W", "T", "F", "S", "S"];
const max = Math.max(...week);

const topCommands = [
  { cmd: "/price", count: 612, pct: 100 },
  { cmd: "/start", count: 348, pct: 57 },
  { cmd: "/subscribe", count: 201, pct: 33 },
  { cmd: "/unsubscribe", count: 44, pct: 7 },
];

export function Analytics() {
  return (
    <div className="h-full overflow-auto bg-ink-950 p-6 sm:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Analytics</h2>
            <p className="mt-1 text-sm text-neutral-500">Usage over the last 7 days.</p>
          </div>
          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-neutral-500">sample data</span>
        </div>

        {/* Metric cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
              <div className="text-[11px] text-neutral-500">{m.label}</div>
              <div className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-100">{m.value}</div>
              <div className={`mt-1 text-[11px] ${m.up ? "text-emerald-400" : "text-rose-400"}`}>{m.delta}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Bar chart */}
          <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
            <div className="text-[13px] font-medium text-neutral-200">Messages per day</div>
            <div className="mt-6 flex h-40 items-end gap-3">
              {week.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-accent/40 to-accent transition-all"
                      style={{ height: `${(v / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-600">{days[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top commands */}
          <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
            <div className="text-[13px] font-medium text-neutral-200">Top commands</div>
            <div className="mt-5 space-y-3.5">
              {topCommands.map((c) => (
                <div key={c.cmd}>
                  <div className="flex justify-between text-[12px]">
                    <span className="font-mono text-neutral-300">{c.cmd}</span>
                    <span className="text-neutral-500">{c.count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
