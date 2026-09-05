import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";

export default function LicensePage() {
  return (
    <PublicPage eyebrow="Licensing · Effective August 13, 2026" title="CLEAR BEFORE CHECKOUT.">
      <p>
        A completed ARTCOVR purchase grants you a commercial license for the purchased
        base artwork and the clean generated images included with that purchase. You may
        use those images in commercial creative projects, including music releases and
        their promotion.
      </p>
      <h2 className="mt-10 text-xl font-bold">What the license does not allow</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6">
        <li>Resell an image as a standalone file, or offer it through a stock, asset, or template library.</li>
        <li>Sublicense it for others to reuse independently.</li>
        <li>Use it to train an AI model.</li>
        <li>Claim authorship or copyright ownership of the AI-generated result.</li>
        <li>Use it unlawfully.</li>
      </ul>
      <h2 className="mt-10 text-xl font-bold">Exclusive and repeatable artwork</h2>
      <p className="mt-4">
        Repeatable artwork may be licensed to more than one customer. For exclusive
        artwork, verified payment removes the work from future sale on ARTCOVR. Exclusive
        means removal from this storefront; it does not transfer copyright or promise that
        no visually similar work exists anywhere else.
      </p>
      <p className="mt-4">
        ARTCOVR publishes and licenses the base artwork and grants you a commercial license to the
        purchased files. You may not claim authorship of the AI-generated result.
        Copyright in the base artwork is retained unless a separate written agreement,
        signed by the rights holder, expressly transfers it.
      </p>
      <h2 className="mt-10 text-xl font-bold">Term and territory</h2>
      <p className="mt-4">
        This license is worldwide and perpetual for the downloaded files you receive. It
        ends for any asset whose access is revoked under Refunds or Terms.
      </p>
      <h2 className="mt-10 text-xl font-bold">Refunds</h2>
      <p className="mt-4">
        An approved refund revokes the commercial license for the refunded artwork and
        disables unused generation access and future signed download links. Files already
        downloaded cannot be recalled.
      </p>
      <h2 className="mt-10 text-xl font-bold">DMCA</h2>
      <p className="mt-4">
        If you believe content on ARTCOVR infringes your copyright, notify us through
        the contact form with a description of the infringing work, your contact
        information, a statement of good faith, and your electronic signature.
      </p>
      <Link href="/legal/terms" className="link-hover mt-8 inline-block text-xs font-bold uppercase tracking-[.08em]">
        Read full terms
      </Link>
    </PublicPage>
  );
}
