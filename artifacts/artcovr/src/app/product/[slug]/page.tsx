import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import { useParams } from "wouter";
import { PromptStudio } from "@/components/artcovr/PromptStudio";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import {
  getArtworkBySlug,
  displayGenreLabel,
  getCheckoutTotal,
  getArtworkGenres,
  getRelatedArtworks,
  isCheckoutReady,
} from "@/lib/artcovr/artworks";
import {
  buildArtworkStructuredData,
  serializeJsonLd,
} from "@/lib/artcovr/seo";
import NotFound from "@/pages/not-found";

export default function ProductPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const art = getArtworkBySlug(slug);
  if (!art) return <NotFound />;

  const jsonLd = buildArtworkStructuredData(art);
  const relatedWorks = getRelatedArtworks(art.slug, 4);
  const genres = getArtworkGenres(art);
  const checkoutReady = isCheckoutReady(art);
  const licenseMode = art.saleMode === "exclusive"
    ? "Exclusive commercial license"
    : art.saleMode === "repeatable"
      ? "Non-exclusive commercial license"
      : "License mode pending";

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1400px] px-4 pb-24 pt-32 lg:px-7">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[.1em]">
          <Link href="/archive" className="link-hover">Archive</Link><span className="mx-2">/</span><span>{art.title}</span>
        </nav>

        <header className="mt-7 border-t-2 border-current pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">
            {genres.slice(0, 2).map(displayGenreLabel).join(" · ")} — cover artwork
          </p>
          <h1 className="mt-3 max-w-[16ch] break-words text-5xl font-extrabold tracking-tighter md:text-7xl lg:text-8xl">
            {art.title}
          </h1>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.45fr_.55fr] lg:gap-14">
          <figure className="artcovr-plate relative aspect-square overflow-hidden">
            <Image src={art.image} alt={art.alt} fill preload loading="eager" sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover" />
          </figure>

          <section aria-labelledby="license-summary" className="lg:sticky lg:top-24 lg:self-start">
            <h2 id="license-summary" className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">
              License and pricing
            </h2>
            <p className="mt-3 text-2xl font-extrabold tracking-tight">
              {checkoutReady ? getCheckoutTotal(art.priceCents) : "Price pending"}
            </p>
            <p className="mt-2 text-sm font-bold uppercase tracking-[.08em]">
              {checkoutReady ? licenseMode : "Rights and pricing pending owner approval"}
            </p>

            {checkoutReady ? (
              <Link href={`/checkout/${art.slug}`} className="artcovr-button mt-6 inline-block w-full px-5 py-4 text-center text-xs font-bold uppercase tracking-[.08em]">Review license</Link>
            ) : (
              <p className="mt-6 border border-current/25 px-4 py-3 text-xs font-bold uppercase tracking-[.08em] opacity-60">Checkout pending owner approval</p>
            )}

            <dl className="mt-7 divide-y divide-current/20 border-y border-current/20 text-sm">
              <div className="flex justify-between gap-6 py-3"><dt>Availability</dt><dd className="text-right">{checkoutReady ? "Available" : "Pending"}</dd></div>
              <div className="flex justify-between gap-6 py-3"><dt>License</dt><dd className="text-right">{licenseMode}</dd></div>
              <div className="flex justify-between gap-6 py-3"><dt>Pricing</dt><dd className="text-right">{getCheckoutTotal(art.priceCents)}</dd></div>
              <div className="flex justify-between gap-6 py-3"><dt>Genre</dt><dd className="text-right">{genres.map(displayGenreLabel).join(" · ")}</dd></div>
              <div className="flex justify-between gap-6 py-3"><dt>Visual category</dt><dd className="text-right">{art.category}</dd></div>
            </dl>

            <p className="mt-7 text-sm leading-6 opacity-70">
              {checkoutReady
                ? art.description
                : "This candidate is in the ARTCOVR launch selection. Checkout opens only after commercial rights, price, license mode, and publication are approved."}
            </p>

            {art.moodTags.length > 0 ? (
              <ul className="mt-6 flex flex-wrap gap-2">
                {art.moodTags.map((tag) => (
                  <li key={tag} className="border border-current/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] opacity-70">
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-bold uppercase tracking-[.08em] opacity-60">
              <li className="flex items-center gap-1.5"><span aria-hidden="true">✓</span> Rights approved</li>
              <li className="flex items-center gap-1.5"><span aria-hidden="true">✓</span> Owner-verified source</li>
              <li className="flex items-center gap-1.5"><Link href="/refunds" className="link-hover">Return policy</Link></li>
            </ul>
          </section>
        </div>

        <div className="mt-24"><PromptStudio artwork={art} /></div>
        {relatedWorks.length > 0 ? (
          <section aria-labelledby="related-works" className="mt-24 border-t-2 border-current pt-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="related-works" className="text-[11px] font-bold uppercase tracking-[.1em]">Find similar</h2>
                <p className="mt-2 max-w-[44ch] text-sm leading-6 opacity-60">Visually nearest works from the approved catalog, ranked by image similarity.</p>
              </div>
              <Link href="/archive" className="link-hover shrink-0 text-[11px] font-bold uppercase tracking-[.1em]">Browse archive</Link>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
              {relatedWorks.map((related) => (
                <li key={related.id}>
                  <Link href={`/product/${related.slug}`} className="group block" aria-label={`Open ${related.title}`}>
                    <div className="artcovr-plate relative aspect-square overflow-hidden">
                      <Image src={related.image} alt={related.alt} fill unoptimized loading="lazy" sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] group-hover:scale-[1.04]" />
                    </div>
                    <p className="mt-3 text-lg leading-5">{related.title}</p>
                    <p className="mt-[6px] text-[11px] uppercase opacity-60">
                      {getArtworkGenres(related).slice(0, 2).map(displayGenreLabel).join(" · ")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}