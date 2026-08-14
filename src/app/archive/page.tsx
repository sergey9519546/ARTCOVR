import type { Metadata } from "next";
import { ArchiveSearch } from "@/components/artcovr/ArchiveSearch";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import { displayArtworks, isPrivateStaging } from "@/lib/artcovr/artworks";
import {
  absoluteSiteUrl,
  createPageMetadata,
  getSiteUrl,
  serializeJsonLd,
} from "@/lib/artcovr/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Archive",
  description: "Explore ARTCOVR's focused launch catalog of square cover artwork.",
  path: "/archive",
});

export default function ArchivePage() {
  const siteUrl = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: displayArtworks.map((art, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: art.title,
      image: absoluteSiteUrl(art.image, siteUrl),
      url: absoluteSiteUrl(`/product/${art.slug}`, siteUrl),
    })),
  };

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
            {isPrivateStaging
              ? "A private visual-review selection from the owner's collection. Availability, commercial rights, license mode, and pricing activate only after final approval."
              : "A focused collection of owner-approved cover artwork."}
          </p>
        </div>
        <section aria-label="Artwork archive" className="mt-20">
          <ArchiveSearch items={displayArtworks} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
