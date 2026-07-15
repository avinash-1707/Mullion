import type { Metadata } from "next";

// The settings page is a client component, so the segment layout carries
// the static title (root layout's template appends "· Mullion").
export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
