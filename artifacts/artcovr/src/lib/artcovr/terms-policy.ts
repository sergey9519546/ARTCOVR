import type { PolicyDocument } from "./policy-document";

// Existing approved wording. Changing legal commitments requires owner approval.
export const TERMS_POLICY = {
  eyebrow: "Legal · Effective August 13, 2026",
  title: "TERMS",
  introduction: "These terms govern your use of ARTCOVR, individual artwork purchases, included image-generation access, and downloads. By purchasing, you agree to the license shown during checkout and these terms.",
  sections: [
    {
      heading: "Purchases and fulfillment",
      blocks: [
        { kind: "paragraph", text: "Each checkout covers one artwork at the price shown in USD. Stripe processes the payment. Access begins only after ARTCOVR verifies payment through its payment webhook; a browser success page alone does not prove fulfillment." },
        { kind: "paragraph", text: "Exclusive artwork is reserved for one checkout at a time for about 30 minutes and is removed from ARTCOVR after verified payment. An expired or failed reservation is released. A cover that is already reserved or sold cannot be purchased again. Repeatable artwork remains available for other customers under separate non-exclusive licenses." },
      ],
    },
    {
      heading: "Commercial license",
      blocks: [
        { kind: "paragraph", text: "A completed purchase grants you a commercial license for the purchased base artwork and the clean generated images included with that purchase. The license permits use in commercial creative projects. It does not transfer copyright, ownership of a broad visual style, unpublished working files, or source materials." },
        { kind: "list", items: [
          "Standalone resale, stock or template sublicensing, or independent redistribution.",
          "AI-training use.",
          "False ownership claims, infringement, or unlawful use.",
        ] },
        { kind: "paragraph", text: "ARTCOVR publishes and licenses the base artwork and grants you a commercial license to the purchased files. You may not claim authorship of the AI-generated result. Copyright in the base artwork is retained unless a separate signed agreement states otherwise." },
      ],
    },
    {
      heading: "Generated images and access",
      blocks: [
        { kind: "paragraph", text: "Generation allowances count successful results only. Requests may be rejected for safety, technical, or legal reasons. Purchased generation and signed-download access is time-limited as shown in My Images. You are responsible for saving authorized downloads before access expires." },
      ],
    },
    {
      heading: "Refunds",
      blocks: [
        { kind: "paragraph", text: "Refund requests are reviewed individually. An approved refund revokes the commercial license for the refunded artwork, disables unused generations, and disables future signed download links. Files already downloaded cannot be recalled, and exclusive artwork is not automatically relisted. Payment disputes or reversals may suspend related access while the payment status is resolved." },
      ],
    },
    {
      heading: "Service availability",
      blocks: [
        { kind: "paragraph", text: "ARTCOVR may protect the service from abuse, correct catalog or pricing errors before payment, and pause unavailable generation services. Nothing in these terms limits rights that cannot legally be limited in your jurisdiction." },
        { kind: "paragraph", spacing: "wide", text: "If a checkout-specific license and this page conflict, the checkout-specific license controls for that purchase." },
      ],
    },
  ],
} as const satisfies PolicyDocument;
