"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";
import {
  ArtcovrApiError,
  getOwnerCatalogIntelligenceAccess,
  type OwnerCatalogIntelligenceAccess,
} from "@/lib/artcovr/functions";
import { displayArtworks } from "@/lib/artcovr/artworks";
import {
  buildCatalogFacetIndex,
  getExternalPayloadReadiness,
  INTELLIGENCE_PAYLOAD_CONTRACT,
  summarizeCatalogIntelligence,
} from "@/lib/artcovr/catalog-intelligence";
import { getVisualEntry, displayVisualLabel } from "@/lib/artcovr/visual-index";

type AccessState = "loading" | "ready" | "denied" | "error";

function formatFacetValue(value: string) {
  return value
    .replaceAll("__", " / ")
    .replaceAll("_", " ")
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function BarList({
  title,
  values,
}: {
  title: string;
  values: Array<{ value: string; count: number }>;
}) {
  const maximum = values[0]?.count ?? 1;
  return (
    <section className="border-t-2 border-current pt-4" aria-labelledby={`${title}-heading`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${title}-heading`} className="text-xs font-bold uppercase tracking-[.1em]">{title}</h2>
        <span className="text-[11px] opacity-60">{values.length} indexed</span>
      </div>
      <ol className="mt-5 space-y-3">
        {values.slice(0, 8).map(({ value, count }) => (
          <li key={value} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <div>
              <div className="flex justify-between gap-3">
                <span>{formatFacetValue(value)}</span>
                <span className="tabular-nums opacity-60">{count}</span>
              </div>
              <div className="mt-1 h-1 bg-current/10">
                <div className="h-full bg-current" style={{ width: `${Math.max(5, (count / maximum) * 100)}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DiversityMap() {
  const points = useMemo(
    () =>
      displayArtworks.flatMap((artwork) => {
        const entry = getVisualEntry(artwork.slug);
        if (!entry) return [];
        return [{
          slug: artwork.slug,
          title: artwork.title,
          rank: entry.diversityRank,
          style: displayVisualLabel(entry.labels.style?.label ?? "Unclassified"),
          palette: displayVisualLabel(entry.labels.colorblend?.label ?? "Unclassified"),
        }];
      }),
    [],
  );
  const maxRank = Math.max(1, ...points.map((point) => point.rank));

  return (
    <section className="border-t-2 border-current pt-4" aria-labelledby="diversity-map-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="diversity-map-heading" className="text-xs font-bold uppercase tracking-[.1em]">Visual diversity map</h2>
          <p className="mt-2 max-w-[58ch] text-sm leading-6 opacity-70">
            Precomputed diversity order, palette, and style labels. Raw 512-dimensional vectors never enter this browser view.
          </p>
        </div>
        <span className="text-[11px] opacity-60">{points.length} points</span>
      </div>
      <div className="mt-6 border border-current/20 bg-current/[.03] p-3" data-visual-map>
        <div className="relative h-[260px] overflow-hidden border-b border-l border-current/30">
          {points.map((point) => (
            <Link
              key={point.slug}
              href={`/product/${point.slug}`}
              title={`${point.title} · ${point.style} · ${point.palette}`}
              aria-label={`${point.title}, diversity rank ${point.rank}`}
              className="absolute block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current transition-transform hover:scale-150 focus:scale-150"
              style={{
                left: `${(point.rank / maxRank) * 96 + 2}%`,
                top: `${(point.rank * 37) % 88 + 6}%`,
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[10px] font-bold uppercase tracking-[.08em] opacity-60">
          <span>Most distinct</span>
          <span>Catalog sequence</span>
        </div>
      </div>
    </section>
  );
}

function DuplicateReviewState({ enabled }: { enabled: boolean }) {
  const readiness = getExternalPayloadReadiness();
  const duplicatePayload = INTELLIGENCE_PAYLOAD_CONTRACT.duplicates;
  const isUnavailable = !enabled || readiness.missing.includes(duplicatePayload);

  return (
    <section className="border-t-2 border-current pt-4" aria-labelledby="duplicate-review-heading">
      <h2 id="duplicate-review-heading" className="text-xs font-bold uppercase tracking-[.1em]">Duplicate review</h2>
      {isUnavailable ? (
        <div className="mt-5 border-l-2 border-current pl-4" data-state="unavailable">
          <p className="font-bold">Unavailable until the duplicate payload is supplied.</p>
          <p className="mt-2 max-w-[60ch] text-sm leading-6 opacity-70">
            No duplicate candidate is being inferred, deleted, or published. Add {duplicatePayload} to the validated external bundle and enable duplicate review for this curator policy before review suggestions are shown.
          </p>
        </div>
      ) : (
        <p className="mt-5 border-y border-current/20 py-5 text-sm">No duplicate groups are ready for review.</p>
      )}
    </section>
  );
}

export default function CatalogIntelligencePage() {
  const [state, setState] = useState<AccessState>("loading");
  const [message, setMessage] = useState("");
  const [access, setAccess] = useState<OwnerCatalogIntelligenceAccess | null>(null);
  const index = useMemo(() => buildCatalogFacetIndex(displayArtworks), []);
  const summary = useMemo(() => summarizeCatalogIntelligence(index), [index]);

  useEffect(() => {
    let active = true;
    void getOwnerCatalogIntelligenceAccess()
      .then((response) => {
        if (active) {
          setAccess(response);
          setState("ready");
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ArtcovrApiError && error.status === 403) {
          setState("denied");
          setMessage("This workspace is limited to explicitly authorized ARTCOVR owners and administrators.");
        } else {
          setState("error");
          setMessage(error instanceof Error ? error.message : "Curation access is unavailable.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PublicPage eyebrow="Owner workspace" title="CURATION INTELLIGENCE">
      {state === "loading" && <p role="status">Checking curation access…</p>}
      {state === "denied" && (
        <section className="border-y border-current/20 py-10" data-state="access-denied">
          <p className="text-xl font-bold tracking-tight">Access denied.</p>
          <p className="mt-3 max-w-[54ch] text-sm leading-6 opacity-70">{message}</p>
          <Link href="/archive" className="artcovr-button mt-7 inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">
            Return to archive
          </Link>
        </section>
      )}
      {state === "error" && <p role="alert" className="border-l-2 border-[#a11212] pl-4 dark:border-[#ff6b6b]">{message}</p>}
      {state === "ready" && (
        <div className="space-y-14" data-state="ready">
          <section className="grid gap-px border-y border-current/20 bg-current/20 sm:grid-cols-4" aria-label="Catalog summary">
            {[
              ["Approved works", summary.totalWorks],
              ["Visual records", summary.indexedWorks],
              ["Vector reference", `${summary.visualDimensions}d`],
              ["Related links", summary.relatedEdges],
            ].map(([label, value]) => (
              <div key={label} className="bg-[var(--background)] px-4 py-5">
                <p className="text-[11px] font-bold uppercase tracking-[.08em] opacity-60">{label}</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight">{value}</p>
              </div>
            ))}
          </section>
          <div className="grid gap-10 md:grid-cols-3">
            <BarList title="Genres" values={summary.facets.genre} />
            <BarList title="Colors" values={summary.facets.color} />
            <BarList title="Moods" values={summary.facets.mood} />
          </div>
          <BarList title="Styles" values={summary.facets.style} />
          <DiversityMap />
          <DuplicateReviewState enabled={access?.capabilities.duplicateReview ?? false} />
          <section className="border-t border-current/20 pt-4">
            <p className="text-sm leading-6 opacity-70">
              Curation insights are aggregate-only. Approved product and archive links remain the publication boundary; this workspace does not mutate rights, pricing, publication, or checkout state.
            </p>
          </section>
        </div>
      )}
      {state === "ready" && summary.totalWorks === 0 && (
        <section className="border-y border-current/20 py-10" data-state="empty">
          <p className="text-xl font-bold tracking-tight">No approved works are available for curation.</p>
          <p className="mt-3 max-w-[54ch] text-sm leading-6 opacity-70">
            The workspace will show aggregate intelligence after an approved catalog projection is available. No staging work is promoted as a fallback.
          </p>
        </section>
      )}
    </PublicPage>
  );
}