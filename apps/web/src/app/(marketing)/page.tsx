import { LandingNav } from "@/components/landing/landing-nav";
import { Hero } from "@/components/landing/hero";
import { Manifesto } from "@/components/landing/manifesto";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Crew } from "@/components/landing/crew";
import { Control } from "@/components/landing/control";
import { Pricing } from "@/components/landing/pricing";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPage() {
  return (
    <div className="bg-cream text-ink" style={{ colorScheme: "light" }}>
      <LandingNav />
      <Hero />
      <Manifesto />
      <HowItWorks />
      <Crew />
      <Control />
      <Pricing />
      <FaqSection />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
