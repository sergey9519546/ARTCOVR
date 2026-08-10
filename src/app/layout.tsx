import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
const outfitFont = localFont({ src: [{ path: "../../public/assets/NeueHaasGroteskTextPro-Regular.woff2", weight: "400", style: "normal" }, { path: "../../public/assets/NeueHaasGroteskTextPro-Medium.woff2", weight: "700", style: "normal" }, { path: "../../public/assets/NeueHaasGroteskTextPro-Bold.woff2", weight: "800", style: "normal" }], variable: "--font-outfit", display: "swap", fallback: ["ui-sans-serif", "system-ui", "Arial", "sans-serif"] });
export const metadata: Metadata = { title: "OUTFIT® by ++hellohello", description: "Created by the ++hellohello team, this store and signature collection celebrates our collective creativity and passion for apparel. Carefully designed.", icons: { icon: "/favicon.ico" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (<html lang="en" suppressHydrationWarning className={`${outfitFont.className}`}><head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t='red';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','red');}})();` }} /></head><body className={`${outfitFont.className} bg-cream selection:bg-red red:bg-cream red:text-red red:selection:bg-black text-black selection:text-white dark:bg-black dark:text-white`}>{children}<Toaster /></body></html>);
}
