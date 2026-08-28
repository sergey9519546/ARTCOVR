import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to ARTCOVR with a secure email magic link.",
  alternates: { canonical: null },
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
