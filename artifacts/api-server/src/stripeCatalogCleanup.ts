import type Stripe from "stripe";
import { artcovrOrders, db } from "@workspace/db";
import { getPublicCatalog, type PublicCatalogArtwork } from "./catalog";
import {
  deactivateStripePrice,
  deactivateStripeProduct,
  listStripeCheckoutSessions,
  listStripePaymentLinks,
  listStripePrices,
  listStripeProducts,
  updateStripeProduct,
} from "./stripeClient";
import {
  matchingStripePriceCandidates,
  productsForArtwork,
  selectStripePriceCandidate,
  type StripePriceCandidate,
} from "./stripeCatalog";

export const STRIPE_CATALOG_DEACTIVATION_CONFIRMATION =
  "DEACTIVATE_DUPLICATE_STRIPE_CATALOG";

export type StripeAccountMode = "live" | "test" | "mixed" | "unknown";

export type CheckoutSessionProtectionStatus =
  | "active"
  | "expired"
  | "completed";

export type CheckoutSessionDiagnosis =
  | "found"
  | "stale_test_data"
  | "missing_from_connected_account"
  | "missing_session_id";

export type StripeReconciliationAlert = {
  orderId: string;
  stripeCheckoutSessionId: string;
  diagnosis: Exclude<CheckoutSessionDiagnosis, "found" | "missing_session_id">;
  severity: "warning" | "error";
};

export type HistoricalOrderReference = {
  id: string;
  artworkId: string;
  status: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
};

export type CatalogReference = {
  kind: "checkout_session" | "payment_link" | "default_price";
  objectId: string;
  priceId: string;
  productId: string;
  active: boolean;
  historical: boolean;
  checkoutSessionProtectionStatus?: CheckoutSessionProtectionStatus;
};

export type DefaultPriceAction = {
  productId: string;
  priceId: string;
  action: "retain" | "clear" | "protect";
  replacementPriceId: string | null;
  reasons: string[];
};

export type StripeCanonicalArtworkSelection = {
  artworkId: string;
  slug: string;
  canonicalProductId: string | null;
  canonicalPriceId: string | null;
};

export type StripeCanonicalSelectionComparison = {
  before: StripeCanonicalArtworkSelection[];
  after: StripeCanonicalArtworkSelection[];
  changes: Array<{
    artworkId: string;
    slug: string;
    before: StripeCanonicalArtworkSelection;
    after: StripeCanonicalArtworkSelection;
  }>;
  safetyStop?: string;
};

export type StripeCatalogCleanupReport = {
  mode: "dry_run" | "deactivated" | "interrupted";
  generatedAt: string;
  catalogArtworkCount: number;
  canonicalArtworkCount: number;
  duplicateProductArtworkIds: number;
  duplicatePriceArtworkIds: number;
  referenceCounts: {
    historicalOrders: number;
    checkoutSessions: number;
    checkoutSessionProtection: Record<
      CheckoutSessionProtectionStatus,
      number
    >;
    paymentLinks: number;
    defaultPriceReferences: number;
    duplicateDefaultPriceReferences: number;
  };
  reconciliation: {
    connectedAccountMode: StripeAccountMode;
    alerts: StripeReconciliationAlert[];
    unmatchedCheckoutSessionOrderIds: string[];
    staleTestDataOrderIds: string[];
    unresolvedOrderIds: string[];
  };
  historicalOrders: Array<
    HistoricalOrderReference & {
      checkoutSessionFound: boolean;
      checkoutSessionDiagnosis: CheckoutSessionDiagnosis;
    }
  >;
  canonicalSelection: StripeCanonicalSelectionComparison;
  safetyStop?: string;
  readiness: {
    expectedArtworkCount: number;
    readyArtworkCount: number;
    missingArtworkIds: string[];
    protectedDuplicateDefaultPriceReferences: number;
  };
  progress: StripeCatalogCleanupProgress;
  artworks: Array<{
    artworkId: string;
    slug: string;
    canonicalProductId: string | null;
    canonicalPriceId: string | null;
    duplicateProductIds: string[];
    redundantPriceIds: string[];
    deactivatablePriceIds: string[];
    deactivatableProductIds: string[];
    blockedPrices: Array<{ id: string; reasons: string[] }>;
    blockedProducts: Array<{ id: string; reasons: string[] }>;
    defaultPriceActions: DefaultPriceAction[];
  }>;
  deactivated?: {
    prices: string[];
    products: string[];
    defaultPrices?: Array<{ productId: string; priceId: string }>;
  };
};

