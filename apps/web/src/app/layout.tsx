import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { createMetadata } from "@/config/metadata";
import { siteConfig } from "@/config/site";

// Old-style Garamond serif for display type (bracketed serifs, moderate
// contrast — the editorial reference look) and a neutral grotesque for
// body/UI text. Headings use size and the 500 weight for hierarchy,
// never bold.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// A fourth face, reserved for the single hero h1 only (`font-hero`):
// Instrument Serif is a purpose-built display serif — higher contrast and
// more character than Cormorant at hero scale, still an oldstyle-adjacent
// museum-catalog voice, not a rounded/geometric departure. It ships in
// exactly one weight and style, which keeps this a small, deliberate
// addition rather than a second full type family.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal"],
});

// Nonce-based CSP (src/proxy.ts) applies the per-request nonce during SSR;
// a statically-generated page would ship with no nonce and have its own
// scripts blocked. Force dynamic rendering app-wide so every route renders
// per-request and picks up its nonce (the documented CSP-nonce tradeoff).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  ...createMetadata(),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
};

export const viewport: Viewport = {
  themeColor: "#08080d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-scroll-behavior lets Next disable the CSS smooth-scroll fallback
    // during route transitions so scroll restoration stays instant.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${jetbrainsMono.variable} ${cormorant.variable} ${instrumentSerif.variable} h-full`}
    >
      {/* suppressHydrationWarning: attribute-only, for browser extensions
          (Grammarly et al.) that stamp data-* attributes on <body> before
          React hydrates. Child mismatches still surface. */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-bg text-fg antialiased"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
