import Link from "next/link";
import { PublicPage } from "@/components/artcovr/PublicPage";

export default function AboutPage() {
  return (
    <PublicPage eyebrow="ARTCOVR" title={<>COVER ART<br />MADE YOURS.</>}>
      <p className="text-2xl font-bold leading-tight tracking-tight">
        ARTCOVR starts with distinctive artwork and gives you one direct way to reshape it.
      </p>
      <p className="mt-8 max-w-[52ch] text-sm leading-6 opacity-80">
        Choose an artwork, describe any change in a freeform prompt, and build from each
        visible generated image. Published works include clear pricing, sale mode,
        commercial-license terms, and customer access through My Images. Images are
        generated with AI from original ARTCOVR compositions.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/archive" className="artcovr-button px-5 py-3 text-xs font-bold uppercase tracking-[.08em]">
          Browse the archive
        </Link>
        <Link href="/license" className="artcovr-button px-5 py-3 text-xs font-bold uppercase tracking-[.08em]">
          Commercial license
        </Link>
      </div>
    </PublicPage>
  );
}
