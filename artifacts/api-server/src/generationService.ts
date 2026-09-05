import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  artcovrGenerations,
  artcovrOrders,
  artcovrReferenceUploads,
  db,
} from "@workspace/db";
import { getPublicArtworkById } from "./catalog";
import { buildGenerationPrompt, PromptLengthError } from "./lib/prompt";
import {
  addWatermark,
  createImageEditResult,
  ensureBaseObject,
} from "./lib/imagePipeline";
import {
  downloadPrivate,
  removePrivate,
  signPrivate,
  uploadPrivate,
} from "./lib/mediaStorage";
import {
  getPurchaseCreditBalance,
  getUserCreditBalance,
  listPurchaseCreditBalances,
  releasePurchaseCredit,
  revokePurchaseCredits,
  spendPurchaseCredit,
} from "./creditService";

const PREVIEW_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const PURCHASE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const JOB_DEADLINE_MS = 5 * 60_000;
const generationIO = {
  ensureBaseObject,
  downloadPrivate,
  uploadPrivate,
  removePrivate,
  createImageEditResult,
  addWatermark,
};

async function expireStalledGenerations(userId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`generation:${userId}`}))`,
    );
    const stalled = await tx
      .update(artcovrGenerations)
      .set({
        status: "timed_out",
        allowanceSlot: null,
        errorCode: "generation_timeout",
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(artcovrGenerations.clerkUserId, userId),
          sql`${artcovrGenerations.status} in ('queued', 'running')`,
          sql`${artcovrGenerations.createdAt} < ${new Date(Date.now() - JOB_DEADLINE_MS)}`,
        ),
      )
      .returning({
        id: artcovrGenerations.id,
        purchaseId: artcovrGenerations.purchaseId,
      });
    for (const generation of stalled) {
      if (generation.purchaseId) {
        await releasePurchaseCredit(tx, {
          userId,
          purchaseId: generation.purchaseId,
          generationId: generation.id,
          reason: "Timed-out image generation credit release",
        });
      }
    }
  });
}

export class GenerationServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(status: number, code: string, message: string): never {
  throw new GenerationServiceError(status, code, message);
}

function effectiveEntitlement(order: {
  status: string;
  paidAt: Date | null;
  entitlementExpiresAt: Date | null;
}) {
  if (order.status !== "paid" || !order.paidAt) return null;
  return (
    order.entitlementExpiresAt ??
    new Date(order.paidAt.getTime() + PURCHASE_EXPIRY_MS)
  );
}

function isActiveEntitlement(
  order: Parameters<typeof effectiveEntitlement>[0],
) {
  const expiry = effectiveEntitlement(order);
  return Boolean(expiry && expiry.getTime() > Date.now());
}

export function isSelectedPreviewForOrder(
  generation: Pick<
    typeof artcovrGenerations.$inferSelect,
    "id" | "artworkId" | "clerkUserId" | "purchaseId" | "phase" | "status"
  >,
  order: Pick<
    typeof artcovrOrders.$inferSelect,
    "artworkId" | "clerkUserId" | "selectedPreviewId"
  >,
) {
  return (
    generation.status === "succeeded" &&
    generation.phase === "preview" &&
    generation.purchaseId === null &&
    generation.artworkId === order.artworkId &&
    generation.clerkUserId === order.clerkUserId &&
    generation.id === order.selectedPreviewId
  );
}

export async function admitGeneration(
  input: {
    userId: string;
    artworkId: string;
    prompt: string;
    requestId?: string;
    purchaseId?: string | null;
    referenceGenerationId?: string | null;
    referenceUploadId?: string | null;
    coverText?: { title?: string | null; artistName?: string | null } | null;
    styleMode?: "exact" | "expand" | null;
    resetToBase?: boolean;
  },
  io = generationIO,
) {
  const artwork = getPublicArtworkById(input.artworkId);
  if (!artwork)
    fail(
      404,
      "generation_unavailable",
      "Image generation is not currently available for this artwork.",
    );
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt || prompt.length > 12_000)
    fail(400, "invalid_request", "artworkId and prompt are required.");
  if (
    input.styleMode &&
    input.styleMode !== "exact" &&
    input.styleMode !== "expand"
  ) {
    fail(400, "invalid_request", 'styleMode must be "exact" or "expand".');
  }
  const title = input.coverText?.title ?? "";
  const artistName = input.coverText?.artistName ?? "";
  if (
    typeof title !== "string" ||
    typeof artistName !== "string" ||
    title.length > 120 ||
    artistName.length > 120
  ) {
    fail(
      400,
      "cover_text_too_long",
      "Cover title and artist name must each be 120 characters or fewer.",
    );
  }
  let providerPrompt: string;
  try {
    providerPrompt = buildGenerationPrompt({
      artwork: {
        title: artwork.title,
        category: artwork.category,
        moodTags: artwork.moodTags,
      },
      userPrompt: prompt,
      coverText: input.coverText,
      styleMode: input.styleMode,
      hasReferenceUpload: Boolean(input.referenceUploadId),
    });
  } catch (error) {
    if (error instanceof PromptLengthError) {
      fail(
        400,
        "prompt_too_long",
        "The prompt is too long once this artwork's style anchor is applied.",
      );
    }
    throw error;
  }

  await expireStalledGenerations(input.userId);
  const id = input.requestId
    ? createHash("sha256")
        .update(`${input.userId}:${input.requestId}`)
        .digest("hex")
    : randomUUID();
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        artwork.id,
        prompt,
        input.purchaseId ?? null,
        input.referenceGenerationId ?? null,
        input.referenceUploadId ?? null,
        title,
        artistName,
        input.styleMode ?? "exact",
        Boolean(input.resetToBase),
      ]),
    )
    .digest("hex");
  return db.transaction(async (tx) => {
    // Serialize this customer's admissions across purchases: request IDs and
    // rate limits are customer-wide, while allowance queries remain scoped.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`generation:${input.userId}`}))`,
    );
    const existing = (
      await tx
        .select()
        .from(artcovrGenerations)
        .where(
          and(
            eq(artcovrGenerations.id, id),
            eq(artcovrGenerations.clerkUserId, input.userId),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      if (existing.providerUsage.requestFingerprint !== requestFingerprint)
        fail(
          409,
          "generation_request_conflict",
          "This request ID was already used for a different edit.",
        );
      return {
        id,
        artwork,
        purchaseId: existing.purchaseId,
        sourceKey: existing.sourceObjectKey,
        referenceKey: null,
        providerPrompt,
        expiresAt: existing.expiresAt,
        replayed: true,
      };
    }

    const recent = await tx
      .select({ id: artcovrGenerations.id })
      .from(artcovrGenerations)
      .where(
        and(
          eq(artcovrGenerations.clerkUserId, input.userId),
          gte(artcovrGenerations.createdAt, new Date(Date.now() - 10 * 60_000)),
        ),
      );
    if (recent.length >= 6)
      fail(
        429,
        "generation_rate_limited",
        "Too many generations. Try again later.",
      );
    const daily = await tx
      .select({ id: artcovrGenerations.id })
      .from(artcovrGenerations)
      .where(
        and(
          eq(artcovrGenerations.clerkUserId, input.userId),
          gte(
            artcovrGenerations.createdAt,
            new Date(Date.now() - 24 * 60 * 60_000),
          ),
        ),
      );
    if (daily.length >= 24)
      fail(
        429,
        "generation_daily_limit",
        "Your daily generation limit has been reached.",
      );

    let order: typeof artcovrOrders.$inferSelect | undefined;
    if (input.purchaseId) {
      order = (
        await tx
          .select()
          .from(artcovrOrders)
          .where(
            and(
              eq(artcovrOrders.id, input.purchaseId),
              eq(artcovrOrders.clerkUserId, input.userId),
            ),
          )
          .limit(1)
      )[0];
      if (
        !order ||
        order.artworkId !== artwork.id ||
        !isActiveEntitlement(order) ||
        order.accessRevokedAt
      ) {
        fail(
          403,
          "purchase_not_entitled",
          "That purchase does not grant active generation access.",
        );
      }
    }

    const active = await tx
      .select()
      .from(artcovrGenerations)
      .where(
        and(
          eq(artcovrGenerations.clerkUserId, input.userId),
          eq(artcovrGenerations.artworkId, artwork.id),
          input.purchaseId
            ? eq(artcovrGenerations.purchaseId, input.purchaseId)
            : isNull(artcovrGenerations.purchaseId),
          sql`${artcovrGenerations.status} in ('queued', 'running')`,
        ),
      );
    if (active.length)
      fail(
        409,
        "generation_already_started",
        "A generation is already running for this artwork.",
      );

    const parentGenerationId: string | null = input.resetToBase
      ? null
      : (input.referenceGenerationId ?? order?.selectedPreviewId ?? null);
    let sourceKey: string | null = null;
    if (parentGenerationId && !input.resetToBase) {
      const parent = (
        await tx
          .select()
          .from(artcovrGenerations)
          .where(
            and(
              eq(artcovrGenerations.id, parentGenerationId),
              eq(artcovrGenerations.clerkUserId, input.userId),
              eq(artcovrGenerations.artworkId, artwork.id),
              eq(artcovrGenerations.status, "succeeded"),
            ),
          )
          .limit(1)
      )[0];
      if (!parent || !parent.cleanObjectKey)
        fail(
          404,
          "generation_not_found",
          "The referenced generation was not found.",
        );
      if (
        parent.expiresAt.getTime() <= Date.now() &&
        parent.id !== order?.selectedPreviewId
      )
        fail(
          409,
          "generation_reference_expired",
          "That generated result has expired.",
        );
      if (
        input.purchaseId &&
        parent.phase === "preview" &&
        parent.id !== order?.selectedPreviewId
      )
        fail(
          403,
          "reference_is_not_selected_preview",
          "Only the selected preview can be used after purchase.",
        );
      if (!input.purchaseId && parent.phase !== "preview")
        fail(
          403,
          "preview_cannot_reference_purchased_result",
          "A preview cannot use a purchased result as its source.",
        );
      if (
        input.purchaseId &&
        parent.phase === "purchased" &&
        parent.purchaseId !== input.purchaseId
      )
        fail(
          403,
          "purchase_reference_mismatch",
          "That result belongs to a different purchase.",
        );
      sourceKey = parent.cleanObjectKey;
    }
    // Validate the mandatory canvas before consuming a photo or allowance.
    try {
      if (!sourceKey)
        sourceKey = await io.ensureBaseObject(artwork.id, artwork.slug);
      if (!(await io.downloadPrivate(sourceKey)).length)
        throw new Error("Empty source");
    } catch {
      fail(
        409,
        "generation_source_unavailable",
        "The selected artwork image is unavailable. No allowance was used.",
      );
    }

    let referenceUpload:
      | typeof artcovrReferenceUploads.$inferSelect
      | undefined;
    if (input.referenceUploadId) {
      referenceUpload = (
        await tx
          .select()
          .from(artcovrReferenceUploads)
          .where(
            and(
              eq(artcovrReferenceUploads.id, input.referenceUploadId),
              eq(artcovrReferenceUploads.clerkUserId, input.userId),
            ),
          )
          .limit(1)
      )[0];
      if (
        !referenceUpload ||
        referenceUpload.artworkId !== artwork.id ||
        !referenceUpload.uploadedAt
      )
        fail(
          404,
          "reference_upload_unresolved",
          "The uploaded reference was not found.",
        );
      if (referenceUpload.consumedAt)
        fail(
          409,
          "reference_upload_consumed",
          "That reference has already been used.",
        );
      if (referenceUpload.expiresAt.getTime() <= Date.now())
        fail(409, "reference_upload_expired", "That reference has expired.");
      await tx
        .update(artcovrReferenceUploads)
        .set({ consumedAt: new Date() })
        .where(eq(artcovrReferenceUploads.id, referenceUpload.id));
    }

    let slot: number | null = null;
    if (input.purchaseId) {
      const balance = await getPurchaseCreditBalance(
        tx,
        input.userId,
        input.purchaseId,
      );
      if (balance < 1)
        fail(
          409,
          "generation_credits_exhausted",
          "No image-edit credits remain for this purchase.",
        );
      const spent = await spendPurchaseCredit(tx, {
        userId: input.userId,
        purchaseId: input.purchaseId,
        generationId: id,
      });
      if (!spent)
        fail(
          409,
          "generation_credits_exhausted",
          "No image-edit credits remain for this purchase.",
        );
      // Retain this field as an audit-friendly sequence for older records. It
      // is not used for admission; the ledger is the source of truth.
      slot = Math.max(1, (order?.includedCredits ?? 1) - balance + 1);
    } else {
      const successful = await tx
        .select({ slot: artcovrGenerations.allowanceSlot })
        .from(artcovrGenerations)
        .where(
          and(
            eq(artcovrGenerations.clerkUserId, input.userId),
            eq(artcovrGenerations.artworkId, artwork.id),
            isNull(artcovrGenerations.purchaseId),
            sql`${artcovrGenerations.status} in ('queued','running','succeeded')`,
          ),
        );
      const used = new Set(
        successful
          .map((row) => row.slot)
          .filter((value): value is number => value !== null),
      );
      slot = Array.from({ length: 2 }, (_, index) => index + 1).find(
        (value) => !used.has(value),
      ) ?? null;
      if (!slot)
        fail(
          409,
          "generation_allowance_exhausted",
          "No generation allowance remains for this artwork.",
        );
    }

    const expiresAt = new Date(
      Date.now() + (input.purchaseId ? PURCHASE_EXPIRY_MS : PREVIEW_EXPIRY_MS),
    );
    await tx.insert(artcovrGenerations).values({
      id,
      artworkId: artwork.id,
      clerkUserId: input.userId,
      purchaseId: input.purchaseId ?? null,
      parentGenerationId,
      referenceUploadId: referenceUpload?.id ?? null,
      phase: input.purchaseId ? "purchased" : "preview",
      status: "queued",
      allowanceSlot: slot,
      prompt,
      providerUsage: { requestFingerprint },
      sourceObjectKey: sourceKey,
      expiresAt,
    });
    return {
      id,
      artwork,
      purchaseId: input.purchaseId ?? null,
      sourceKey,
      referenceKey: referenceUpload?.objectKey ?? null,
      providerPrompt,
      expiresAt,
      replayed: false,
    };
  });
}