export type StripeCatalogCleanupMutationCategory =
  "default_price" | "price" | "product";

export type StripeCatalogCleanupProgress = {
  status: "not_started" | "in_progress" | "completed" | "interrupted";
  totalMutations: number;
  completedMutations: number;
  lastCompletedMutation: {
    category: StripeCatalogCleanupMutationCategory;
    objectId: string;
  } | null;
  interruptionReason?: string;
};

type CheckoutReference = Omit<CatalogReference, "kind"> & {
  kind: "checkout_session";
};

type PaymentLinkReference = Omit<CatalogReference, "kind"> & {
  kind: "payment_link";
};

export type StripeCatalogSnapshot = {
  products: Stripe.Product[];
  pricesByProduct: Map<string, Stripe.Price[]>;
  checkoutSessionIds: string[];
  checkoutSessionProtection?: Map<string, CheckoutSessionProtectionStatus>;
  stripeAccountMode: StripeAccountMode;
  checkoutReferences: CheckoutReference[];
  paymentLinkReferences: PaymentLinkReference[];
  defaultPriceReferences: CatalogReference[];
  historicalOrders: HistoricalOrderReference[];
};

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function stripeAccountMode(
  products: Stripe.Product[],
  checkoutSessions: Stripe.Checkout.Session[],
): StripeAccountMode {
  const modes = new Set(
    [...products, ...checkoutSessions].map((object) =>
      object.livemode ? "live" : "test",
    ),
  );
  if (modes.size !== 1) return modes.size === 0 ? "unknown" : "mixed";
  return [...modes][0] as "live" | "test";
}

function diagnoseCheckoutSession(
  order: HistoricalOrderReference,
  checkoutSessionIds: string[],
  connectedAccountMode: StripeAccountMode,
): CheckoutSessionDiagnosis {
  const sessionId = order.stripeCheckoutSessionId;
  if (!sessionId) return "missing_session_id";
  if (checkoutSessionIds.includes(sessionId)) return "found";

  // Stripe IDs preserve the mode in which they were created. A test-mode
  // session cannot be retrieved from the live account connected to this app.
  if (connectedAccountMode === "live" && sessionId.startsWith("cs_test_")) {
    return "stale_test_data";
  }
  return "missing_from_connected_account";
}

function checkoutSessionProtectionStatus(
  status: string | null | undefined,
): CheckoutSessionProtectionStatus {
  if (status === "complete") return "completed";
  if (status === "expired") return "expired";
  return "active";
}

function lineItemReferences(
  object: {
    id: string;
    active?: boolean;
    status?: string | null;
    line_items?: Stripe.ApiList<Stripe.LineItem> | null;
  },
  kind: CheckoutReference["kind"] | PaymentLinkReference["kind"],
): Array<CheckoutReference | PaymentLinkReference> {
  const checkoutProtection =
    kind === "checkout_session"
      ? checkoutSessionProtectionStatus(object.status)
      : undefined;
  const historical =
    checkoutProtection !== undefined
      ? checkoutProtection !== "active"
      : object.active === false;
  return (object.line_items?.data ?? []).flatMap((lineItem) => {
    const price = lineItem.price;
    if (!price || typeof price === "string") return [];
    const priceId = price.id;
    const productId = stripeId(price.product);
    if (!productId) return [];
    return [
      {
        kind,
        objectId: object.id,
        priceId,
        productId,
        active:
          checkoutProtection !== undefined
            ? checkoutProtection === "active"
            : (object.active ?? true),
        historical,
        ...(checkoutProtection
          ? { checkoutSessionProtectionStatus: checkoutProtection }
          : {}),
      },
    ];
  });
}

