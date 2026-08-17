import { PublicPage } from "@/components/artcovr/PublicPage";

export default function RefundsPage() {
  return (
    <PublicPage eyebrow="Support" title="REFUNDS">
      <p>
        Refund requests are reviewed by the owner within a reasonable period. If a full refund is approved, the commercial license for the refunded artwork is revoked and unused generation access and future signed download links are disabled.
      </p>
      <p className="mt-6">
        Files already downloaded cannot be recalled. Refunded exclusive artwork is not automatically returned to sale.
      </p>
      <p className="mt-6">
        ARTCOVR is a digital-only storefront. Nothing is shipped; delivery is via signed download links in My Images.
      </p>
      <h2 className="mt-10 text-xl font-bold">European Union and United Kingdom</h2>
      <p className="mt-4">
        If you are in the EU or UK, you have a 14-day right to withdraw from this purchase. Because the content is delivered digitally, that right ends as soon as you download the files or generate images. By completing checkout you agree to this immediate performance and acknowledge that the withdrawal right does not apply once supply has begun.
      </p>
      <p className="mt-6">
        Contact us through the contact form with your purchase email and order details so the request can be reviewed. If you cannot sign in, reply to your purchase confirmation email.
      </p>
    </PublicPage>
  );
}
