import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeImageHeader } from "../../src/lib/artcovr/catalog-source.ts";

const EXPECTED_PRICES: Record<string, number> = {
  "signal-garden": 7500,
  "floating-gambit": 10000,
  "last-light-market": 7500,
  "stem-in-the-quiet": 10000,
  "cloud-aperture": 7500,
  "signal-over-the-shore": 2000,
  "procession-in-fog": 2000,
  "eyes-in-the-wiring": 7500,
  "red-silo": 5000,
  "violet-archivist": 7500,
  "three-registers-of-silence": 7500,
  "night-shift-draftsman": 7500,
  "dream-receiver": 7500,
  "door-in-the-red-orchard": 7500,
  "afternoon-across-the-water": 5000,
  "rooms-above-weather": 5000,
  "rain-keeps-the-house": 5000,
  "memory-in-blue-plaster": 10000,
  "yellow-field-interruption": 2000,
  "chair-at-the-color-boundary": 5000,
  "dinner-after-the-alarm": 5000,
  "face-between-frequencies": 5000,
  "red-measure": 3500,
  "black-mineral-weather": 10000,
  "green-bell-towers": 5000,
  "no-exit-agrees": 2000,
  "city-of-copper-facades": 5000,
  "midnight-inventory": 3500,
  "pastel-threshold": 3500,
  "last-transaction": 3500,
  "machine-with-a-red-thought": 3500,
  "cloudwell-stair": 10000,
  "night-collected-in-a-bag": 2000,
  "offering-at-the-narrow-door": 3500,
  "keeper-of-the-white-lantern": 3500,
  "pilgrim-of-the-inner-light": 10000,
  "flowers-at-the-cash-machine": 2000,
  "letter-carriers-blue-hour": 3500,
};

test("the 2026-08-20 owner-delegated expansion is exact, archive-only, and protected", async () => {
  const approved = JSON.parse(
    await readFile(new URL("../../catalog/approved-artworks.json", import.meta.url), "utf8"),
  ) as Array<{
    position: number;
    slug: string;
    sha256: string;
    displayPath: string;
    priceCents: number;
    saleMode: string;
    tier: string;
    rightsApproved: boolean;
    published: boolean;
  }>;
  const expansion = approved.filter(({ position }) => position >= 180 && position <= 217);
  assert.equal(expansion.length, 38);
  assert.deepEqual(
    Object.fromEntries(expansion.map(({ slug, priceCents }) => [slug, priceCents])),
    EXPECTED_PRICES,
  );
  assert.ok(
    expansion.every(
      ({ saleMode, tier, rightsApproved, published }) =>
        saleMode === "repeatable" && tier === "archive" && rightsApproved && published,
    ),
  );

  for (const row of expansion) {
    const bytes = await readFile(new URL(`../../public${row.displayPath}`, import.meta.url));
    const header = decodeImageHeader(bytes);
    assert.deepEqual(
      { format: header.format, width: header.width, height: header.height },
      { format: "jpeg", width: 1024, height: 1024 },
      row.slug,
    );
    assert.notEqual(
      createHash("sha256").update(bytes).digest("hex"),
      row.sha256,
      `${row.slug}: public preview must not pass through the clean source bytes`,
    );
  }
});

test("the expansion grows the archive without changing the homepage lead sequence", async () => {
  const publicCatalog = JSON.parse(
    await readFile(new URL("../../src/lib/artcovr/curated-public.json", import.meta.url), "utf8"),
  ) as Array<{ slug: string; tier: string }>;
  assert.equal(publicCatalog.length, 187);
  assert.deepEqual(
    publicCatalog.filter(({ tier }) => tier === "featured").slice(0, 3).map(({ slug }) => slug),
    ["last-sock-on-the-line", "filing-cathedral", "grief-in-transit"],
  );
  assert.ok(Object.keys(EXPECTED_PRICES).every((slug) => publicCatalog.some((row) => row.slug === slug && row.tier === "archive")));
});
