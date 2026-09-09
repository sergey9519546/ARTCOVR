import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { displayArtworks } from "@/lib/artcovr/artworks";
import {
  displayGenreLabel,
  genrePath,
  getAvailableMusicGenres,
  getArtworkGenres,
} from "@/lib/artcovr/genre-index";

export default function GenreIndexPage() {
  const genres = getAvailableMusicGenres(displayArtworks, (artwork) =>
    getArtworkGenres(artwork).map(displayGenreLabel),
  );

  return (
    <PublicPage eyebrow="Genre collection" title="Music cover art by genre.">
      <p className="text-xl font-bold leading-tight tracking-tight">
        Explore owner-approved cover artwork through the music lanes that shape
        the ARTCOVR catalog.
      </p>
      <p className="mt-5 max-w-[60ch] text-sm leading-6 opacity-80">
        Each collection is built from real catalog metadata and links directly
        to available works for album covers, singles, and other music releases.
      </p>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {genres.map((genre) => {
          const count = displayArtworks.filter((artwork) =>
            getArtworkGenres(artwork).includes(genre),
          ).length;
          return (
            <li key={genre}>
              <Link
                href={genrePath(genre)}
                className="block border-t border-current/20 py-4 hover:underline"
              >
                <span className="text-xl font-extrabold">
                  {displayGenreLabel(genre)} cover art
                </span>
                <span className="mt-1 block text-sm opacity-70">
                  {count} curated {count === 1 ? "work" : "works"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/archive"
        className="artcovr-button mt-10 inline-flex px-5 py-3 text-xs font-bold uppercase tracking-[.08em]"
      >
        Browse the complete archive
      </Link>
    </PublicPage>
  );
}