import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize TypeScript compilation
  typescript: {
    // Only check types during build, not during dev (faster)
    ignoreBuildErrors: false,
  },
  // Optimize build performance
  swcMinify: true,
  // Reduce build output size
  compress: true,
};

export default nextConfig;
