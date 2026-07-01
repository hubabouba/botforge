import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";

/** Shared layout for legal/content pages: navbar + prose column + footer. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="container-x py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
          <div className="mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_a]:text-accent [&_a]:underline">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
