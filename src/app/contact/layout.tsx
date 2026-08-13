import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "Contact and Custom Work",
  description: "Contact ARTCOVR about a catalog artwork, licensing question, or custom cover-art inquiry.",
  path: "/contact",
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
