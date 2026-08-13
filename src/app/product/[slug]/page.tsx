import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptStudio } from "@/components/artcovr/PromptStudio";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import { displayArtworks, getArtworkBySlug, getCheckoutTotal, isCheckoutReady } from "@/lib/artcovr/artworks";
import {
  buildArtworkStructuredData,
  createPageMetadata,
  serializeJsonLd,
} from "@/lib/artcovr/seo";

export function generateStaticParams() {
  return displayArtworks.map((artwork) => ({ slug: artwork.slug }));
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
      </main>
      <SiteFooter />
    </>
  );
}
