import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  // Pin file tracing to this project. Without it, Next walks up and picks the
  // outermost package.json/lockfile it finds as the workspace root, which nests
  // the standalone output under the full path (e.g. .next/standalone/Desktop/...)
  // instead of emitting a flat .next/standalone/server.js. The build script and
  // .zscripts/build.sh both assume the flat layout.
  outputFileTracingRoot: __dirname,
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
