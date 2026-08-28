import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description: "Terms governing ARTCOVR purchases, commercial licenses, image generation, downloads, refunds, and prohibited uses.",
  path: "/legal/terms",
});

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
