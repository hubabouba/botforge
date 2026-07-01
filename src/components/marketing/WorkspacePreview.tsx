/**
 * Static, tasteful mock of the dark workspace — echoes the real product screen
 * (file tree · code editor · tabs · run/download). Pure presentational.
 */
const files = ["main.py", "handlers.py", "jobs.py", "services.py", "database.py", "requirements.txt"];
const tabs = ["Код", "Архитектура", "Логи", "Аналитика"];

// Tiny syntax-highlighted code lines (spans, not a real editor).
const K = "text-[#c792ea]"; // keyword
const S = "text-[#c3e88d]"; // string
const F = "text-[#82aaff]"; // function
const C = "text-[#546e7a]"; // comment

export function WorkspacePreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 shadow-lift">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <span className="grid h-5 w-5 place-items-center rounded bg-accent text-[11px] text-white">B</span>
          crypto-alert-bot
        </div>
        <div className="ml-2 hidden gap-1 rounded-lg bg-ink-900 p-0.5 sm:flex">
          {tabs.map((t, i) => (
            <span
              key={t}
              className={
                i === 0
                  ? "rounded-md bg-ink-800 px-2.5 py-1 text-xs text-neutral-100"
                  : "px-2.5 py-1 text-xs text-neutral-500"
              }
            >
              {t}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Запустить
          </span>
          <span className="rounded-md border border-ink-700 px-2 py-1 text-xs text-neutral-400">Скачать ZIP</span>
        </div>
      </div>

      <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr]">
        {/* File tree */}
        <div className="border-r border-ink-800 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-600">Проводник</div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-400">▾ bot_src</div>
          {files.map((f, i) => (
            <div
              key={f}
              className={
                i === 0
                  ? "rounded-md bg-accent/15 px-2 py-1 text-xs text-neutral-100"
                  : "px-2 py-1 text-xs text-neutral-500"
              }
            >
              {f}
            </div>
          ))}
        </div>

        {/* Code */}
        <pre className="overflow-hidden p-4 font-mono text-[12px] leading-[1.7] text-neutral-300">
          <code>
            <span className={C}># crypto-alert-bot · main.py</span>{"\n"}
            <span className={K}>from</span> telegram.ext <span className={K}>import</span> ApplicationBuilder, CommandHandler{"\n"}
            <span className={K}>from</span> handlers <span className={K}>import</span> cmd_start, cmd_price, cmd_subscribe{"\n"}
            <span className={K}>from</span> jobs <span className={K}>import</span> daily_report{"\n"}
            {"\n"}
            <span className={K}>def</span> <span className={F}>main</span>() <span className="text-neutral-500">-&gt;</span> <span className={K}>None</span>:{"\n"}
            {"    "}token = os.environ.get(<span className={S}>&quot;TELEGRAM_TOKEN&quot;</span>){"\n"}
            {"    "}app = <span className={F}>ApplicationBuilder</span>().token(token).build(){"\n"}
            {"    "}app.add_handler(<span className={F}>CommandHandler</span>(<span className={S}>&quot;price&quot;</span>, cmd_price)){"\n"}
            {"    "}app.job_queue.<span className={F}>run_daily</span>(daily_report, time=time(<span className="text-amber-300">9</span>)){"\n"}
            {"    "}app.<span className={F}>run_polling</span>()<span className="animate-blink text-accent">▍</span>{"\n"}
          </code>
        </pre>
      </div>
    </div>
  );
}
