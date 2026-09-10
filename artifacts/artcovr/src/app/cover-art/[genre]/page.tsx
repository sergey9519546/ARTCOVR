import { useParams } from "wouter";
import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { displayArtworks } from "@/lib/artcovr/artworks";
import {
  displayGenreLabel,
  genreFromPath,
  getArtworkGenres,
  hasGenreMatch,
} from "@/lib/artcovr/genre-index";

export default function GenreCoverArtPage() {
  const { genre: rawGenre = "" } = useParams<{ genre: string }>();
  const genre = genreFromPath(`/cover-art/${rawGenre}`);
  if (!genre) {
    return (
      <PublicPage eyebrow="Not found" title="Cover art collection not found.">
        <Link href="/cover-art" className="underline underline-offset-4">
          Browse cover art by genre
        </Link>
      </PublicPage>
    );
  }

  const label = displayGenreLabel(genre);
  const matching = displayArtworks.filter((artwork) =>
    hasGenreMatch(artwork, genre, (item) => getArtworkGenres(item)),
  );

  return (
    <PublicPage eyebrow={`${label} collection`} title={`${label} cover art.`}>
      <p className="text-xl font-bold leading-tight tracking-tight">
        Browse {matching.length} curated {label} cover artworks for album
        covers, singles, and other music releases.
      </p>
      <p className="mt-5 max-w-[60ch] text-sm leading-6 opacity-80">
        Each published work includes clear commercial licensing and prompt-based
        editing options.
      </p>
      <ul className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2">
        {matching.map((artwork) => (
          <li key={artwork.slug}>
            <Link href={`/product/${encodeURIComponent(artwork.slug)}`} className="group block">
              <img
                src={artwork.image}
                alt={artwork.alt}
                width={1200}
                height={1200}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <span className="mt-3 block text-lg font-extrabold group-hover:underline">
                {artwork.title}
              </span>
              <span className="mt-1 block text-sm leading-6 opacity-70">
                {artwork.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/archive" className="artcovr-button px-5 py-3 text-xs font-bold uppercase tracking-[.08em]">
          Search every artwork
        </Link>
        <Link href="/cover-art" className="px-5 py-3 text-xs font-bold uppercase tracking-[.08em] underline underline-offset-4">
          Browse other genres
        </Link>
      </div>
    </PublicPage>
  );
}