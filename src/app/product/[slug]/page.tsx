import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptStudio } from "@/components/artcovr/PromptStudio";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import {
  getArtworkBySlug,
  getCheckoutTotal,
  getRelatedArtworks,
  getStaticCatalogParams,
  isCheckoutReady,
} from "@/lib/artcovr/artworks";
import {
  buildArtworkStructuredData,
  createPageMetadata,
  serializeJsonLd,
} from "@/lib/artcovr/seo";

export function generateStaticParams() {
  return getStaticCatalogParams();
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const art = getArtworkBySlug((await params).slug);
  if (!art) return {};

  return createPageMetadata({
    title: art.title,
    description: art.description,
    path: `/product/${art.slug}`,
    index: isCheckoutReady(art),
    image: { url: art.image, alt: art.alt },
  });
}

export default async function ProductPage({ params }: Props) {
  const art = getArtworkBySlug((await params).slug);
  if (!art) notFound();
  const jsonLd = buildArtworkStructuredData(art);
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

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1400px] px-4 pb-24 pt-32 lg:px-7">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[.1em]">
          <Link href="/archive" className="link-hover">Archive</Link><span className="mx-2">/</span><span>{art.title}</span>
        </nav>
        <div className="mt-7 grid gap-10 border-t-2 border-current pt-5 md:grid-cols-[1.1fr_.9fr]">
          <figure className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
            <Image src={art.image} alt={art.alt} fill preload loading="eager" sizes="(min-width: 768px) 56vw, 100vw" className="object-cover" />
          </figure>
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">Artwork preview</p>
            <h1 className="mt-3 break-words text-4xl font-extrabold tracking-tighter md:text-6xl">{art.title}</h1>
            <p className="mt-6 text-sm font-bold uppercase tracking-[.08em]">
              {checkoutReady ? licenseMode : "Rights and pricing pending owner approval"}
            </p>
            <dl className="mt-7 divide-y divide-current/20 border-y border-current/20 text-sm">
              <div className="flex justify-between gap-6 py-3"><dt>Availability</dt><dd className="text-right">{checkoutReady ? "Available" : "Pending"}</dd></div>
              <div className="flex justify-between gap-6 py-3"><dt>License</dt><dd className="text-right">{licenseMode}</dd></div>
              <div className="flex justify-between py-3"><dt>Pricing</dt><dd>{getCheckoutTotal(art.priceCents)}</dd></div>
            </dl>
            <p className="mt-7 max-w-[50ch] text-sm leading-6 opacity-70">
              {checkoutReady
                ? art.description
                : "This candidate is in the ARTCOVR launch selection. Checkout opens only after commercial rights, price, license mode, and publication are approved."}
            </p>
            {checkoutReady ? (
              <Link href={`/checkout/${art.slug}`} className="artcovr-button mt-7 inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">Review license</Link>
            ) : (
              <p className="mt-7 text-xs font-bold uppercase tracking-[.08em] opacity-60">Checkout pending owner approval</p>
            )}
          </section>
        </div>
        <div className="mt-20"><PromptStudio artwork={art} /></div>
        {relatedWorks.length > 0 ? (
          <section aria-labelledby="related-works" className="mt-24 border-t-2 border-current pt-5">
            <h2 id="related-works" className="text-[11px] font-bold uppercase tracking-[.1em]">
              Related works
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
              {relatedWorks.map((related) => (
                <li key={related.id}>
                  <Link href={`/product/${related.slug}`} className="group block" aria-label={`Open ${related.title}`}>
                    <div className="relative aspect-square overflow-hidden bg-[#d2cac3] dark:bg-neutral-800">
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
