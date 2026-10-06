import { ArchiveSearch } from "@/components/artcovr/ArchiveSearch";
import { ScrollJourney } from "@/components/parity/ScrollJourney";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import { displayArtworks } from "@/lib/artcovr/artworks";

export default function ArchivePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1600px] px-4 pb-24 pt-32 lg:px-7">
        <div className="border-t-2 border-current pt-5 md:grid md:grid-cols-[1.2fr_1fr] md:items-end md:gap-x-12">
          <p className="text-[11px] font-bold uppercase tracking-[.1em]">Curated archive</p>
          <h1 className="mt-5 max-w-[12ch] text-[15vw] font-extrabold leading-[.8] tracking-[-.075em] md:col-start-1 md:text-[min(8vw,110px)]">
            COVER ART.
          </h1>
          <p className="mt-7 max-w-[53ch] text-sm leading-6 md:col-start-2 md:row-span-2 md:row-start-1">
            {displayArtworks.length} owner-approved square cover artworks,
            searchable by music genre, mood, color, and visual topic. Each
            published work has its own commercial license terms.
          </p>
        </div>
        <section aria-label="Artwork archive" className="mt-10 md:mt-12">
          <ArchiveSearch items={displayArtworks} />
        </section>
        <section
          aria-labelledby="archive-editorial-sequence"
          className="mt-24 border-t-2 border-current pt-6"
        >
          <header className="mb-8 grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-end md:gap-12">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.1em]">
                Curated editorial sequence
              </p>
              <h2
                id="archive-editorial-sequence"
                className="mt-3 text-[clamp(2.25rem,7vw,6rem)] font-extrabold leading-[.9] tracking-[-.075em]"
              >
                Selected covers, in sequence.
              </h2>
            </div>
            <p className="max-w-[53ch] text-sm leading-6">
              The covers in this sequence are selected from the full catalog
              above; the full archive remains searchable and filterable there.
            </p>
          </header>
          <ScrollJourney enabled />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
