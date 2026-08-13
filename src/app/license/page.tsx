import Link from "next/link";
import { PublicPage } from "@/components/artcovr/PublicPage";

export default function LicensePage() {
  return (
    <PublicPage eyebrow="Licensing" title="CLEAR BEFORE CHECKOUT.">
      <p>
        A completed ARTCOVR purchase grants you a commercial license to use the purchased
        base artwork, the selected clean preview included with the order, and successful
        post-purchase generated images made under that purchase. You may use those images
        in commercial creative projects, including music releases and their promotion.
      </p>
      <h2 className="mt-10 text-xl font-bold">What the license does not allow</h2>
      <p className="mt-4">
        You may not resell an image as a standalone file, offer it through a stock, asset,
        or template library, sublicense it for others to reuse independently, use it to
        train an AI model, claim authorship or copyright ownership, or use it unlawfully.
      </p>
      <h2 className="mt-10 text-xl font-bold">Exclusive and repeatable artwork</h2>
      <p className="mt-4">
        Repeatable artwork may be licensed to more than one customer. For exclusive
        artwork, verified payment removes the work from future sale on ARTCOVR. Exclusive
        means removal from this storefront; it does not transfer copyright or promise that
        no visually similar work exists anywhere else.
      </p>
      <p className="mt-6">
        ARTCOVR retains copyright unless a separate written agreement, signed by the
        rights holder, expressly transfers it.
      </p>
      <Link href="/legal/terms" className="link-hover mt-8 inline-block text-xs font-bold uppercase tracking-[.08em]">
        Read full terms
      </Link>
    </PublicPage>
  );
}
