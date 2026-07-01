import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
import { LogosStrip } from "@/components/marketing/LogosStrip";
import { Showcase } from "@/components/marketing/Showcase";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Features } from "@/components/marketing/Features";
import { Stats } from "@/components/marketing/Stats";
import { UseCases } from "@/components/marketing/UseCases";
import { Pricing } from "@/components/marketing/Pricing";
import { FAQ } from "@/components/marketing/FAQ";
import { CTA } from "@/components/marketing/CTA";
import { Footer } from "@/components/marketing/Footer";
import { Reveal } from "@/components/marketing/Reveal";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Reveal><LogosStrip /></Reveal>
        <Reveal><Showcase /></Reveal>
        <Reveal><HowItWorks /></Reveal>
        <Reveal><Features /></Reveal>
        <Reveal><Stats /></Reveal>
        <Reveal><UseCases /></Reveal>
        <Reveal><Pricing /></Reveal>
        <Reveal><FAQ /></Reveal>
        <Reveal><CTA /></Reveal>
      </main>
      <Footer />
    </>
  );
}
