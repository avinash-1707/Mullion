import type { Metadata } from "next";
import { siteConfig } from "./site";

interface PageMetadataOptions {
  /** Page title; omit for the site default (root layout applies the template). */
  title?: string;
  description?: string;
  /** Route path beginning with "/", used for the canonical URL. */
  path?: string;
  /** Keep the page out of search indexes (private/product surfaces). */
  noIndex?: boolean;
}

// Factory for per-page Metadata exports so every page shares one OG/twitter
// shape and canonical scheme. Pages spread or extend the result as needed.
export function createMetadata({
  title,
  description = siteConfig.description,
  path = "/",
  noIndex = false,
}: PageMetadataOptions = {}): Metadata {
  const ogTitle = title ? `${title} · ${siteConfig.name}` : `${siteConfig.name} - ${siteConfig.tagline}`;

  return {
    ...(title ? { title } : {}),
    description,
    keywords: [...siteConfig.keywords],
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: ogTitle,
      description,
      url: path,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} - ${siteConfig.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [siteConfig.ogImage],
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