async function loadHistoricalOrders(): Promise<HistoricalOrderReference[]> {
  const orders = await db
    .select({
      id: artcovrOrders.id,
      artworkId: artcovrOrders.artworkId,
      status: artcovrOrders.status,
      stripeCheckoutSessionId: artcovrOrders.stripeCheckoutSessionId,
      stripePaymentIntentId: artcovrOrders.stripePaymentIntentId,
    })
    .from(artcovrOrders);
  return orders;
}

async function loadCatalogSnapshot(): Promise<StripeCatalogSnapshot> {
  const [products, checkoutSessions, paymentLinks, historicalOrders] =
    await Promise.all([
      listStripeProducts({ active: undefined }),
      listStripeCheckoutSessions(),
      listStripePaymentLinks(),
      loadHistoricalOrders(),
    ]);

  const pricesByProduct = new Map<string, Stripe.Price[]>();
  for (const product of products) {
    pricesByProduct.set(
      product.id,
      await listStripePrices(product.id, { active: undefined }),
    );
  }
  const defaultPriceReferences: CatalogReference[] = [];
  for (const product of products) {
    const defaultPriceId = stripeId(product.default_price);
    if (!defaultPriceId) continue;
    defaultPriceReferences.push({
      kind: "default_price",
      objectId: product.id,
      priceId: defaultPriceId,
      productId: product.id,
      active: product.active,
      historical: !product.active,
    });
  }

  return {
    products,
    pricesByProduct,
    checkoutSessionIds: checkoutSessions.map((session) => session.id),
    checkoutSessionProtection: new Map(
      checkoutSessions.map((session) => [
        session.id,
        checkoutSessionProtectionStatus(session.status),
      ]),
    ),
    stripeAccountMode: stripeAccountMode(products, checkoutSessions),
    checkoutReferences: checkoutSessions.flatMap((session) =>
      lineItemReferences(session, "checkout_session"),
    ) as CheckoutReference[],
    paymentLinkReferences: paymentLinks.flatMap((link) =>
      lineItemReferences(link, "payment_link"),
    ) as PaymentLinkReference[],
    defaultPriceReferences,
    historicalOrders,
  };
}

function referencesFor(id: string, references: CatalogReference[]) {
  return references.filter(
    (reference) =>
      (reference.priceId === id || reference.productId === id) &&
      reference.active &&
      !reference.historical,
  );
}

function allCandidates(
  artwork: PublicCatalogArtwork,
  products: Stripe.Product[],
  pricesByProduct: Map<string, Stripe.Price[]>,
) {
  const artworkProducts = productsForArtwork(
    products.filter((product) => product.active),
    artwork.id,
  );
  const candidates: StripePriceCandidate[] = artworkProducts.flatMap(
    (product) =>
      (pricesByProduct.get(product.id) ?? [])
        .filter((price) => price.active)
        .map((price) => ({ product, price })),
  );
  return {
    artworkProducts,
    candidates,
    matchingCandidates: matchingStripePriceCandidates(artwork, candidates),
  };
}

function canonicalSelections(
  artworks: StripeCatalogCleanupReport["artworks"],
): StripeCanonicalArtworkSelection[] {
  return artworks.map(
    ({
      artworkId,
      slug,
      canonicalProductId,
      canonicalPriceId,
    }) => ({
      artworkId,
      slug,
      canonicalProductId,
      canonicalPriceId,
    }),
  );
}

