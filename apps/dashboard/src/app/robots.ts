import type { MetadataRoute } from "next";

// The whole dashboard is an auth-walled product surface — nothing here is
// for crawlers. The layout's noindex metadata covers stray deep links.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
