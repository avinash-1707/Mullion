import { SiteHeader } from "@/components/site-header";

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
