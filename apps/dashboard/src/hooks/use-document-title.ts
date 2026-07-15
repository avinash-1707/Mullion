"use client";

import { useEffect } from "react";

// Matches the root layout's title template ("%s · Mullion"). The metadata
// export is server-only, so client pages that only know their title after a
// fetch (build run, planning session) set it imperatively once data lands.
const SITE_NAME = "Mullion";

/**
 * Sets the document title from client-side data. Pass null while the data
 * is still loading — the segment layout's static title stays in place.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${SITE_NAME}`;
  }, [title]);
}
