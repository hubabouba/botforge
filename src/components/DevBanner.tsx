"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Close } from "@/components/icons";

const KEY = "bf-dev-banner-dismissed";

/** Slim, dismissible "early development" notice shown site-wide (except the IDE). */
export function DevBanner() {
  const [show, setShow] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setShow(localStorage.getItem(KEY) !== "1");
  }, []);

  // The workspace is a full-screen app — no room for a marketing bar.
  if (pathname?.startsWith("/workspace")) return null;
  // The landing has its own floating navbar + committed dark theme; a light
  // system-themed bar would clash and overlap it.
  if (pathname === "/") return null;
  if (!show) return null;

  return (
    <div className="relative z-[60] border-b border-border bg-muted/60 text-foreground">
      <div className="container-x flex items-center justify-center gap-2 py-1.5 text-center text-xs">
        <span className="flex items-center gap-1.5 font-medium text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Early preview
        </span>
        <span className="hidden text-muted-foreground sm:inline">
          Botforge is under active development — some features aren’t live yet.
        </span>
        <button
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setShow(false);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Close className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
