"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created inside a useState initializer, not at module scope — a
  // module-level client would be shared across requests/users under
  // Next.js's server-rendering, which is unsafe. One instance per component
  // instance (i.e. per browser tab) is the SSR-safe App Router pattern.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