export async function runGeneration(
  job: Awaited<ReturnType<typeof admitGeneration>>,
  userId: string,
  io = generationIO,
) {
  if (job.replayed) return;
  const uploaded: string[] = [];
  let ownsJob = false;
  try {
    const claimed = await db
      .update(artcovrGenerations)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(
          eq(artcovrGenerations.id, job.id),
          eq(artcovrGenerations.clerkUserId, userId),
          eq(artcovrGenerations.status, "queued"),
        ),
      )
      .returning({ id: artcovrGenerations.id });
    if (!claimed.length) return;
    ownsJob = true;
    const source = await io.downloadPrivate(job.sourceKey);
    const identityReference = job.referenceKey
      ? await io.downloadPrivate(job.referenceKey)
      : undefined;
    const size = job.purchaseId ? 2048 : 1024;
    const edited = await io.createImageEditResult(
      source,
      job.providerPrompt,
      size,
      identityReference,
      job.sourceKey.endsWith(".webp") ? "image/webp" : "image/jpeg",
    );
    const cleanKey = `generated/${job.artwork.id}/${job.id}/clean.webp`;
    const previewKey = `generated/${job.artwork.id}/${job.id}/preview-watermarked.webp`;
    await io.uploadPrivate(cleanKey, edited.bytes, "image/webp");
    uploaded.push(cleanKey);
    const preview = await io.addWatermark(edited.bytes, size);
    await io.uploadPrivate(previewKey, preview, "image/webp");
    uploaded.push(previewKey);
    const completed = await db
      .update(artcovrGenerations)
      .set({
        status: "succeeded",
        cleanObjectKey: cleanKey,
        previewObjectKey: previewKey,
        providerRequestId: edited.requestId,
        providerUsage: sql`${artcovrGenerations.providerUsage} || ${JSON.stringify({ provider: "openai", model: edited.model, ...(edited.usage ? { usage: edited.usage } : {}) })}::jsonb`,
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(artcovrGenerations.id, job.id),
          eq(artcovrGenerations.status, "running"),
        ),
      )
      .returning({ id: artcovrGenerations.id });
    if (!completed.length)
      await io.removePrivate(uploaded).catch(() => undefined);
  } catch (error) {
    await io.removePrivate(uploaded).catch(() => undefined);
    const providerCode =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    const timedOut =
      providerCode === "provider_timeout" ||
      (error instanceof Error && /timeout|timedout|abort/i.test(error.name));
    await db.transaction(async (tx) => {
      const failed = await tx
        .update(artcovrGenerations)
        .set({
          status: timedOut ? "timed_out" : "failed",
          allowanceSlot: null,
          errorCode: timedOut
            ? "provider_timeout"
            : error instanceof GenerationServiceError
              ? error.code
              : providerCode === "invalid_provider_image" ||
                  providerCode === "provider_failed"
                ? providerCode
                : "generation_failed",
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(artcovrGenerations.id, job.id),
            eq(artcovrGenerations.clerkUserId, userId),
            eq(artcovrGenerations.status, "running"),
          ),
        )
        .returning({ id: artcovrGenerations.id });
      if (failed.length && job.purchaseId) {
        await releasePurchaseCredit(tx, {
          userId,
          purchaseId: job.purchaseId,
          generationId: job.id,
          reason: timedOut
            ? "Timed-out image generation credit release"
            : "Failed image generation credit release",
        });
      }
    });
  } finally {
    // Photo cleanup must never turn a successful provider result into a refund.
    if (ownsJob && job.referenceKey) {
      try {
        await io.removePrivate([job.referenceKey]);
        await db
          .delete(artcovrReferenceUploads)
          .where(
            and(
              eq(artcovrReferenceUploads.objectKey, job.referenceKey),
              eq(artcovrReferenceUploads.clerkUserId, userId),
            ),
          );
      } catch {
        // Retain the private object key for a later cleanup attempt.
      }
    }
  }
}

