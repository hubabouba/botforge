/**
 * The product glimpse in the hero — the shape of a bot dashboard: metric tiles,
 * a traffic chart, a response-time gauge.
 *
 * It shows no numbers, and that is the point. It used to read "523 bots",
 * "2.4M messages", "12.6K active users", "$145,231 revenue", "99.9% uptime",
 * under a pulsing green "live" badge. A comment in this file called that
 * "no real data" — but nobody reads the comment. A visitor reads a screenshot
 * of a product reporting its own success, and an ad reviewer reads a landing
 * page making claims the advertiser can't evidence, which is grounds to
 * restrict the account.
 *
 * So the labels stay and the values become small bar glyphs: the layout still
 * says "this is what you'll be looking at" without asserting anything that
 * isn't true yet.
 */
export function DashboardMock() {
  return (
    <div className="forge-glass relative w-full rounded-2xl p-4">
      {/* window chrome */}
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="text-[13px] font-medium text-white/80">Botforge Analytics</span>
      </div>

      {/* top metrics */}
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Total Bots" bars={[0.35, 0.6, 0.85]} />
        <Metric label="Messages" bars={[0.5, 0.75, 1]} />
        <Metric label="Active Users" bars={[0.4, 0.55, 0.9]} />
      </div>

      {/* chart + gauge */}
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <div className="col-span-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="mb-1 text-[11px] text-white/60">Messages Overview</div>
          <AreaChart />
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <span className="text-[11px] text-white/60">AI Response</span>
          <Gauge />
        </div>
      </div>

      {/* bottom metrics */}
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <Metric label="Commands" bars={[0.45, 0.7, 0.6]} small />
        <Metric label="Errors" bars={[0.3, 0.2, 0.15]} small />
        <Metric label="Uptime" bars={[0.8, 0.85, 0.95]} small />
      </div>
    </div>
  );
}

/**
 * A tile that names what's measured and shows the shape of it, with no figure
 * attached. Three bars read as "a trend" to the eye and as nothing at all to a
 * reader looking for a claim.
 */
function Metric({ label, bars, small }: { label: string; bars: number[]; small?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="text-[11px] text-white/50">{label}</div>
      <div
        aria-hidden
        className="mt-2 flex items-end gap-1"
        style={{ height: small ? "1.1rem" : "1.5rem" }}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-[2px] bg-accent/45"
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
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
      </defs>
      {/* The area keeps its vertical fade (that's how area charts read); the
          line itself is a single colour, not a two-tone sweep. */}
      <path d={AREA} fill="url(#fg-area)" />
      <path
        d={LINE}
        fill="none"
        stroke="#818CF8"
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
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="#818CF8"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      {/* The arc alone. "0.8s" was a promise about latency we have never
          measured, sitting inside a mock. */}
    </div>
  );
}
