import type { Metadata } from "next";

// The invite page is a client component, so the segment layout carries
// the static title (root layout's template appends "· Mullion").
export const metadata: Metadata = {
  title: "Invitation",
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
