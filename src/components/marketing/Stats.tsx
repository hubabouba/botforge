/** Slim, honest "by the numbers" band — playful, on-brand, no invented metrics. */
const stats = [
  { value: "2", label: "platforms supported" },
  { value: "∞", label: "bots you can build" },
  { value: "0", label: "servers to manage" },
  { value: "1-click", label: "run & deploy" },
];

export function Stats() {
  return (
    <section className="border-y border-border bg-ink-950">
      <div className="container-x grid grid-cols-2 divide-x divide-white/5 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-10 text-center">
            <div className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{s.value}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
