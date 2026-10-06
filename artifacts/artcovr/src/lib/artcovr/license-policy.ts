import type { PolicyDocument } from "./policy-document";

// Existing approved wording. Changing legal commitments requires owner approval.
export const LICENSE_POLICY = {
  eyebrow: "Licensing · Effective August 13, 2026",
  title: "COMMERCIAL COVER ART LICENSE.",
  introduction: "A completed ARTCOVR purchase grants you a commercial license for the purchased base artwork and the clean generated images included with that purchase. You may use those images in commercial creative projects, including music releases and their promotion.",
  sections: [
    {
      heading: "What the license does not allow",
      blocks: [
        { kind: "list", items: [
          "Resell an image as a standalone file, or offer it through a stock, asset, or template library.",
          "Sublicense it for others to reuse independently.",
          "Use it to train an AI model.",
          "Claim authorship or copyright ownership of the AI-generated result.",
          "Use it unlawfully.",
        ] },
      ],
    },
    {
      heading: "Exclusive and repeatable artwork",
      blocks: [
        { kind: "paragraph", text: "Repeatable artwork may be licensed to more than one customer. For exclusive artwork, verified payment removes the work from future sale on ARTCOVR. Exclusive means removal from this storefront; it does not transfer copyright or promise that no visually similar work exists anywhere else." },
        { kind: "paragraph", text: "ARTCOVR publishes and licenses the base artwork and grants you a commercial license to the purchased files. You may not claim authorship of the AI-generated result. Copyright in the base artwork is retained unless a separate written agreement, signed by the rights holder, expressly transfers it." },
      ],
    },
    {
      heading: "Term and territory",
      blocks: [
        { kind: "paragraph", text: "This license is worldwide and perpetual for the downloaded files you receive. It ends for any asset whose access is revoked under Refunds or Terms." },
      ],
    },
    {
      heading: "Refunds",
      blocks: [
        { kind: "paragraph", text: "An approved refund revokes the commercial license for the refunded artwork and disables unused generation access and future signed download links. Files already downloaded cannot be recalled." },
      ],
    },
    {
      heading: "DMCA",
      blocks: [
        { kind: "paragraph", text: "If you believe content on ARTCOVR infringes your copyright, notify us through the contact form with a description of the infringing work, your contact information, a statement of good faith, and your electronic signature." },
      ],
    },
  ],
  links: [{ href: "/legal/terms", label: "Read full terms" }],
} as const satisfies PolicyDocument;
