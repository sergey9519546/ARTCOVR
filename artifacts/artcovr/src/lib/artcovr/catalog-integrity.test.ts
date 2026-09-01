import assert from "node:assert/strict";
import { describe, test } from "node:test";

import approvedCatalog from "../../../../../.migration-backup/catalog/approved-artworks.json" with { type: "json" };
import pricingOverrides from "../../../../../.migration-backup/catalog/pricing-overrides.json" with { type: "json" };
import curatedPublic from "./curated-public.json" with { type: "json" };
import curatedReview from "./curated-review.json" with { type: "json" };
import {
  parsePricingOverrides,
  projectApprovedCatalog,
} from "./catalog-projection.ts";
import {
  validateCatalogIntegrity,
  type CatalogIntegrityInput,
} from "./catalog-review.ts";

const source = approvedCatalog as unknown[];
const review = curatedReview as unknown[];
const publicRows = curatedPublic as unknown[];

const validCatalog: CatalogIntegrityInput = {
  source,
  review,
  public: publicRows,
};

describe("catalog integrity", () => {
  test("review and public artifacts preserve source identity and publication gates", () => {
    assert.deepEqual(validateCatalogIntegrity(validCatalog), []);
  });

  test("the checked-in public artifact is the deterministic approved projection", () => {
    assert.deepEqual(
      projectApprovedCatalog(source, parsePricingOverrides(pricingOverrides)),
      publicRows,
    );
  });

  test("reports orphaned public rows before storefront checks run", () => {
    const mutatedPublic = [...publicRows];
    mutatedPublic[0] = {
      ...(mutatedPublic[0] as Record<string, unknown>),
      id: "art_ffffffffffffffffffff",
    };

    const issues = validateCatalogIntegrity({
      ...validCatalog,
      public: mutatedPublic,
    });

    assert.ok(
      issues.some(
        (entry) =>
          entry.code === "ORPHAN_PUBLIC_PROJECTION" &&
          entry.id === "art_ffffffffffffffffffff",
      ),
    );
    assert.ok(
      issues.some(
        (entry) =>
          entry.code === "PUBLIC_ROW_MISSING" &&
          entry.id === (publicRows[0] as Record<string, unknown>).id,
      ),
    );
  });

  test("reports mismatched public identity, image, and publication gates", () => {
    const original = publicRows[0] as Record<string, unknown>;
    const cases: Array<{
      name: string;
      change: Record<string, unknown>;
      code:
        | "PUBLIC_SLUG_MISMATCH"
        | "PUBLIC_IMAGE_MISMATCH"
        | "PUBLIC_PUBLICATION_GATE";
    }> = [
      {
        name: "slug",
        change: { slug: `${String(original.slug)}-stale` },
        code: "PUBLIC_SLUG_MISMATCH",
      },
      {
        name: "image",
        change: { image: "/assets/artworks/stale-image.jpg" },
        code: "PUBLIC_IMAGE_MISMATCH",
      },
      {
        name: "publication gate",
        change: { published: false },
        code: "PUBLIC_PUBLICATION_GATE",
      },
    ];

    for (const { name, change, code } of cases) {
      const mutatedPublic = [...publicRows];
      mutatedPublic[0] = { ...original, ...change };
      assert.ok(
        validateCatalogIntegrity({
          ...validCatalog,
          public: mutatedPublic,
        }).some((entry) => entry.code === code && entry.index === 0),
        `expected ${name} drift to be reported`,
      );
    }
  });

  test("reports review identity, image, and private publication-gate drift", () => {
    const original = review[0] as Record<string, unknown>;
    const cases: Array<{
      change: Record<string, unknown>;
      code:
        | "REVIEW_SLUG_MISMATCH"
        | "REVIEW_IMAGE_MISMATCH"
        | "REVIEW_PUBLICATION_GATE";
    }> = [
      {
        change: { slug: `${String(original.slug)}-stale` },
        code: "REVIEW_SLUG_MISMATCH",
      },
      {
        change: { image: "/assets/artworks/stale-image.jpg" },
        code: "REVIEW_IMAGE_MISMATCH",
      },
      {
        change: { published: true },
        code: "REVIEW_PUBLICATION_GATE",
      },
    ];

    for (const { change, code } of cases) {
      const mutatedReview = [...review];
      mutatedReview[0] = { ...original, ...change };
      assert.ok(
        validateCatalogIntegrity({
          ...validCatalog,
          review: mutatedReview,
        }).some((entry) => entry.code === code && entry.index === 0),
        `expected ${code} drift to be reported`,
      );
    }
  });
});
