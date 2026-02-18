import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable image optimization for Cloudflare Workers
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

// Enable Cloudflare bindings during local development
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