export async function generationStatus(id: string, userId: string) {
  await expireStalledGenerations(userId);
  const generation = (
    await db
      .select()
      .from(artcovrGenerations)
      .where(
        and(
          eq(artcovrGenerations.id, id),
          eq(artcovrGenerations.clerkUserId, userId),
        ),
      )
      .limit(1)
  )[0];
  if (!generation)
    fail(404, "generation_not_found", "Generation was not found.");
  const result: Record<string, unknown> = {
    generationId: generation.id,
    status: generation.status,
    errorCode: generation.errorCode,
    finishedAt: generation.finishedAt?.toISOString() ?? null,
  };
  const active = generation.expiresAt.getTime() > Date.now();
  let entitled = !generation.purchaseId;
  let selectedPreview = false;
  if (generation.purchaseId) {
    const order = (
      await db
        .select()
        .from(artcovrOrders)
        .where(
          and(
            eq(artcovrOrders.id, generation.purchaseId),
            eq(artcovrOrders.clerkUserId, userId),
          ),
        )
        .limit(1)
    )[0];
    entitled = Boolean(
      order && !order.accessRevokedAt && isActiveEntitlement(order),
    );
  } else {
    const selected = (
      await db
        .select()
        .from(artcovrOrders)
        .where(
          and(
            eq(artcovrOrders.clerkUserId, userId),
            eq(artcovrOrders.selectedPreviewId, generation.id),
          ),
        )
        .limit(1)
    )[0];
    selectedPreview = Boolean(
      selected &&
      isSelectedPreviewForOrder(generation, selected) &&
      !selected.accessRevokedAt &&
      isActiveEntitlement(selected),
    );
  }
  if (
    generation.status === "succeeded" &&
    generation.previewObjectKey &&
    (active || selectedPreview) &&
    entitled
  ) {
    result.previewUrl = await signPrivate(generation.previewObjectKey);
  }
  if (
    generation.status === "succeeded" &&
    generation.cleanObjectKey &&
    generation.purchaseId &&
    entitled
  ) {
    result.cleanUrl = await signPrivate(generation.cleanObjectKey);
  }
  return result;
}

