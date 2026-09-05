import { useParams } from "wouter";
import { CheckoutReview } from "@/components/artcovr/CheckoutReview";
import { SiteFooter } from "@/components/artcovr/SiteFooter";
import { SiteHeader } from "@/components/artcovr/SiteHeader";
import { getArtworkBySlug } from "@/lib/artcovr/artworks";
import NotFound from "@/pages/not-found";

export default function CheckoutPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const artwork = getArtworkBySlug(slug);
  if (!artwork) return <NotFound />;
  return (
    <>
      <SiteHeader />
      <CheckoutReview artwork={artwork} />
      <SiteFooter />
    </>
  );
}