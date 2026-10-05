import { PublicPage } from "@/components/artcovr/PublicPage";
import { FAQ_QUESTIONS as questions } from "@/lib/artcovr/route-structured-data";

export default function FaqPage() {
  return (
    <PublicPage eyebrow="Support" title="FAQ">
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
