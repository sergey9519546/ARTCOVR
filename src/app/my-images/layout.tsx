import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My Images",
  description: "Private ARTCOVR purchases, prompts, generated images, and downloads.",
  alternates: { canonical: null },
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
};

export default function MyImagesLayout({ children }: { children: ReactNode }) {
  return children;
}
