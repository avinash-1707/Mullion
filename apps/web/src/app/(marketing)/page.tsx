import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { siteConfig } from "@/config/site";
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

export const metadata: Metadata = createMetadata({ path: "/" });

// Organization + WebSite structured data for search engines. Rendered as a
// data block (type application/ld+json is never executed, so the strict
// CSP does not apply to it).
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      logo: `${siteConfig.url}/brand/logo-mark.png`,
    },
    {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="bg-cream text-ink" style={{ colorScheme: "light" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
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