export async function serializeAccount(userId: string) {
  const [orders, generations] = await Promise.all([
    db
      .select()
      .from(artcovrOrders)
      .where(eq(artcovrOrders.clerkUserId, userId))
      .orderBy(desc(artcovrOrders.createdAt)),
    db
      .select()
      .from(artcovrGenerations)
      .where(eq(artcovrGenerations.clerkUserId, userId))
      .orderBy(desc(artcovrGenerations.createdAt)),
  ]);
  await Promise.all(
    orders
      .filter(
        (order) =>
          order.accessRevokedAt ||
          (order.status === "paid" && !isActiveEntitlement(order)),
      )
      .map((order) =>
        revokePurchaseCredits(
          order.id,
          order.accessRevocationReason ??
            (order.status === "paid"
              ? "Purchase entitlement expired"
              : "Purchase access revoked"),
          `purchase:${order.id}:revoke`,
        ),
      ),
  );
  const purchaseBalances = new Map(
    (await listPurchaseCreditBalances(db, userId)).map((balance) => [
      balance.purchaseId,
      balance.balance,
    ]),
  );
  const totalCreditBalance = await getUserCreditBalance(db, userId);
  const purchases = orders.map((order) => {
    const artwork = getPublicArtworkById(order.artworkId);
    const entitlementExpiresAt = effectiveEntitlement(order);
    return {
      id: order.id,
      artworkId: order.artworkId,
      artworkTitle: artwork?.title ?? order.artworkSlug,
      artworkSlug: artwork?.slug ?? order.artworkSlug,
      saleMode: order.saleMode,
      status: order.status,
      amountCents: order.amountCents,
      currency: order.currency,
      paidAt: order.paidAt?.toISOString() ?? null,
      entitlementExpiresAt: entitlementExpiresAt?.toISOString() ?? null,
      selectedPreviewGenerationId: order.selectedPreviewId,
      resetSource: "original" as const,
      accessRevokedAt: order.accessRevokedAt?.toISOString() ?? null,
      accessRevocationReason: order.accessRevocationReason,
      includedCredits: order.includedCredits,
      remainingCredits:
        isActiveEntitlement(order) && !order.accessRevokedAt
          ? Math.max(0, purchaseBalances.get(order.id) ?? 0)
          : 0,
      remainingGenerations:
        isActiveEntitlement(order) && !order.accessRevokedAt
          ? Math.max(0, purchaseBalances.get(order.id) ?? 0)
          : 0,
    };
  });
  const activeOrders = new Map(
    orders
      .filter((order) => isActiveEntitlement(order) && !order.accessRevokedAt)
      .map((order) => [order.id, order]),
  );
  const optionalSign = async (key: string) => {
    try {
      return await signPrivate(key);
    } catch {
      return undefined;
    }
  };
  const serializedGenerations = await Promise.all(
    generations.map(async (generation) => {
      const selected = orders.some(
        (order) =>
          isSelectedPreviewForOrder(generation, order) &&
          isActiveEntitlement(order) &&
          !order.accessRevokedAt,
      );
      const allowed =
        !generation.purchaseId || activeOrders.has(generation.purchaseId);
      const previewUrl =
        generation.previewObjectKey &&
        generation.status === "succeeded" &&
        allowed &&
        (selected || generation.expiresAt.getTime() > Date.now())
          ? await optionalSign(generation.previewObjectKey)
          : undefined;
      const cleanUrl =
        generation.cleanObjectKey &&
        generation.status === "succeeded" &&
        (selected || (generation.purchaseId !== null && allowed))
          ? await optionalSign(generation.cleanObjectKey)
          : undefined;
      return {
        id: generation.id,
        artworkId: generation.artworkId,
        purchaseId: generation.purchaseId,
        prompt: generation.prompt,
        phase: generation.phase,
        status: generation.status,
        createdAt: generation.createdAt.toISOString(),
        expiresAt: generation.expiresAt.toISOString(),
        ...(previewUrl ? { previewUrl } : {}),
        ...(cleanUrl ? { cleanUrl } : {}),
      };
    }),
  );
  const downloads = (
    await Promise.all(
      orders.flatMap((order) => {
        const expiry = effectiveEntitlement(order);
        if (!expiry || !isActiveEntitlement(order) || order.accessRevokedAt)
          return [];
        const artwork = getPublicArtworkById(order.artworkId);
        if (!artwork) return [];
        const selected = generations.find((generation) =>
          isSelectedPreviewForOrder(generation, order),
        );
        const successful = generations.filter(
          (generation) =>
            generation.purchaseId === order.id &&
            generation.status === "succeeded",
        );
        return [
          {
            kind: "base" as const,
            generationId: null,
            key: ensureBaseObject(artwork.id, artwork.slug),
          },
          ...(selected?.cleanObjectKey
            ? [
                {
                  kind: "selected_preview" as const,
                  generationId: selected.id,
                  key: Promise.resolve(selected.cleanObjectKey),
                },
              ]
            : []),
          ...successful
            .filter((generation) => generation.cleanObjectKey)
            .map((generation) => ({
              kind: "purchased_result" as const,
              generationId: generation.id,
              key: Promise.resolve(generation.cleanObjectKey!),
            })),
        ].map(async (asset) => {
          const url = await optionalSign(await asset.key);
          return url
            ? {
                kind: asset.kind,
                purchaseId: order.id,
                artworkId: order.artworkId,
                generationId: asset.generationId,
                expiresAt: expiry.toISOString(),
                url,
              }
            : null;
        });
      }),
    )
  ).filter(Boolean);
  return {
    totalCreditBalance: Math.max(0, totalCreditBalance),
    purchases,
    generations: serializedGenerations,
    downloads,
  };
}
