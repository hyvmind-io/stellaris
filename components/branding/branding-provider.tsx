"use client";

import { createContext, useContext } from "react";
import type { Branding } from "@/lib/branding";

const BrandingContext = createContext<Branding | null>(null);

/**
 * Provides the server-resolved {@link Branding} object to client components.
 *
 * Mounted once in the root layout with the value from `getBranding()`. Client
 * components read branding via {@link useBranding} — never `process.env`, since
 * `wrangler.jsonc` `vars` are not inlined into client bundles.
 */
export function BrandingProvider({
  value,
  children,
}: {
  value: Branding;
  children: React.ReactNode;
}) {
  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

/** Read the resolved branding from context. Throws if used outside the provider. */
export function useBranding(): Branding {
  const branding = useContext(BrandingContext);
  if (!branding) {
    throw new Error("useBranding must be used within BrandingProvider");
  }
  return branding;
}
