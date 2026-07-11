import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// The whole app is the crawlable marketing surface now — the signed-in
// product lives on the dashboard app (app. subdomain, ADR-64), which ships
// its own deny-all robots.txt. Old product paths here just redirect there.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
