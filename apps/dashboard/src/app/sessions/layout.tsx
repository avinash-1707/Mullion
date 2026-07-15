import type { Metadata } from "next";

// The session page is a client component, so the segment layout carries
// the static title (root layout's template appends "· Mullion"). The page
// refines it client-side to the session's idea once the snapshot loads.
export const metadata: Metadata = {
  title: "Planning session",
};

export default function SessionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
