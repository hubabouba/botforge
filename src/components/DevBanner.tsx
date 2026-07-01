"use client";

import { useEffect, useState } from "react";

const KEY = "bf-dev-banner-dismissed";

/** Slim, dismissible "early development" notice shown site-wide. */
export function DevBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(KEY) !== "1");
  }, []);

  if (!show) return null;

  return (
    <div className="relative z-[60] bg-gradient-to-r from-accent to-violet-600 text-accent-foreground">
      <div className="container-x flex items-center justify-center gap-2 py-1.5 text-center text-xs sm:text-sm">
        <span className="font-medium">🚧 Early preview</span>
        <span className="hidden text-accent-foreground/85 sm:inline">
          Botforge is under active development — some features aren’t live yet.
        </span>
        <span className="text-accent-foreground/85 sm:hidden">In active development</span>
        <button
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setShow(false);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-accent-foreground/70 transition-colors hover:text-accent-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
