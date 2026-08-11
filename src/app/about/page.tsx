import Link from "next/link";
import { OutfitWordmark } from "@/components/outfit/Svgs";

export const metadata = { title: "About — OUTFIT® by ++hellohello" };

export default function AboutPage() {
  return (
    <main className="min-h-screen px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <div className="mb-6 h-[5px] w-full bg-current" />
          <h1 className="text-6xl font-[900] tracking-tighter md:text-8xl">About</h1>
        </div>

        <div className="mb-16 w-48 opacity-20"><OutfitWordmark /></div>

        <div className="space-y-8 text-base leading-7 opacity-80">
          <p className="text-2xl font-bold leading-tight tracking-tight opacity-100">
            OUTFIT® is a signature collection by the ++hellohello team — a studio dedicated to thoughtful, elegant, and compelling design.
          </p>
          <p>
            Born from a passion for apparel and a commitment to craft, OUTFIT® celebrates the intersection of typography, fashion, and visual culture. Each piece is carefully designed in Montevideo, Uruguay, and produced in limited runs to ensure quality and exclusivity.
          </p>
          <p>
            We believe clothing should be more than fabric — it should be a statement. Whether worn, judged, or both, every garment in this collection is made to spark conversation and stand the test of time.
          </p>
          <p>
            Our design philosophy is rooted in the principles of modernism: clarity, precision, and purpose. We draw inspiration from Swiss typography, brutalist architecture, and the raw energy of street culture. The result is a collection that feels both timeless and contemporary.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-8 border-t border-current/10 pt-8 md:grid-cols-4">
          <div>
            <p className="text-3xl font-[900] tracking-tighter">2026</p>
            <p className="text-xs uppercase opacity-60">Founded</p>
          </div>
          <div>
            <p className="text-3xl font-[900] tracking-tighter">13</p>
            <p className="text-xs uppercase opacity-60">Products</p>
          </div>
          <div>
            <p className="text-3xl font-[900] tracking-tighter">UY</p>
            <p className="text-xs uppercase opacity-60">Made in</p>
          </div>
          <div>
            <p className="text-3xl font-[900] tracking-tighter">∞</p>
            <p className="text-xs uppercase opacity-60">Passion</p>
          </div>
        </div>

        <div className="mt-16">
          <Link href="/" className="link-hover text-sm uppercase">← Back to shop</Link>
        </div>
      </div>
    </main>
  );
}
