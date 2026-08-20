import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // This forces Next.js to ALWAYS server-render dynamic pages
  // It fixes the 404/redirect issue for /courses/[id], /students/[id], etc.
  output: 'standalone', 
};

export default nextConfig;