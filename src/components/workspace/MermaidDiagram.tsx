"use client";

import { useEffect, useId, useState } from "react";

/**
 * Renders a Mermaid diagram from source. Mermaid is a heavy dependency, so it's
 * imported dynamically (kept out of the main bundle) and only when a diagram is
 * actually shown. The model can emit malformed Mermaid — invalid syntax falls
 * back to showing the raw code instead of throwing.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const rawId = useId();

  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(false);
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const id = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
        const { svg } = await mermaid.render(id, code);
        if (alive) setSvg(svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, rawId]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-xl border border-ink-800 bg-ink-950 p-3 font-mono text-[12px] leading-relaxed text-neutral-400">
        {code}
      </pre>
    );
  }

  if (svg === null) {
    return (
      <div className="grid place-items-center rounded-xl border border-ink-800 bg-ink-900/50 p-6 text-[12px] text-neutral-500">
        …
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-xl border border-ink-800 bg-ink-950 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
