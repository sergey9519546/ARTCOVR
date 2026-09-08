"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { ArtworkGrid } from "./ArtworkGrid";
import { DiscoveryControls } from "./DiscoveryControls";
import { applyCatalogView, type CatalogView } from "./CatalogControls";
import { displayGenreLabel, type Artwork } from "@/lib/artcovr/artworks";
import { hybridSearch } from "@/lib/artcovr/semantic-search";
import { buildCatalogFacetIndex } from "@/lib/artcovr/catalog-intelligence";
import { rankSimilarArtwork, rankGenreArtwork, normalizeDiscoveryGenre, type ArtworkSimilarityMode } from "@/lib/artcovr/discovery-index";
import { CRATE_STORAGE_KEY, readSavedSlugs, orderDiscoveryArtwork, type DiscoveryOrder } from "@/lib/artcovr/discovery-state";
import { trackEvent } from "@/lib/artcovr/analytics";

const SIMILAR_MODES = { visual: "Image connections", palette: "Shared palette", mood: "Shared mood" } as const;

export function ArchiveSearch({ items }: { items: Artwork[] }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const seedContext = useRef<HTMLElement>(null);
  const seedHeading = useRef<HTMLHeadingElement>(null);
  const previousSeedSlug = useRef<string | undefined>(undefined);
  const [location, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const query = params.get("query") ?? "";
  const rawGenre = params.get("genre") || null;
  const view: CatalogView = { genre: rawGenre ? normalizeDiscoveryGenre(rawGenre) ?? rawGenre : null, color: params.get("color") || null, mood: params.get("mood") || null };
  const order: DiscoveryOrder = params.get("order") === "diverse" ? "diverse" : params.get("order") === "title" ? "title" : "recommended";
  const compact = params.get("density") === "compact";
  const crateOnly = params.get("crate") === "1";
  const expandGenre = params.get("connections") === "1";
  const similarSlug = params.get("similar");
  const mode: ArtworkSimilarityMode = params.get("mode") === "palette" ? "palette" : params.get("mode") === "mood" ? "mood" : "visual";
  const seed = items.find((item) => item.slug === similarSlug);
  const orderOptions = [
    { value: "recommended" as const, label: query.trim() ? "Search relevance" : seed ? "Closest connections" : view.genre ? "Genre fit" : "Curated" },
    { value: "diverse" as const, label: "Visual variety" },
    { value: "title" as const, label: "Title A–Z" },
  ];
  const orderIndex = orderOptions.findIndex((option) => option.value === order);
  const activeOrder = orderOptions[orderIndex] ?? orderOptions[0];
  const [saved, setSaved] = useState<string[]>(() => {
    try { return readSavedSlugs(localStorage.getItem(CRATE_STORAGE_KEY), items); } catch { return []; }
  });
  const [saveNotice, setSaveNotice] = useState("");
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const update = (changes: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    navigate(`${location}${next.size ? `?${next}` : ""}`, { replace: !push });
  };
  const cycleOrder = (direction: -1 | 1) => {
    const nextIndex = (orderIndex + direction + orderOptions.length) % orderOptions.length;
    const nextOrder = orderOptions[nextIndex].value;
    trackEvent("archive_order_changed", {
      order: nextOrder,
      direction: direction === 1 ? "next" : "previous",
    });
    update({ order: nextOrder === "recommended" ? null : nextOrder });
  };
  const clearAll = () => {
    update({ query: null, genre: null, color: null, mood: null, similar: null, mode: null, connections: null, crate: null, order: null });
    searchInput.current?.focus();
  };
  const follow = (artwork: Artwork) => {
    trackEvent("visual_direction_followed", {
      artwork_slug: artwork.slug,
      source: "archive_card",
    });
    update({ similar: artwork.slug, mode: null, query: null, genre: null, mood: null, color: null, order: null, crate: null, connections: null }, true);
  };
  const toggleSaved = (artwork: Artwork) => {
    const wasSaved = savedSet.has(artwork.slug);
    const next = wasSaved ? saved.filter((slug) => slug !== artwork.slug) : [...saved, artwork.slug];
    setSaved(next);
    if (crateOnly && wasSaved) resultsHeading.current?.focus();
    try {
      localStorage.setItem(CRATE_STORAGE_KEY, JSON.stringify(next));
      setSaveNotice(`${artwork.title} ${next.includes(artwork.slug) ? "saved to" : "removed from"} your crate on this browser.`);
      trackEvent("crate_updated", {
        action: wasSaved ? "removed" : "saved",
        artwork_slug: artwork.slug,
        crate_size: next.length,
      });
    } catch { setSaveNotice("Your crate is available for this visit. This browser could not save it for later."); }
  };
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === CRATE_STORAGE_KEY || event.key === null) setSaved(readSavedSlugs(event.newValue, items));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [items]);

  useEffect(() => {
    const previous = previousSeedSlug.current;
    previousSeedSlug.current = seed?.slug;
    if (seed) {
      seedHeading.current?.focus({ preventScroll: true });
      seedContext.current?.scrollIntoView({ block: "start", behavior: "instant" });
    } else if (previous && document.activeElement !== searchInput.current) {
      resultsHeading.current?.focus();
    }
  }, [seed?.slug]);

  const facetIndex = useMemo(() => buildCatalogFacetIndex(items), [items]);
  const genreMatches = useMemo(() => view.genre ? rankGenreArtwork(view.genre, items) : [], [items, view.genre]);
  const similarMatches = useMemo(() => seed ? rankSimilarArtwork(seed, items, mode) : [], [seed, items, mode]);
  const evidence = useMemo(() => new Map((seed ? similarMatches : genreMatches).map((match) => [match.artwork.slug, match.reasons])), [seed, similarMatches, genreMatches]);
  const filteredItems = useMemo(() => {
    let candidates = seed ? similarMatches.map((match) => match.artwork) : similarSlug ? [] : items;
    if (view.genre) {
      const matching = new Set(genreMatches.filter((match) => expandGenre || match.basis === "metadata").map((match) => match.artwork.slug));
      candidates = candidates.filter((item) => matching.has(item.slug));
      if (!seed && !query.trim()) {
        const ranks = new Map(genreMatches.map((match, i) => [match.artwork.slug, i]));
        candidates = [...candidates].sort((a, b) => ranks.get(a.slug)! - ranks.get(b.slug)!);
      }
    }
    if (query.trim()) candidates = hybridSearch(query, candidates);
    candidates = applyCatalogView(candidates, { genre: null, color: view.color, mood: view.mood }, undefined, facetIndex);
    if (crateOnly) candidates = candidates.filter((item) => savedSet.has(item.slug));
    return orderDiscoveryArtwork(candidates, order);
  }, [items, seed, similarSlug, similarMatches, genreMatches, expandGenre, query, view.genre, view.color, view.mood, facetIndex, crateOnly, savedSet, order]);
  const hasActiveSearch = Boolean(query.trim() || view.genre || view.color || view.mood || similarSlug || crateOnly);
  const typedGenre = normalizeDiscoveryGenre(query);

  useEffect(() => {
    if (!hasActiveSearch) return;
    const timer = window.setTimeout(() => trackEvent("archive_filtered", { query_length: query.trim().length, genre: view.genre ?? "all", color: view.color ?? "all", result_count: filteredItems.length }), 500);
    return () => window.clearTimeout(timer);
  }, [filteredItems.length, hasActiveSearch, query, view.color, view.genre]);

  return <>
    <div className="discovery-workbench">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor="archive-search" className="discovery-label">Find your visual direction</label>
         <button type="button" className="discovery-pill" aria-pressed={crateOnly} onClick={() => {
           trackEvent("crate_view_toggled", { visible: !crateOnly });
           update({ crate: crateOnly ? null : "1" });
         }}>
          <Bookmark size={15} aria-hidden="true" /> My crate <span>{saved.length}</span>
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-full border border-current/25 px-5 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-current">
        <Search size={19} className="shrink-0" aria-hidden="true" />
        <input ref={searchInput} id="archive-search" type="search" value={query} onChange={(event) => update({ query: event.target.value || null })} placeholder="A genre, a feeling, a color, a world..." className="min-w-0 w-full bg-transparent text-base placeholder:text-current/55 focus:outline-none" />
        {query && <button type="button" aria-label="Clear archive search" className="min-h-8 px-1 text-xs" onClick={() => { update({ query: null }); searchInput.current?.focus(); }}>Clear</button>}
      </div>
      {typedGenre && !view.genre && <button type="button" className="mt-3 min-h-10 text-sm underline underline-offset-4" onClick={() => update({ genre: typedGenre, query: null })}>Explore {displayGenreLabel(typedGenre)} through artwork metadata and visual connections</button>}
      <DiscoveryControls view={view} onChange={(next) => update({ genre: next.genre, mood: next.mood, color: next.color })} index={facetIndex} resultCount={filteredItems.length} totalCount={items.length} />
       {view.genre && <div className="discovery-genre-context">
        <div><h3 className="text-lg font-bold">The {displayGenreLabel(view.genre)} direction</h3><p className="mt-1 max-w-[70ch] text-sm leading-6 text-current/70">Style and mood metadata suggest a visual fit. Image-vector connections reveal adjacent directions. These are cover-art suggestions, not audio classification.</p></div>
         <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={expandGenre} onChange={(event) => {
           trackEvent("visual_connections_toggled", { enabled: event.target.checked });
           update({ connections: event.target.checked ? "1" : null });
         }} className="h-4 w-4 accent-current" /> Include visual connections</label>
      </div>}
       {seed && <section ref={seedContext} aria-label="Visual starting point" className="discovery-seed scroll-mt-24">
        <Image src={seed.image} alt={seed.alt} width={88} height={88} className="h-20 w-20 shrink-0 object-cover" />
         <div className="min-w-0 flex-1"><p className="discovery-label">Following a visual direction</p><h3 ref={seedHeading} tabIndex={-1} className="mt-1 text-lg font-bold">{seed.title}</h3><div className="mt-3 flex flex-wrap gap-2">{Object.entries(SIMILAR_MODES).map(([value, label]) => <button type="button" key={value} className="discovery-pill" aria-pressed={mode === value} onClick={() => {
           trackEvent("visual_similarity_mode_changed", { mode: value });
           update({ mode: value === "visual" ? null : value });
         }}>{label}</button>)}</div><p className="mt-2 text-xs leading-5 text-current/70">{mode === "visual" ? "Nearest connections in the offline image-descriptor index. No unrelated filler." : "Only works with shared catalog traits are shown."}</p></div>
        <button type="button" aria-label="Leave visual direction" className="self-start rounded-full p-2" onClick={() => update({ similar: null, mode: null }, true)}><X size={19} /></button>
      </section>}
      {similarSlug && !seed && <p role="status" className="mt-4 text-sm">That starting artwork is not in the public archive. Clear the direction to explore available works.</p>}
      {crateOnly && <p className="mt-4 text-sm text-current/70">Your shortlist on this browser—not a reservation or a purchase. Other active filters still apply.</p>}
      <div className="discovery-results-bar">
        <h2 ref={resultsHeading} tabIndex={-1} className="scroll-mt-24 text-lg font-bold">{filteredItems.length} {filteredItems.length === 1 ? "work" : "works"}{seed ? " to follow" : view.genre ? ` for ${displayGenreLabel(view.genre)}` : " to explore"}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {hasActiveSearch && <button type="button" onClick={clearAll} className="min-h-11 text-xs underline underline-offset-4">Clear all</button>}
          <div role="group" aria-label="Artwork order" className="discovery-order-slider">
            <button type="button" className="discovery-order-arrow" aria-label="Previous artwork order" onClick={() => cycleOrder(-1)}>
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button type="button" className="discovery-order-current" aria-label="Current artwork order" onClick={() => cycleOrder(1)} aria-live="polite">
              {activeOrder.label}
            </button>
            <button type="button" className="discovery-order-arrow" aria-label="Next artwork order" onClick={() => cycleOrder(1)}>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
          <div role="group" aria-label="Artwork density" className="flex gap-1">{[false, true].map((value) => <button key={String(value)} type="button" className="discovery-pill" aria-pressed={compact === value} onClick={() => update({ density: value ? "compact" : null })}>{value ? "Compact" : "Gallery"}</button>)}</div>
        </div>
      </div>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{saveNotice}</p>
    {items.length === 0 ? <section className="border-y border-current/20 py-10" aria-label="Archive is empty"><p className="text-xl font-bold">The first approved collection is being prepared.</p><Link href="/" className="mt-5 inline-flex min-h-11 items-center text-sm underline">Return home</Link></section>
      : filteredItems.length === 0 ? <section className="py-16 text-center" aria-label="No matching artwork"><p className="text-2xl font-bold">{crateOnly && !saved.length ? "Your next cover starts with a good shortlist." : "No works match those filters."}</p><p className="mx-auto mt-3 max-w-[52ch] text-sm leading-6 text-current/70">{crateOnly && !saved.length ? "Save a cover to your crate as you explore. Your choices stay on this browser." : "Try another music lane, loosen a color or mood, or return to the full archive."}</p><button type="button" onClick={clearAll} className="artcovr-button mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-6 py-3 text-sm"><ArrowLeft size={16} aria-hidden="true" /> Clear filters</button></section>
      : <ArtworkGrid items={filteredItems} compact={compact} savedSlugs={savedSet} onSave={toggleSaved} onSimilar={follow} reasons={evidence} />}
  </>;
}
