import type { MetadataRoute } from "next";

/** Same base URL as `metadataBase` in layout.tsx. */
const BASE = process.env.BOTFORGE_PUBLIC_URL ?? "https://botforge-snowy.vercel.app";

/**
 * Static sitemap for the public, indexable pages only. The app itself
 * (/dashboard, /workspace) sits behind auth and is disallowed in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
