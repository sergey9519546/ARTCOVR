import { notFound } from "next/navigation";
import { CheckoutReview } from "@/components/artcovr/CheckoutReview";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import { getArtworkBySlug } from "@/lib/artcovr/artworks";
export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) { const artwork = getArtworkBySlug((await params).slug); if (!artwork) notFound(); return <><SiteHeader /><CheckoutReview artwork={artwork} /><SiteFooter /></>; }
