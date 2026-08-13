import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "Refund Policy",
  description: "Learn how ARTCOVR reviews refund requests and how approved refunds affect downloads, generations, and exclusive artwork.",
  path: "/refunds",
});

export default function RefundsLayout({ children }: { children: ReactNode }) {
  return children;
}
