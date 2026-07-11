import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";

// Private product surface: never indexed, robots.ts also disallows the
// crawlable paths. Belt and suspenders for stray deep links.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The signed-in product surface: dark theme, persistent header. The landing
// page lives in the sibling (marketing) group with its own chrome.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
