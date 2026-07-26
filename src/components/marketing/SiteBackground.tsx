/**
 * Fixed backdrop for the landing page: a flat ink surface with a faint technical
 * grid that fades out toward the fold. Deliberately static — the drifting aurora
 * blobs, floating particles and cursor spotlight that used to live here read as
 * generated-template decoration, so they're gone; the grid stays because it's
 * texture, not glow. No client JS, no motion.
 */
export function SiteBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#080A0F]" />
      <div className="forge-grid forge-grid-fade absolute inset-0 opacity-40" />
    </div>
  );
}
