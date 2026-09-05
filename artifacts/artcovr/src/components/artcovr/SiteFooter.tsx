import Link from "@/components/compat/Link";

export function SiteFooter() {
  return (
    <footer className="px-4 pb-8 lg:px-7">
      <div className="h-[2px] bg-current" />
      <div className="grid gap-12 py-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <p className="max-w-[36ch] text-2xl font-extrabold tracking-tight">
          Distinctive cover art, shaped by your prompt.
        </p>
        <div className="text-xs font-bold uppercase leading-7 tracking-[0.08em]">
          <Link href="/license" className="link-hover block w-fit">License</Link>
          <Link href="/refunds" className="link-hover block w-fit">Refunds</Link>
          <Link href="/faq" className="link-hover block w-fit">FAQ</Link>
          <Link href="/about" className="link-hover block w-fit">About</Link>
        </div>
        <div className="text-xs font-bold uppercase leading-7 tracking-[0.08em]">
          <Link href="/contact" className="link-hover block w-fit">Custom inquiry</Link>
          <Link href="/archive" className="link-hover block w-fit">Archive</Link>
          <Link href="/my-images" className="link-hover block w-fit">My Images</Link>
        </div>
        <div className="text-xs font-bold uppercase leading-7 tracking-[0.08em]">
          <Link href="/legal/privacy" className="link-hover block w-fit">Privacy</Link>
          <Link href="/legal/terms" className="link-hover block w-fit">Terms</Link>
        </div>
      </div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-60">© 2026 ARTCOVR</p>
    </footer>
  );
}
