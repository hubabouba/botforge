import { cn } from "@/lib/utils";

/**
 * Premium faux-analytics dashboard for the hero. Pure SVG/CSS, no real data —
 * an aspirational product glimpse (metrics, area chart, response-time gauge).
 */
export function DashboardMock() {
  return (
    <div className="forge-glass relative w-full rounded-2xl p-4 shadow-[0_40px_120px_-40px_rgba(99,102,241,0.55)]">
      {/* window chrome */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#6366F1] to-[#22D3EE]" />
          <span className="text-[13px] font-medium text-white/80">Botforge Analytics</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
        </span>
      </div>

      {/* top metrics */}
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Total Bots" value="523" delta="+24%" />
        <Metric label="Messages" value="2.4M" delta="+18%" />
        <Metric label="Active Users" value="12.6K" delta="+31%" />
      </div>

      {/* chart + gauge */}
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <div className="col-span-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] text-white/60">Messages Overview</span>
            <span className="font-mono text-[11px] text-emerald-400">+18%</span>
          </div>
          <AreaChart />
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[11px] text-white/60">AI Response</span>
          <Gauge />
        </div>
      </div>

      {/* bottom metrics */}
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <Metric label="Revenue" value="$145,231" delta="+27%" small />
        <Metric label="Orders" value="8,543" delta="+19%" small />
        <Metric label="Uptime" value="99.9%" delta="+0.1%" small />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  small,
}: {
  label: string;
  value: string;
  delta: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("font-mono font-semibold text-white", small ? "text-[15px]" : "text-lg")}>
          {value}
        </span>
        <span className="font-mono text-[10px] text-emerald-400">{delta}</span>
      </div>
    </div>
  );
}

function AreaChart() {
  return (
    <svg viewBox="0 0 320 96" className="h-24 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="fg-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fg-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path d={AREA} fill="url(#fg-area)" />
      <path
        d={LINE}
        fill="none"
        stroke="url(#fg-line)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const LINE =
  "M0,72 C28,66 44,42 70,46 C96,50 110,74 140,68 C168,62 182,26 210,30 C238,34 252,56 280,40 C300,30 312,22 320,18";
const AREA = `${LINE} L320,96 L0,96 Z`;

function Gauge() {
  const pct = 0.78;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto mt-2 h-20 w-20">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <defs>
          <linearGradient id="fg-gauge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="url(#fg-gauge)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-base font-semibold text-white">0.8s</span>
      </div>
    </div>
  );
}
