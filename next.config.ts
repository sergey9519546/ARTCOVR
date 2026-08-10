import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: false,
  devIndicators: false,
  // Reduce memory usage during build
  experimental: {
    optimizePackageImports: ["gsap", "lenis", "@number-flow/react"],
  },
  // Compress responses
  compress: true,
  // Limit image optimization memory
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  // Avoid OOM during static generation
  staticPageGenerationTimeout: 120,
};
export default nextConfig;
