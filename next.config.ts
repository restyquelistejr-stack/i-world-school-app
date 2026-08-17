import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Clean and safe config for Next.js 16
  turbopack: {}, // Required to silence the Webpack/Turbopack warning
};

export default nextConfig;