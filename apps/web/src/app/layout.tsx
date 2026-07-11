import type { Metadata, Viewport } from "next";
import { Archivo, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { createMetadata } from "@/config/metadata";
import { siteConfig } from "@/config/site";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// Editorial serif for the marketing surface only — the product UI stays on
// Archivo. Optical sizing axis opted in so display sizes get the
// high-contrast cut instead of a scaled-up text face.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
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
      className={`${archivo.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full`}
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