export function compareStripeCanonicalSelections(
  before: StripeCanonicalArtworkSelection[],
  after: StripeCanonicalArtworkSelection[],
): StripeCanonicalSelectionComparison {
  const beforeByArtwork = new Map(
    before.map((selection) => [selection.artworkId, selection]),
  );
  const afterByArtwork = new Map(
    after.map((selection) => [selection.artworkId, selection]),
  );
  const artworkIds = [
    ...new Set([
      ...before.map((selection) => selection.artworkId),
      ...after.map((selection) => selection.artworkId),
    ]),
  ];
  const changes = artworkIds.flatMap((artworkId) => {
    const previous = beforeByArtwork.get(artworkId);
    const current = afterByArtwork.get(artworkId);
    if (!previous || !current) {
      return [
        {
          artworkId,
          slug: current?.slug ?? previous?.slug ?? artworkId,
          before: previous ?? {
            artworkId,
            slug: current?.slug ?? artworkId,
            canonicalProductId: null,
            canonicalPriceId: null,
          },
          after: current ?? {
            artworkId,
            slug: previous?.slug ?? artworkId,
            canonicalProductId: null,
            canonicalPriceId: null,
          },
        },
      ];
    }
    if (
      previous.canonicalProductId === current.canonicalProductId &&
      previous.canonicalPriceId === current.canonicalPriceId
    ) {
      return [];
    }
    return [
      {
        artworkId,
        slug: current.slug,
        before: previous,
        after: current,
      },
    ];
  });
  return { before, after, changes };
}

function canonicalMutationConflicts(
  artworks: StripeCatalogCleanupReport["artworks"],
) {
  return artworks.flatMap((artwork) => {
    const conflicts = new Set<string>();
    if (
      artwork.canonicalPriceId &&
      artwork.deactivatablePriceIds.includes(artwork.canonicalPriceId)
    ) {
      conflicts.add(`price/${artwork.canonicalPriceId}`);
    }
    if (
      artwork.canonicalProductId &&
      artwork.deactivatableProductIds.includes(artwork.canonicalProductId)
    ) {
      conflicts.add(`product/${artwork.canonicalProductId}`);
    }
    if (
      artwork.canonicalProductId &&
      artwork.defaultPriceActions.some(
        (action) =>
          action.action === "clear" &&
          action.productId === artwork.canonicalProductId,
      )
    ) {
      conflicts.add(`default_price/${artwork.canonicalProductId}`);
    }
    return [...conflicts].map((objectId) => ({
      artworkId: artwork.artworkId,
      objectId,
    }));
  });
}

