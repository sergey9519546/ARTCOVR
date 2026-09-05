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
        Exclusive artwork may be reserved for up to 45 minutes during checkout and is
        removed from ARTCOVR after verified payment. Repeatable artwork remains available
        for other customers under separate non-exclusive licenses.
      </p>

      <h2 className="mt-10 text-xl font-bold">Commercial license</h2>
      <p className="mt-4">
        A completed purchase grants you a commercial license for the purchased base
        artwork and the clean generated images included with that purchase. The license
        permits use in commercial creative projects. It does not transfer copyright,
        ownership of a broad visual style, unpublished working files, or source materials.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6">
        <li>Standalone resale, stock or template sublicensing, or independent redistribution.</li>
        <li>AI-training use.</li>
        <li>False ownership claims, infringement, or unlawful use.</li>
      </ul>
      <p className="mt-4">
        ARTCOVR owns the base artwork and grants you a commercial license to the
        purchased files. You may not claim authorship of the AI-generated result.
        Copyright in the base artwork is retained unless a separate signed agreement
        states otherwise.
      </p>

      <h2 className="mt-10 text-xl font-bold">Generated images and access</h2>
      <p className="mt-4">
        Generation allowances count successful results only. Before purchase, each account
        may create up to two successful 1024 × 1024 px watermarked previews per artwork. A
        completed purchase includes the native base artwork, the selected preview when one
        is attached to checkout, and up to four successful 2048 × 2048 px purchased
        generations. Generation and signed-download access last 30 days from verified
        payment. Delivery is digital-only through My Images; nothing is shipped.
      </p>
      <p className="mt-4">
        Requests may be rejected for safety, technical, or legal reasons. The native base
        artwork is delivered at the dimensions and format shown on its artwork page without
        upscaling. Confirm your destination's current pixel and file-format requirements
        before purchase, and save authorized downloads before access expires.
      </p>

      <h2 className="mt-10 text-xl font-bold">Refunds</h2>
      <p className="mt-4">
        Refund requests are reviewed individually. An approved refund revokes the
        commercial license for the refunded artwork, disables unused generations, and
        disables future signed download links. Files already downloaded cannot be
        recalled, and exclusive artwork is not automatically relisted. Payment disputes or
        reversals may suspend related access while the payment status is resolved.
      </p>

      <h2 className="mt-10 text-xl font-bold">Service availability</h2>
      <p className="mt-4">
        ARTCOVR may protect the service from abuse, correct catalog or pricing errors
        before payment, and pause unavailable generation services. Nothing in these terms
        limits rights that cannot legally be limited in your jurisdiction.
      </p>
      <p className="mt-6">
        If a checkout-specific license and this page conflict, the checkout-specific
        license controls for that purchase.
      </p>
    </PublicPage>
  );
}
