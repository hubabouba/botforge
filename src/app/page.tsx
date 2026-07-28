import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
import { SiteBackground } from "@/components/marketing/SiteBackground";
import { LogosStrip } from "@/components/marketing/LogosStrip";
import { Services } from "@/components/marketing/Services";
import { Stats } from "@/components/marketing/Stats";
import { Infrastructure } from "@/components/marketing/Infrastructure";
import { Pricing } from "@/components/marketing/Pricing";
import { FAQ } from "@/components/marketing/FAQ";
import { CTA } from "@/components/marketing/CTA";
import { Footer } from "@/components/marketing/Footer";
import { Reveal } from "@/components/marketing/Reveal";
import { ScrollProgress } from "@/components/marketing/ScrollProgress";
import { annualBillingEnabled } from "@/lib/stripe";

export default function LandingPage() {
  // Read on the server, where the Stripe price env vars live. The annual ribbon
  // and the "or $X/mo yearly" line appear only once all three annual Prices
  // exist — advertising a discount nobody can buy is a false claim on a page
  // that ad traffic lands on.
  const annualBilling = annualBillingEnabled();
  return (
    <div className="forge dark relative min-h-screen overflow-x-clip text-white">
      <ScrollProgress />
      <SiteBackground />
      <Navbar />
      <main className="relative">
        <Hero />
        <Reveal><LogosStrip /></Reveal>
        <Reveal><Services /></Reveal>
        <Reveal><Stats /></Reveal>
        <Reveal><Infrastructure /></Reveal>
        <Reveal><Pricing annualBilling={annualBilling} /></Reveal>
        <Reveal><FAQ /></Reveal>
        <Reveal><CTA /></Reveal>
      </main>
      <Footer />
    </div>
  );
}
