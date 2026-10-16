import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable image optimization for Cloudflare Workers
  images: {
    unoptimized: true,
  },

  // Security headers applied to all routes.
  // HSTS omitted — Cloudflare enforces HTTPS at the edge.
  // CSP omitted — the registry serves no user-submitted HTML content.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// `next dev` only: wire D1/R2 bindings from wrangler. Playwright sets
// STELLARIS_E2E=1 to use the seeded, isolated e2e database instead.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { E2E_PERSIST_DIR, E2E_WRANGLER_CONFIG } from "./e2e/config";
initOpenNextCloudflareForDev(
  process.env.STELLARIS_E2E === "1"
    ? {
        configPath: E2E_WRANGLER_CONFIG,
        persist: { path: `${E2E_PERSIST_DIR}/v3` },
      }
    : undefined,
);