export function buildStripeCatalogCleanupReport(
  snapshot: StripeCatalogSnapshot,
  catalog: PublicCatalogArtwork[],
  mode: "dry_run" | "deactivated",
  deactivated?: { prices: string[]; products: string[] },
): StripeCatalogCleanupReport {
  const liveReferences = [
    ...snapshot.checkoutReferences,
    ...snapshot.paymentLinkReferences,
    ...snapshot.defaultPriceReferences,
  ];
  const checkoutSessionCount = snapshot.checkoutSessionIds.length;
  const checkoutSessionProtection: Record<
    CheckoutSessionProtectionStatus,
    number
  > = {
    active: 0,
    expired: 0,
    completed: 0,
  };
  const inferredCheckoutProtection = new Map<
    string,
    CheckoutSessionProtectionStatus
  >();
  for (const reference of snapshot.checkoutReferences) {
    if (inferredCheckoutProtection.has(reference.objectId)) continue;
    inferredCheckoutProtection.set(
      reference.objectId,
      reference.checkoutSessionProtectionStatus ??
        (reference.active
          ? "active"
          : reference.historical
            ? "completed"
            : "active"),
    );
  }
  for (const sessionId of snapshot.checkoutSessionIds) {
    const status =
      snapshot.checkoutSessionProtection?.get(sessionId) ??
      inferredCheckoutProtection.get(sessionId) ??
      // A snapshot without a session status must remain conservative: an
      // unclassified session can still be open and protect its price.
      "active";
    checkoutSessionProtection[status]++;
  }
  const paymentLinkCount = new Set(
    snapshot.paymentLinkReferences.map((reference) => reference.objectId),
  ).size;
  const defaultPriceCount = snapshot.defaultPriceReferences.length;
  const historicalOrders = snapshot.historicalOrders.map((order) => {
    const checkoutSessionDiagnosis = diagnoseCheckoutSession(
      order,
      snapshot.checkoutSessionIds,
      snapshot.stripeAccountMode,
    );
    return {
      ...order,
      checkoutSessionFound: checkoutSessionDiagnosis === "found",
      checkoutSessionDiagnosis,
    };
  });
  const unmatchedCheckoutSessionOrders = historicalOrders.filter(
    (order) =>
      order.stripeCheckoutSessionId !== null && !order.checkoutSessionFound,
  );
  const staleTestDataOrders = unmatchedCheckoutSessionOrders.filter(
    (order) => order.checkoutSessionDiagnosis === "stale_test_data",
  );
  const unresolvedOrders = unmatchedCheckoutSessionOrders.filter(
    (order) =>
      order.checkoutSessionDiagnosis === "missing_from_connected_account",
  );
  const reconciliationAlerts: StripeReconciliationAlert[] =
    unmatchedCheckoutSessionOrders.flatMap((order) => {
      const checkoutSessionId = order.stripeCheckoutSessionId;
      if (
        !checkoutSessionId ||
        (order.checkoutSessionDiagnosis !== "stale_test_data" &&
          order.checkoutSessionDiagnosis !== "missing_from_connected_account")
      ) {
        return [];
      }
      return [
        {
          orderId: order.id,
          stripeCheckoutSessionId: checkoutSessionId,
          diagnosis: order.checkoutSessionDiagnosis,
          severity:
            order.checkoutSessionDiagnosis === "stale_test_data"
              ? "warning"
              : "error",
        },
      ];
    });
  let canonicalArtworkCount = 0;
  let duplicateProductArtworkIds = 0;
  let duplicatePriceArtworkIds = 0;
  const missingArtworkIds: string[] = [];
  let duplicateDefaultPriceReferences = 0;
  let protectedDuplicateDefaultPriceReferences = 0;

  const artworks = catalog.map((artwork) => {
    const { artworkProducts, candidates, matchingCandidates } = allCandidates(
      artwork,
      snapshot.products,
      snapshot.pricesByProduct,
    );
    const selected = selectStripePriceCandidate(artwork, candidates);
    if (selected) canonicalArtworkCount++;
    else missingArtworkIds.push(artwork.id);
    if (artworkProducts.length > 1) duplicateProductArtworkIds++;
    if (matchingCandidates.length > 1) duplicatePriceArtworkIds++;

    const canonicalProductId = selected?.product.id ?? null;
    const canonicalPriceId = selected?.price.id ?? null;
    const duplicateProductIds = artworkProducts
      .filter((product) => product.id !== canonicalProductId)
      .map((product) => product.id);
    const redundantPriceIds = matchingCandidates
      .filter(({ price }) => price.id !== canonicalPriceId)
      .map(({ price }) => price.id);

    const defaultPriceActions = redundantPriceIds.reduce<DefaultPriceAction[]>(
      (actions, id) => {
        const defaultReference = snapshot.defaultPriceReferences.find(
          (reference) => reference.priceId === id,
        );
        if (!defaultReference) return actions;

        duplicateDefaultPriceReferences++;
        const reasons = new Set<string>();
        for (const reference of referencesFor(id, liveReferences)) {
          if (reference.kind === "default_price") continue;
          if (reference.kind === "checkout_session") {
            reasons.add("open_checkout_session");
          } else if (reference.kind === "payment_link") {
            reasons.add("active_payment_link");
          }
        }

        if (reasons.size === 0) {
          actions.push({
            productId: defaultReference.productId,
            priceId: id,
            action: "clear",
            replacementPriceId: null,
            reasons: ["redundant_default_price"],
          });
          return actions;
        }

        protectedDuplicateDefaultPriceReferences++;
        reasons.add("default_price_reference");
        actions.push({
          productId: defaultReference.productId,
          priceId: id,
          action: "protect",
          replacementPriceId: null,
          reasons: [...reasons].sort(),
        });
        return actions;
      },
      [],
    );
    const clearableDefaultPriceIds = new Set(
      defaultPriceActions
        .filter((action) => action.action === "clear")
        .map((action) => action.priceId),
    );

    const blockedPrices = redundantPriceIds.flatMap((id) => {
      const reasons = new Set<string>();
      for (const reference of referencesFor(id, liveReferences)) {
        if (
          reference.kind === "default_price" &&
          clearableDefaultPriceIds.has(reference.priceId)
        ) {
          continue;
        }
        if (reference.productId === id) reasons.add("product_reference");
        else if (reference.kind === "checkout_session")
          reasons.add("open_checkout_session");
        else if (reference.kind === "payment_link")
          reasons.add("active_payment_link");
        else reasons.add("default_price_reference");
      }
      return reasons.size ? [{ id, reasons: [...reasons].sort() }] : [];
    });

    const deactivatablePriceIds = redundantPriceIds.filter(
      (id) => !blockedPrices.some((price) => price.id === id),
    );
    const blockedProducts = duplicateProductIds.flatMap((id) => {
      const reasons = new Set<string>();
      const productPrices = snapshot.pricesByProduct.get(id) ?? [];
      if (
        productPrices.some(
          (price) => price.active && !deactivatablePriceIds.includes(price.id),
        )
      ) {
        reasons.add("active_price_reference");
      }
      if (
        referencesFor(id, liveReferences).some(
          (reference) =>
            reference.kind !== "default_price" ||
            !clearableDefaultPriceIds.has(reference.priceId),
        )
      ) {
        reasons.add("live_reference");
      }
      return reasons.size ? [{ id, reasons: [...reasons].sort() }] : [];
    });
    const deactivatableProductIds = duplicateProductIds.filter(
      (id) => !blockedProducts.some((product) => product.id === id),
    );

    return {
      artworkId: artwork.id,
      slug: artwork.slug,
      canonicalProductId,
      canonicalPriceId,
      duplicateProductIds,
      redundantPriceIds,
      deactivatablePriceIds,
      deactivatableProductIds,
      blockedPrices,
      blockedProducts,
      defaultPriceActions,
    };
  });

  const totalMutations =
    new Set(
      artworks.flatMap((artwork) =>
        artwork.defaultPriceActions
          .filter((action) => action.action === "clear")
          .map((action) => `default_price:${action.productId}`),
      ),
    ).size +
    new Set(
      artworks.flatMap((artwork) =>
        artwork.deactivatablePriceIds.map((id) => `price:${id}`),
      ),
    ).size +
    new Set(
      artworks.flatMap((artwork) =>
        artwork.deactivatableProductIds.map((id) => `product:${id}`),
      ),
    ).size;
  const currentCanonicalSelections = canonicalSelections(artworks);

  return {
    mode,
    generatedAt: new Date().toISOString(),
    catalogArtworkCount: catalog.length,
    canonicalArtworkCount,
    duplicateProductArtworkIds,
    duplicatePriceArtworkIds,
    referenceCounts: {
      historicalOrders: snapshot.historicalOrders.length,
      checkoutSessions: checkoutSessionCount,
      checkoutSessionProtection,
      paymentLinks: paymentLinkCount,
      defaultPriceReferences: defaultPriceCount,
      duplicateDefaultPriceReferences,
    },
    reconciliation: {
      connectedAccountMode: snapshot.stripeAccountMode,
      alerts: reconciliationAlerts,
      unmatchedCheckoutSessionOrderIds: unmatchedCheckoutSessionOrders.map(
        (order) => order.id,
      ),
      staleTestDataOrderIds: staleTestDataOrders.map((order) => order.id),
      unresolvedOrderIds: unresolvedOrders.map((order) => order.id),
    },
    historicalOrders,
    canonicalSelection: {
      before: currentCanonicalSelections,
      after: currentCanonicalSelections,
      changes: [],
    },
    readiness: {
      expectedArtworkCount: catalog.length,
      readyArtworkCount: canonicalArtworkCount,
      missingArtworkIds,
      protectedDuplicateDefaultPriceReferences,
    },
    progress: {
      status: mode === "deactivated" ? "completed" : "not_started",
      totalMutations,
      completedMutations: mode === "deactivated" ? totalMutations : 0,
      lastCompletedMutation: null,
    },
    artworks,
    deactivated,
  };
}

