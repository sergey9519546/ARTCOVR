import { PublicPage } from "@/components/artcovr/PublicPage";

export default function TermsPage() {
  return (
    <PublicPage eyebrow="Legal · Effective August 13, 2026" title="TERMS">
      <p>
        These terms govern your use of ARTCOVR, individual artwork purchases, included
        image-generation access, and downloads. By purchasing, you agree to the license
        shown during checkout and these terms.
      </p>

      <h2 className="mt-10 text-xl font-bold">Purchases and fulfillment</h2>
      <p className="mt-4">
        Each checkout covers one artwork at the price shown in USD. Stripe processes the
        payment. Access begins only after ARTCOVR verifies payment through its payment
        webhook; a browser success page alone does not prove fulfillment.
      </p>
      <p className="mt-4">
        Exclusive artwork may be reserved temporarily during checkout and is removed from
        ARTCOVR after verified payment. Repeatable artwork remains available for other
        customers under separate non-exclusive licenses.
      </p>

      <h2 className="mt-10 text-xl font-bold">Commercial license</h2>
      <p className="mt-4">
        A completed purchase grants the buyer a commercial license for the purchased base
        artwork and the clean generated images included with that purchase. The license
        permits use in commercial creative projects. It does not transfer copyright,
        ownership of a broad visual style, unpublished working files, or source materials.
      </p>
      <p className="mt-4">
        Standalone resale, stock or template sublicensing, independent redistribution,
        AI-training use, false ownership claims, infringement, and unlawful use are
        prohibited. ARTCOVR retains copyright unless a separate signed agreement states
        otherwise.
      </p>

      <h2 className="mt-10 text-xl font-bold">Generated images and access</h2>
      <p className="mt-4">
        Generation allowances count successful results only. Requests may be rejected for
        safety, technical, or legal reasons. Purchased generation and signed-download
        access is time-limited as shown in My Images. You are responsible for saving
        authorized downloads before access expires.
      </p>

      <h2 className="mt-10 text-xl font-bold">Refunds</h2>
      <p className="mt-4">
        Refund requests are reviewed individually. An approved full refund disables unused
        generations and future signed download links. Files already downloaded cannot be
        recalled, and exclusive artwork is not automatically relisted. Payment disputes or
        reversals may suspend related access while the payment status is resolved.
      </p>

      <h2 className="mt-10 text-xl font-bold">Service availability</h2>
      <p className="mt-4">
        ARTCOVR may protect the service from abuse, correct catalog or pricing errors before
        payment, and pause unavailable generation services. Nothing in these terms limits
        rights that cannot legally be limited in your jurisdiction.
      </p>
      <p className="mt-6">
        If a checkout-specific license and this page conflict, the checkout-specific
        license controls for that purchase.
      </p>
    </PublicPage>
  );
}
