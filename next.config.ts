import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // This prevents the build from scanning/compiling Supabase Edge Functions
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/supabase/functions/**'],
      };
    }
    return config;
  },
  // Extra protection for the build phase
  experimental: {
    // This is the key line that tells Next.js to skip the folder entirely
    outputFileTracingExcludes: {
      '*': ['**/supabase/functions/**'],
    },
  },
};

export default nextConfig;