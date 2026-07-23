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

export default function LandingPage() {
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
        <Reveal><Pricing /></Reveal>
        <Reveal><FAQ /></Reveal>
        <Reveal><CTA /></Reveal>
      </main>
      <Footer />
    </div>
  );
}
