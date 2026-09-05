import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Checkout Review",
  description: "Review one ARTCOVR artwork and its commercial license before continuing to secure checkout.",
  alternates: { canonical: null },
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
};

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
