import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "../components/site-header";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Mullion",
    template: "%s · Mullion",
  },
  description:
    "Mullion turns an idea into a live architecture plan — agents clarify scope, plan the system in front of you, then export specs or build it end to end.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-bg text-fg antialiased">
        <Providers>
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
