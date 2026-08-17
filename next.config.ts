import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // This tells Next.js 16 to ignore the Supabase Edge Functions entirely
  serverExternalPackages: [],
  experimental: {
    outputFileTracingExcludes: {
      '*': ['**/supabase/functions/**'],
    },
  },
  turbopack: {}, // This empty object disables the webpack/turbopack conflict warning
};

export default nextConfig;