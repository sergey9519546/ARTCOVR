import { PublicPage } from "@/components/artcovr/PublicPage";
import { serializeJsonLd, buildFaqStructuredData } from "@/lib/artcovr/seo";

const questions = [
  ["What am I licensing?", "A commercial license to use the purchased artwork and your included generated images in commercial projects. ARTCOVR owns the base artwork and grants you a commercial license to the purchased files. You may not claim authorship of the AI-generated result."],
  ["Can I alter the image?", "Yes. The artwork page has one freeform prompt box. Each successful generated image becomes the starting point for your next prompt, and Reset returns to the original artwork."],
  ["What is exclusive artwork?", "Exclusive artwork is reserved during checkout and removed from ARTCOVR after verified payment. Exclusivity does not assign copyright or promise worldwide uniqueness."],
  ["What is repeatable artwork?", "Repeatable artwork may be purchased by more than one customer under a non-exclusive commercial license."],
  ["Are the images AI-generated?", "Yes. The base artwork is an original ARTCOVR composition. Generated results are produced by a third-party AI model from your prompt and delivered under the commercial license."],
  ["Where are my images?", "Sign in to My Images to see purchases, prompts, generated images, remaining generations, expiration dates, and downloads."],
  ["What is your refund window?", "Refund requests are reviewed by the owner within a reasonable period. Approved refunds revoke the commercial license for the refunded artwork and disable unused generations and download links."],
  ["Can I resell the image file itself?", "No. Standalone resale, stock or template redistribution, and sublicensing for independent reuse are prohibited."],
  ["Can I use purchased images to train a model?", "No. AI-training use is not included in the commercial license."],
] as const;

export default function FaqPage() {
  const jsonLd = buildFaqStructuredData(
    questions.map(([question, answer]) => ({ question, answer })),
  );
  return (
    <PublicPage eyebrow="Support" title="FAQ">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <p className="mb-8 max-w-[62ch] text-sm leading-6 opacity-70">
        ARTCOVR is a digital cover art storefront. These answers explain how
        commercial licensing, prompt-based editing, payment verification, and
        downloads work.
      </p>
      <dl className="divide-y divide-current/20 border-y border-current/20">
        {questions.map(([question, answer]) => (
          <div key={question} className="py-6">
            <dt className="font-bold">
              <h2>{question}</h2>
            </dt>
            <dd className="mt-3 text-sm leading-6 opacity-70">{answer}</dd>
          </div>
        ))}
      </dl>
    </PublicPage>
  );
}
