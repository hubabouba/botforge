import { cn } from "@/lib/utils";

/** Geometric forge mark: a hexagon (nut) with a spark — minimal, distinctive. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn(className)} aria-hidden>
      <path
        d="M16 2.5 27.7 9v14L16 29.5 4.3 23V9L16 2.5Z"
        stroke="#4f46e5"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 10.5 20.5 16 16 21.5 11.5 16 16 10.5Z" fill="#4f46e5" />
    </svg>
  );
}
