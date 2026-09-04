import { ArchiveSearch } from "@/components/artcovr/ArchiveSearch";
import { ScrollJourney } from "@/components/parity/ScrollJourney";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import { displayArtworks } from "@/lib/artcovr/artworks";
import {
  buildArtworkCollectionStructuredData,
  getSiteUrl,
  serializeJsonLd,
} from "@/lib/artcovr/seo";

export default function ArchivePage() {
  const siteUrl = getSiteUrl();
  const jsonLd = buildArtworkCollectionStructuredData(displayArtworks, siteUrl, {
    path: "/archive",
    name: "ARTCOVR cover art archive",
    description:
      "A searchable archive of owner-approved square cover artwork organized by genre, mood, color, and visual topic.",
  });

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1600px] px-4 pb-24 pt-32 lg:px-7">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <div className="border-t-2 border-current pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[.1em]">Curated archive</p>
          <h1 className="mt-5 max-w-[12ch] text-[15vw] font-extrabold leading-[.8] tracking-[-.075em] md:text-[10vw]">
            COVER ART.
          </h1>
          <p className="mt-7 max-w-[53ch] text-sm leading-6">
            {displayArtworks.length} owner-approved square cover artworks,
            searchable by music genre, mood, color, and visual topic. Each
            published work has its own commercial license terms.
          </p>
        </div>
        <section aria-label="Artwork archive" className="mt-20">
          <ArchiveSearch items={displayArtworks} />
        </section>
        <ScrollJourney enabled />
      </main>
      <SiteFooter />
    </>
  );
}
