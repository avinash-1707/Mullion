// Single source of truth for site-wide identity used by metadata, SEO
// routes (robots/sitemap/manifest), and structured data. Marketing copy
// lives in the landing components; this is the machine-facing identity.
export const siteConfig = {
  name: "Mullion",
  tagline: "From idea to shipped.",
  description:
    "Mullion turns a plain description into a working project. Agents ask the right questions, plan the architecture in front of you, then build and deliver it with your approval at every turn.",
  // Set NEXT_PUBLIC_SITE_URL in production; the fallback keeps absolute
  // URLs valid in local dev.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ogImage: "/brand/og.png",
  keywords: [
    "AI build platform",
    "AI agents",
    "software planning",
    "architecture diagram",
    "code generation",
    "idea to app",
  ],
} as const;
