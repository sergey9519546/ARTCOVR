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
  // Limit image optimization memory — use unoptimized for local assets (faster, no CPU bottleneck)
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  // Avoid OOM during static generation
  staticPageGenerationTimeout: 120,
};
export default nextConfig;
