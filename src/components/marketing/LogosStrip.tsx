/**
 * Honest "works with / built on" strip — no fake customer logos. A quiet marquee
 * of the real platforms and tech the product speaks, for credibility.
 */
const items = [
  "Telegram",
  "Discord",
  "Python",
  "TypeScript",
  "grammY",
  "discord.js",
  "Claude",
  "One-click deploy",
];

export function LogosStrip() {
  return (
    <section className="border-y border-border bg-muted/30 py-8">
      <div className="container-x">
        <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Speaks the platforms and tools you already know
        </p>
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex w-max animate-marquee gap-10">
            {[...items, ...items].map((item, i) => (
              <span
                key={i}
                className="whitespace-nowrap font-mono text-sm text-muted-foreground/80"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
