import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// Marketing pages are crawlable; the signed-in product surface is not.
// The (app) layout additionally sets noindex so a stray deep link that a
// crawler reaches anyway stays out of indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/builds", "/sessions", "/api/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
