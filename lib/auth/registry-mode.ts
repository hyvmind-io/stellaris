import "server-only";

import { env } from "@/lib/env";

// FR-007: Startup warning when strict mode is active.
// Fires once at module load (Worker cold start).
if (env.PRIVATE_REGISTRY_MODE === "strict") {
  console.warn(
    "[Stellaris] PRIVATE_REGISTRY_MODE=strict — artifact routes " +
      "(module tarballs, provider zips, SHA256SUMS) require Bearer authentication. " +
      "Clients must use stellaris-auth proxy or equivalent.",
  );
}

/**
 * Whether the registry is running in strict mode.
 *
 * In strict mode, ALL API routes require Bearer authentication,
 * including artifact-serving routes (tarballs, zips, SHA256SUMS).
 *
 * This requires clients to use the stellaris-auth proxy (or equivalent)
 * to inject credentials into all requests, since Terraform/OpenTofu's
 * go-getter subsystem does not forward Bearer tokens natively.
 *
 * @see PRD-002: _prds/PRD-002-private-registry-mode.md
 */
export function isStrictMode(): boolean {
  return env.PRIVATE_REGISTRY_MODE === "strict";
}
