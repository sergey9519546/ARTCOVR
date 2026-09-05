import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptStudio } from "@/components/artcovr/PromptStudio";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import type { Artwork } from "@/lib/artcovr/artworks";
import {
  getArtworkBySlug,
  getCheckoutTotal,
  getRelatedArtworks,
  getStaticCatalogParams,
  isCheckoutReady,
} from "@/lib/artcovr/artworks";
import {
  absoluteSiteUrl,
  buildArtworkStructuredData,
  createPageMetadata,
  serializeJsonLd,
} from "@/lib/artcovr/seo";

export function generateStaticParams() {
  return getStaticCatalogParams();
}

type Props = { params: Promise<{ slug: string }> };

function getNativeFileLabel(artwork: Artwork) {
  return artwork.sourceWidth && artwork.sourceHeight && artwork.sourceMimeType
    ? `${artwork.sourceWidth} × ${artwork.sourceHeight}px · ${artwork.sourceMimeType === "image/png" ? "PNG" : "JPEG"}`
    : "Verified source; exact format pending";
}

function getProductMetadataDescription(artwork: Artwork) {
  const licenseDescription =
    artwork.saleMode === "exclusive"
      ? "an exclusive commercial license"
      : artwork.saleMode === "repeatable"
        ? "a non-exclusive commercial license"
        : null;
  const nativeDescription =
    artwork.sourceWidth && artwork.sourceHeight && artwork.sourceMimeType
      ? ` Native ${artwork.sourceWidth} × ${artwork.sourceHeight}px ${artwork.sourceMimeType === "image/png" ? "PNG" : "JPEG"};`
      : "";
  const deliveryDescription = nativeDescription
    ? `${nativeDescription} digital-only delivery.`
    : " Digital-only delivery.";

  return licenseDescription
    ? `${artwork.title}: AI-generated cover artwork with ${licenseDescription}.${deliveryDescription}`
    : `${artwork.title}: AI-generated cover artwork. Commercial licensing details pending owner approval.${deliveryDescription}`;
}

function buildProductStructuredData(artwork: Artwork) {
  const structuredData = buildArtworkStructuredData(artwork);
  const productUrl = absoluteSiteUrl(`/product/${artwork.slug}`);

  return {
    ...structuredData,
    "@graph": structuredData["@graph"].map((entry) =>
      entry["@type"] === "ImageObject"
        ? {
            ...entry,
            license: absoluteSiteUrl("/license"),
            acquireLicensePage: productUrl,
            creditText: "ARTCOVR",
          }
        : entry,
    ),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const art = getArtworkBySlug((await params).slug);
  if (!art) return {};

  return createPageMetadata({
    title: `${art.title} Cover Art License`,
    description: getProductMetadataDescription(art),
    path: `/product/${art.slug}`,
    index: isCheckoutReady(art),
    image: { url: art.image, alt: art.alt },
  });
}

export default async function ProductPage({ params }: Props) {
  const art = getArtworkBySlug((await params).slug);
  if (!art) notFound();
  const jsonLd = buildProductStructuredData(art);
  // Image-vector neighbours from the committed visual index, restricted to
  // works that are actually in the display catalog. Static markup only: no
  // client JavaScript is added to the product page for this section.
  const relatedWorks = getRelatedArtworks(art.slug, 4);
  const checkoutReady = isCheckoutReady(art);
  const licenseMode = art.saleMode === "exclusive"
    ? "Exclusive commercial license"
    : art.saleMode === "repeatable"
      ? "Non-exclusive commercial license"
      : "License mode pending";
  const nativeFileLabel = getNativeFileLabel(art);

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
            {art.category} — cover artwork
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
              <div className="flex justify-between gap-6 py-3"><dt>Native file</dt><dd className="text-right">{nativeFileLabel}</dd></div>
              <div className="flex justify-between gap-6 py-3"><dt>Category</dt><dd className="text-right">{art.category}</dd></div>
            </dl>

            <p className="mt-7 text-sm leading-6 opacity-70">
              {checkoutReady
                ? art.description
                : "This candidate is in the ARTCOVR launch selection. Checkout opens only after commercial rights, price, license mode, and publication are approved."}
            </p>

            {checkoutReady ? (
              <section aria-labelledby="purchase-includes" className="mt-7 border-t border-current/20 pt-5">
                <h2 id="purchase-includes" className="text-[11px] font-bold uppercase tracking-[.1em]">
                  Preview and purchase include
                </h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 opacity-70">
                  <li>Up to 2 successful 1024 × 1024 px watermarked previews before purchase.</li>
                  <li>The native base artwork and your selected preview, when present.</li>
                  <li>Up to 4 successful 2048 × 2048 px purchased generations.</li>
                  <li>30 days of generation and signed-download access after verified payment.</li>
                  <li>Digital-only delivery through My Images; nothing is shipped.</li>
                </ul>
                <p className="mt-4 text-xs leading-5 opacity-60">
                  The base artwork is delivered at the native size and format listed above
                  without upscaling. Confirm your destination&apos;s current pixel and file-format
                  requirements before purchase.
                </p>
              </section>
            ) : null}

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
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true">✓</span> Rights approved
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true">✓</span> Owner-verified source
              </li>
              <li className="flex items-center gap-1.5">
                <Link href="/refunds" className="link-hover">Return policy</Link>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-24"><PromptStudio artwork={art} /></div>
        {relatedWorks.length > 0 ? (
          <section aria-labelledby="related-works" className="mt-24 border-t-2 border-current pt-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="related-works" className="text-[11px] font-bold uppercase tracking-[.1em]">
                  Find similar
                </h2>
                <p className="mt-2 max-w-[44ch] text-sm leading-6 opacity-60">
                  Visually nearest works from the approved catalog, ranked by image similarity.
                </p>
              </div>
              <Link href="/archive" className="link-hover shrink-0 text-[11px] font-bold uppercase tracking-[.1em]">
                Browse archive
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
              {relatedWorks.map((related) => (
                <li key={related.id}>
                  <Link href={`/product/${related.slug}`} className="group block" aria-label={`Open ${related.title}`}>
                    <div className="artcovr-plate relative aspect-square overflow-hidden">
                      <Image
                        src={related.image}
                        alt={related.alt}
                        fill
                        unoptimized
                        loading="lazy"
                        sizes="(min-width: 768px) 25vw, 50vw"
                        className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] group-hover:scale-[1.04]"
                      />
                    </div>
                    <p className="mt-3 text-lg leading-5">{related.title}</p>
                    <p className="mt-[6px] text-[11px] uppercase opacity-60">{related.category}</p>
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
