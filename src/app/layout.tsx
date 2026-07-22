import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { brand } from "@/lib/brand";
import { PostHogProvider } from "@/components/PostHogProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { DevBanner } from "@/components/DevBanner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for OG/twitter image URLs — Facebook et al. require absolute
  // URLs, and without this Next emits relative ones (and warns at build).
  metadataBase: new URL(process.env.BOTFORGE_PUBLIC_URL ?? "https://botforge-snowy.vercel.app"),
  title: {
    default: `${brand.name} — the AI lab for building bots`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  openGraph: {
    title: `${brand.name} — the AI lab for building bots`,
    description: brand.description,
    type: "website",
    siteName: brand.name,
  },
  // The opengraph-image route supplies the picture; make the card the large,
  // image-forward variant so shared links show a full-width preview.
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} — the AI lab for building bots`,
    description: brand.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider>
            <PostHogProvider>
              <DevBanner />
              {children}
            </PostHogProvider>
          </I18nProvider>
        </ThemeProvider>
        {/* Cinematic film grain over the entire product (below modals). */}
        <div aria-hidden className="grain-overlay" />
      </body>
    </html>
  );
}
