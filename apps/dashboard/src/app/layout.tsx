import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";

// Same font stack as apps/web so the product surface stays on-brand; the
// restyle pass decides what the dashboard actually uses from it.
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

// Nonce-based CSP (src/proxy.ts) applies the per-request nonce during SSR;
// a statically-generated page would ship with no nonce and have its own
// scripts blocked. Force dynamic rendering app-wide so every route renders
// per-request and picks up its nonce (the documented CSP-nonce tradeoff).
export const dynamic = "force-dynamic";

// Private product surface on the app. subdomain: never indexed. robots.ts
// disallows everything; this is the belt-and-suspenders meta tag.
export const metadata: Metadata = {
  title: {
    default: "Mullion",
    template: "%s · Mullion",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${cormorant.variable} h-full`}
    >
      {/* suppressHydrationWarning: attribute-only, for browser extensions
          (Grammarly et al.) that stamp data-* attributes on <body> before
          React hydrates. Child mismatches still surface. */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-bg text-fg antialiased"
      >
        <Providers>
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
