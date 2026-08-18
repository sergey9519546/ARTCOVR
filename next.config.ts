import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  // Inline JavaScript bootstrap removed in 2026-08-18 cleanup; theme init now
  // lives in /theme-init.js and JSON-LD uses a non-JavaScript MIME type, so
  // unsafe-inline is no longer required for script-src in production.
  // Dev mode retains unsafe-eval for Next.js HMR / React Fast Refresh.
  `script-src 'self'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  },
];

const privateRouteHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["gsap", "lenis", "@number-flow/react"],
  },
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      // The unapproved review catalog module only exists in explicit
      // private-staging builds; every other build bundles an empty catalog.
      "#staging-catalog":
        process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1"
          ? "./src/lib/artcovr/curated-review.json"
          : "./src/lib/artcovr/curated-empty.json",
      "#staging-intro":
        process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1"
          ? "./src/lib/artcovr/staging-intro.json"
          : "./src/lib/artcovr/curated-empty.json",
    },
  },
  compress: true,
  images: {
    unoptimized: true,
  },
  staticPageGenerationTimeout: 120,
  async redirects() {
    return [
      { source: "/bag", destination: "/archive", permanent: true },
      {
        source: "/shipping-and-return",
        destination: "/refunds",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/auth/:path*", headers: privateRouteHeaders },
      { source: "/checkout/:path*", headers: privateRouteHeaders },
      { source: "/my-images", headers: privateRouteHeaders },
      { source: "/sign-in", headers: privateRouteHeaders },
    ];
  },
};
export default nextConfig;
