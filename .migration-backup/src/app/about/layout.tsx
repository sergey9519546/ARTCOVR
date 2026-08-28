import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "About ARTCOVR",
  description: "Learn how ARTCOVR combines distinctive cover artwork, prompt-based image editing, and clear commercial licensing.",
  path: "/about",
});

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
