"use client";
import Link from "next/link";
import { OutfitWordmark } from "@/components/outfit/Svgs";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-12 w-48 mx-auto opacity-30"><OutfitWordmark /></div>
        <h1 className="mb-4 text-[20vw] font-[900] leading-[0.9] tracking-tighter md:text-[12rem]">404</h1>
        <p className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">Page not found</p>
        <p className="mb-12 text-sm opacity-60 md:text-base">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link href="/" className="rounded-full bg-current px-8 py-4 text-sm font-bold uppercase tracking-tight text-background transition-transform hover:scale-105">
            Back to shop
          </Link>
          <Link href="/shipping-and-return" className="link-hover rounded-full border border-current/20 px-8 py-4 text-sm font-bold uppercase tracking-tight">
            Shipping &amp; Returns
          </Link>
        </div>
      </div>
    </main>
  );
}
