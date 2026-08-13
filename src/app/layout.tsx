import type { Metadata } from "next";
import localFont from "next/font/local";
import {
  buildOrganizationStructuredData,
  getSiteUrl,
  isSearchIndexingDisabled,
  serializeJsonLd,
} from "@/lib/artcovr/seo";
import "./globals.css";

const display = localFont({
  src: [
    {
      path: "../../public/assets/NeueHaasGroteskTextPro-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../public/assets/NeueHaasGroteskTextPro-Medium.woff2",
      weight: "700",
    },
    {
      path: "../../public/assets/NeueHaasGroteskTextPro-Bold.woff2",
      weight: "800",
    },
  ],
  variable: "--font-artcovr",
  display: "swap",
});

const siteUrl = getSiteUrl();
const indexingDisabled = isSearchIndexingDisabled();
const title = "ARTCOVR — Cover art, made yours";
const description =
  "Discover distinctive square cover art and shape a purchased artwork with your own prompt.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — ARTCOVR" },
  description,
  applicationName: "ARTCOVR",
  authors: [{ name: "ARTCOVR", url: siteUrl }],
  creator: "ARTCOVR",
  publisher: "ARTCOVR",
  category: "art",
  alternates: { canonical: "/" },
  formatDetection: { telephone: false, email: false, address: false },
  robots: indexingDisabled
    ? { index: false, follow: false, noarchive: true, noimageindex: true }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "ARTCOVR",
    title,
    description,
    url: siteUrl,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ARTCOVR" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const organization = buildOrganizationStructuredData(siteUrl);

  return (
    <html lang="en" className={display.className} data-theme="red" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=t==='light'||t==='dark'||t==='red'?t:'red'}catch(e){document.documentElement.dataset.theme='red'}",
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organization) }}
        />
        {children}
      </body>
    </html>
  );
}
