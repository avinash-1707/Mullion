import type { Metadata } from "next";

// The session page is a client component, so the segment layout carries
// the static title (root layout's template appends "· Mullion"). The page
// refines it client-side to the session's idea once the snapshot loads.
export const metadata: Metadata = {
  title: "Planning session",
};

export default function SessionsLayout({ children }: { children: React.ReactNode }) {
  // Hard-cap the session surface to the viewport so the page itself never
  // scrolls — the diagram fills the leftover space and the decision log
  // scrolls inside its own panel. An explicit height (not flex-1) because
  // the body/main chain is min-height-based, so a flex-grown child would
  // still stretch with content. Mobile subtracts the 4rem in-flow top bar.
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-none flex-col overflow-hidden lg:h-dvh">{children}</div>
  );
}
