// Owner-approved provider disclosure. Keep legal commitments unchanged unless
// the owner approves a further policy revision.
export const PRIVACY_POLICY = {
  eyebrow: "Legal · Effective August 13, 2026",
  title: "PRIVACY",
  introduction:
    "ARTCOVR uses the minimum account, purchase, prompt, image, and inquiry information needed to operate the storefront. We do not sell personal information.",
  sections: [
    {
      heading: "Information we handle",
      paragraphs: [
        "We process your email address and authentication records; purchases, license state, and refund status; prompts and generated-image records; download and allowance state; custom-work inquiries; and basic security, performance, and diagnostic logs. Essential browser storage may remember session and editing state.",
      ],
    },
    {
      heading: "Service providers",
      paragraphs: [
        "Clerk provides authentication. ARTCOVR stores account and purchase records in a PostgreSQL database and private files in Replit object storage. Stripe processes checkout and payment events; ARTCOVR does not store complete payment-card numbers. OpenAI receives the selected image and your prompt to produce a requested generated image. Hosting, delivery, email, and security providers process limited technical data needed to provide their services.",
      ],
    },
    {
      heading: "Retention and access",
      paragraphs: [
        "Unselected preview access expires after seven days. Purchased generation and signed download access expires after thirty days unless the purchase page states otherwise. Expiration of a link is not a promise that every operational, backup, fraud-prevention, or transaction record is immediately erased. Purchase and license records may be retained for accounting, dispute, and legal obligations.",
        "Contact ARTCOVR to request access, correction, or deletion where applicable. A deletion request may not remove records that must be retained to document a license, payment, refund, security incident, or legal obligation.",
      ],
    },
    {
      heading: "Security and age",
      paragraphs: [
        "Clean artwork and generated files are kept in private storage and released through short-lived authorized links. No internet service can guarantee absolute security. ARTCOVR is not intended for children under 13.",
      ],
    },
  ],
} as const;
