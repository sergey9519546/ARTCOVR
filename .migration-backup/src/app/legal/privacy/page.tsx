import { PublicPage } from "@/components/artcovr/PublicPage";

export default function PrivacyPage() {
  return (
    <PublicPage eyebrow="Legal · Effective August 13, 2026" title="PRIVACY">
      <p>
        ARTCOVR uses the minimum account, purchase, prompt, image, and inquiry information
        needed to operate the storefront. We do not sell personal information.
      </p>

      <h2 className="mt-10 text-xl font-bold">Information we handle</h2>
      <p className="mt-4">
        We process your email address and authentication records; purchases, license state,
        and refund status; prompts and generated-image records; download and allowance
        state; custom-work inquiries; and basic security, performance, and diagnostic logs.
        Essential browser storage may remember session and editing state.
      </p>

      <h2 className="mt-10 text-xl font-bold">Service providers</h2>
      <p className="mt-4">
        Supabase provides authentication, database, and private file storage. Stripe
        processes checkout and payment events; ARTCOVR does not store complete payment-card
        numbers. OpenAI receives the selected image and your prompt to produce a requested
        generated image. Hosting, delivery, email, and security providers process limited
        technical data needed to provide their services.
      </p>

      <h2 className="mt-10 text-xl font-bold">Retention and access</h2>
      <p className="mt-4">
        Unselected preview access expires after seven days. Purchased generation and signed
        download access expires after thirty days unless the purchase page states
        otherwise. Expiration of a link is not a promise that every operational, backup,
        fraud-prevention, or transaction record is immediately erased. Purchase and license
        records may be retained for accounting, dispute, and legal obligations.
      </p>
      <p className="mt-4">
        Contact ARTCOVR to request access, correction, or deletion where applicable. A
        deletion request may not remove records that must be retained to document a license,
        payment, refund, security incident, or legal obligation.
      </p>

      <h2 className="mt-10 text-xl font-bold">Security and age</h2>
      <p className="mt-4">
        Clean artwork and generated files are kept in private storage and released through
        short-lived authorized links. No internet service can guarantee absolute security.
        ARTCOVR is not intended for children under 13.
      </p>
    </PublicPage>
  );
}
