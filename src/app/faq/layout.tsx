import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "Frequently Asked Questions",
  description: "Answers about ARTCOVR artwork licensing, prompt editing, exclusive artwork, downloads, and customer access.",
  path: "/faq",
});

export default function FaqLayout({ children }: { children: ReactNode }) {
  return children;
}
