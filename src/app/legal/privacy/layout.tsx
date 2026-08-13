import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description: "How ARTCOVR handles account, purchase, prompt, generated-image, inquiry, and service data.",
  path: "/legal/privacy",
});

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
