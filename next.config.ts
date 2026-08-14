import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
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

// Security header declarations. In `next dev` (used by the Playwright e2e
// suite) Next.js attaches these to every response. In `output: "export"`
// builds these `headers()`/`redirects()` functions are inert — Cloudflare
// Pages serves the equivalent headers from `public/_headers`. Keep this list
// and `public/_headers` in sync; the seo-security-contract unit test asserts
// the declarations below exist in this file.
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
  },
  compress: true,
  images: {
    unoptimized: true,
  },
  staticPageGenerationTimeout: 120,
  // Legacy redirects. Honored in `next dev` (the e2e legacy-redirect test
  // relies on them). In `output: "export"` builds these are inert; Cloudflare
  // Pages serves the equivalent rules from `public/_redirects`. Keep both
  // sources in sync.
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
  // See the `securityHeaders` note above. Honored in `next dev`; mirrored in
  // `public/_headers` for static export. Keep both in sync.
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/:path*", headers: privateRouteHeaders },
      { source: "/auth/:path*", headers: privateRouteHeaders },
      { source: "/checkout/:path*", headers: privateRouteHeaders },
      { source: "/my-images", headers: privateRouteHeaders },
      { source: "/sign-in", headers: privateRouteHeaders },
    ];
  },
};
export default nextConfig;