export async function auditStripeCatalog(): Promise<StripeCatalogCleanupReport> {
  return buildStripeCatalogCleanupReport(
    await loadCatalogSnapshot(),
    getPublicCatalog(),
    "dry_run",
  );
}

type StripeCatalogCleanupDependencies = {
  audit: typeof auditStripeCatalog;
  updateProduct: typeof updateStripeProduct;
  deactivatePrice: typeof deactivateStripePrice;
  deactivateProduct: typeof deactivateStripeProduct;
};

const defaultStripeCatalogCleanupDependencies: StripeCatalogCleanupDependencies =
  {
    audit: auditStripeCatalog,
    updateProduct: updateStripeProduct,
    deactivatePrice: deactivateStripePrice,
    deactivateProduct: deactivateStripeProduct,
  };

export async function cleanupStripeCatalog(
  options: {
    confirmation?: string;
    maxMutations?: number;
    onProgress?: (
      progress: StripeCatalogCleanupProgress,
    ) => void | Promise<void>;
  } = {},
  dependencyOverrides: Partial<StripeCatalogCleanupDependencies> = {},
): Promise<StripeCatalogCleanupReport> {
  const dependencies = {
    ...defaultStripeCatalogCleanupDependencies,
    ...dependencyOverrides,
  };
  if (
    options.maxMutations !== undefined &&
    (!Number.isInteger(options.maxMutations) || options.maxMutations < 1)
  ) {
    throw new RangeError("maxMutations must be a positive integer.");
  }

  const before = await dependencies.audit();
  if (options.confirmation !== STRIPE_CATALOG_DEACTIVATION_CONFIRMATION) {
    return before;
  }
  if (
    before.readiness.readyArtworkCount !== before.readiness.expectedArtworkCount
  ) {
    return {
      ...before,
      safetyStop:
        "Deactivation was not attempted because the pre-cleanup readiness audit has missing artwork prices.",
    };
  }
  const canonicalConflicts = canonicalMutationConflicts(before.artworks);
  if (canonicalConflicts.length > 0) {
    const safetyStop = `Deactivation was not attempted because the cleanup plan would mutate canonical Stripe objects: ${canonicalConflicts
      .map(({ artworkId, objectId }) => `${artworkId} (${objectId})`)
      .join(", ")}.`;
    return {
      ...before,
      safetyStop,
      canonicalSelection: {
        ...before.canonicalSelection,
        safetyStop,
      },
    };
  }

  const defaultPrices = [
    ...new Map(
      before.artworks
        .flatMap((artwork) =>
          artwork.defaultPriceActions
            .filter((action) => action.action === "clear")
            .map(({ productId, priceId }) => ({ productId, priceId })),
        )
        .map((defaultPrice) => [defaultPrice.productId, defaultPrice] as const),
    ).values(),
  ];

  const prices = [
    ...new Set(
      before.artworks.flatMap((artwork) => artwork.deactivatablePriceIds),
    ),
  ];
  const products = [
    ...new Set(
      before.artworks.flatMap((artwork) => artwork.deactivatableProductIds),
    ),
  ];
  const mutations: Array<{
    category: StripeCatalogCleanupMutationCategory;
    objectId: string;
    run: () => Promise<unknown>;
  }> = [
    ...defaultPrices.map(({ productId }) => ({
      category: "default_price" as const,
      objectId: productId,
      run: () =>
        dependencies.updateProduct(
          productId,
          { defaultPrice: null },
          stripeCatalogCleanupIdempotencyKey("default_price", productId),
        ),
    })),
    ...prices.map((priceId) => ({
      category: "price" as const,
      objectId: priceId,
      run: () =>
        dependencies.deactivatePrice(
          priceId,
          stripeCatalogCleanupIdempotencyKey("price", priceId),
        ),
    })),
    ...products.map((productId) => ({
      category: "product" as const,
      objectId: productId,
      run: () =>
        dependencies.deactivateProduct(
          productId,
          stripeCatalogCleanupIdempotencyKey("product", productId),
        ),
    })),
  ];

  let progress: StripeCatalogCleanupProgress = {
    status: "in_progress",
    totalMutations: mutations.length,
    completedMutations: 0,
    lastCompletedMutation: null,
  };
  const completedDefaultPrices: Array<{ productId: string; priceId: string }> =
    [];
  const completedPrices: string[] = [];
  const completedProducts: string[] = [];

  const reportProgress = async () => {
    await options.onProgress?.({
      ...progress,
      lastCompletedMutation: progress.lastCompletedMutation
        ? { ...progress.lastCompletedMutation }
        : null,
    });
  };

  await reportProgress();

  const interruptedReport = async (reason: string) => {
    progress = {
      ...progress,
      status: "interrupted",
      interruptionReason: reason,
    };
    await reportProgress();
    return {
      ...before,
      mode: "interrupted" as const,
      progress,
      deactivated: {
        prices: completedPrices,
        products: completedProducts,
        defaultPrices: completedDefaultPrices,
      },
    };
  };

  for (const [index, mutation] of mutations.entries()) {
    if (options.maxMutations !== undefined && index >= options.maxMutations) {
      return interruptedReport(
        `Mutation limit reached after ${progress.completedMutations} of ${progress.totalMutations}; rerun the cleanup to resume.`,
      );
    }

    try {
      await mutation.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return interruptedReport(
        `Cleanup interrupted while processing ${mutation.category} ${mutation.objectId}: ${message}`,
      );
    }

    progress = {
      ...progress,
      completedMutations: progress.completedMutations + 1,
      lastCompletedMutation: {
        category: mutation.category,
        objectId: mutation.objectId,
      },
    };
    if (mutation.category === "default_price") {
      const defaultPrice = defaultPrices.find(
        ({ productId }) => productId === mutation.objectId,
      );
      if (defaultPrice) completedDefaultPrices.push(defaultPrice);
    } else if (mutation.category === "price") {
      completedPrices.push(mutation.objectId);
    } else {
      completedProducts.push(mutation.objectId);
    }
    await reportProgress();
  }

  progress = { ...progress, status: "completed" };
  await reportProgress();
  const after = await dependencies.audit();
  const canonicalSelection = compareStripeCanonicalSelections(
    before.canonicalSelection.after,
    after.canonicalSelection.after,
  );
  const canonicalSelectionSafetyStop =
    canonicalSelection.changes.length > 0
      ? `Canonical catalog selection changed for ${canonicalSelection.changes
          .map((change) => change.artworkId)
          .join(", ")} after deactivation.`
      : undefined;
  if (canonicalSelectionSafetyStop) {
    canonicalSelection.safetyStop = canonicalSelectionSafetyStop;
  }
  return {
    ...after,
    mode: "deactivated",
    canonicalSelection,
    ...(canonicalSelectionSafetyStop
      ? { safetyStop: canonicalSelectionSafetyStop }
      : {}),
    progress,
    deactivated: {
      prices: completedPrices,
      products: completedProducts,
      defaultPrices: completedDefaultPrices,
    },
  };
}

export function stripeCatalogCleanupIdempotencyKey(
  category: StripeCatalogCleanupMutationCategory,
  objectId: string,
) {
  return `stripe-catalog-cleanup:${category}:${objectId}`;
}
