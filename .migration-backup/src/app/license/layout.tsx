import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/artcovr/seo";

export const metadata = createPageMetadata({
  title: "Commercial License",
  description: "Review the commercial-use rights and restrictions that apply to ARTCOVR artwork and included generated images.",
  path: "/license",
});

export default function LicenseLayout({ children }: { children: ReactNode }) {
  return children;
}
