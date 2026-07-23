import type { MetadataRoute } from "next";

/** Same base URL as `metadataBase` in layout.tsx. */
const BASE = process.env.BOTFORGE_PUBLIC_URL ?? "https://botforge-snowy.vercel.app";

/**
 * Let crawlers index the marketing pages; keep the authenticated app and API
 * out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/workspace", "/api"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
