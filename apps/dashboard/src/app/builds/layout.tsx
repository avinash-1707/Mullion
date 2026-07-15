import type { Metadata } from "next";

// Pages under /builds are client components, so the segment layout carries
// the static title (root layout's template appends "· Mullion"). The run
// detail page refines it client-side once the run loads.
export const metadata: Metadata = {
  title: "Builds",
};

export default function BuildsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
