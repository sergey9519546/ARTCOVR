import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";
import {
  ANSWER_GUIDE_BY_PATH,
  type AnswerGuide,
} from "@/lib/artcovr/answer-guides";
import { artworks } from "@/lib/artcovr/artworks";
import { selectPublicCatalog } from "@/lib/artcovr/catalog-visibility";

const publicArtwork = selectPublicCatalog(artworks).slice(0, 6);

function GuidePage({ guide }: { guide: AnswerGuide }) {
  return (
    <PublicPage eyebrow={guide.eyebrow} title={guide.displayTitle}>
      <p className="text-2xl font-bold leading-tight tracking-tight">
        {guide.introduction}
      </p>

      <section
        className="mt-8 border-y border-current/25 py-6"
        aria-labelledby="guide-takeaways"
      >
        <h2 id="guide-takeaways" className="text-sm font-extrabold uppercase tracking-[.12em]">
          Key takeaways
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 opacity-80">
          {guide.keyTakeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
      </section>

      <div className="mt-12 space-y-10">
        {guide.sections.map((section, index) => {
          const headingId = `guide-question-${index + 1}`;
          return (
          <section key={section.heading} aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="text-2xl font-extrabold leading-tight tracking-tight"
            >
              {section.heading}
            </h2>
            <p className="mt-3 text-sm leading-6 opacity-80">{section.answer}</p>
          </section>
          );
        })}
      </div>

      <section className="mt-14 border-t border-current/25 pt-8" aria-labelledby="guide-sources">
        <h2 id="guide-sources" className="text-2xl font-extrabold tracking-tight">
          Sources and scope
        </h2>
        <p className="mt-3 text-sm leading-6 opacity-80">
          This page is general information, not legal advice. External sources provide
          general context; the ARTCOVR license and terms control an ARTCOVR purchase.
        </p>
        <ul className="mt-5 space-y-4 text-sm leading-6">
          {guide.sources.map((source) => (
            <li key={source.href}>
              <a
                href={source.href}
                className="font-bold underline underline-offset-4"
                {...(source.href.startsWith("http")
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              >
                {source.title}
              </a>{" "}
              <span className="opacity-70">— {source.publisher}. {source.description}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs uppercase tracking-[.1em] opacity-60">
          Last reviewed {guide.lastReviewed}
        </p>
      </section>

      <section className="mt-14 border-t border-current/25 pt-8" aria-labelledby="guide-artwork">
        <h2 id="guide-artwork" className="text-2xl font-extrabold tracking-tight">
          Browse licensed cover artwork
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {publicArtwork.map((artwork) => (
            <li key={artwork.slug}>
              <Link
                href={`/product/${encodeURIComponent(artwork.slug)}`}
                className="block border-t border-current/20 py-3 text-sm font-bold underline-offset-4 hover:underline"
              >
                {artwork.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav className="mt-12 flex flex-wrap gap-4" aria-label="Related guidance">
        {guide.links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="artcovr-button px-5 py-3 text-xs font-bold uppercase tracking-[.08em]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </PublicPage>
  );
}

function guide(path: string) {
  const value = ANSWER_GUIDE_BY_PATH.get(path);
  if (!value) throw new Error(`Missing ARTCOVR answer guide: ${path}`);
  return value;
}

export function CoverArtLicensingGuidePage() {
  return <GuidePage guide={guide("/guides/cover-art-licensing")} />;
}

export function ExclusiveCoverArtGuidePage() {
  return <GuidePage guide={guide("/guides/exclusive-cover-art")} />;
}

export function AiGeneratedCoverArtGuidePage() {
  return <GuidePage guide={guide("/guides/ai-generated-cover-art")} />;
}