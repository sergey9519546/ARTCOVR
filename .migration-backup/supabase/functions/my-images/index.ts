import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { admin, requireUser } from "../_shared/supabase.ts";
import { signPrivate } from "../_shared/storage.ts";

type PurchaseRow = {
  id: string;
  artwork_catalog_id: string;
  artwork_title: string;
  sale_mode: "exclusive" | "repeatable";
  status: "reserved" | "pending" | "paid" | "expired" | "refunded";
  amount_cents: number;
  currency: string;
  selected_preview_generation_id: string | null;
  paid_at: string | null;
  entitlement_expires_at: string | null;
  access_revoked_at: string | null;
  access_revocation_reason: string | null;
  artworks: { slug: string } | null;
};

type GenerationRow = {
  id: string;
  artwork_id: string;
  purchase_id: string | null;
  prompt: string;
  phase: "preview" | "purchased";
  status: "queued" | "running" | "succeeded" | "blocked" | "failed" | "timed_out";
  preview_object_key: string | null;
  clean_object_key: string | null;
  created_at: string;
  expires_at: string;
  artworks: { catalog_id: string } | { catalog_id: string }[] | null;
};

async function optionalSignedUrl(objectKey: string, context: string) {
  try {
    return await signPrivate(objectKey, 300);
  } catch {
    console.error("Entitled asset could not be signed", { context });
    return undefined;
  }
}

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;

  try {
    if (request.method !== "GET") {
      throw new HttpError(405, "method_not_allowed", "Use GET.");
    }
    const user = await requireUser(request);
    const now = new Date();

    const [purchaseResult, generationResult, assetResult] = await Promise.all([
      admin
        .from("purchases")
        .select("id,artwork_catalog_id,artwork_title,sale_mode,status,amount_cents,currency,selected_preview_generation_id,paid_at,entitlement_expires_at,access_revoked_at,access_revocation_reason,artworks!purchases_artwork_id_fkey(slug)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      admin
        .from("generations")
        .select("id,artwork_id,purchase_id,prompt,phase,status,preview_object_key,clean_object_key,created_at,expires_at,artworks!generations_artwork_id_fkey(catalog_id)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      admin.rpc("account_assets", { p_user_id: user.id }),
    ]);

    if (purchaseResult.error) throw new HttpError(502, "purchases_failed", "Purchases could not be loaded.");
    if (generationResult.error) throw new HttpError(502, "generations_failed", "Generated images could not be loaded.");
    if (assetResult.error) throw new HttpError(502, "account_assets_failed", "Download entitlements could not be loaded.");

    const purchases = (purchaseResult.data ?? []) as unknown as PurchaseRow[];
    const generations = (generationResult.data ?? []) as unknown as GenerationRow[];
    const activePurchases = new Set(
      purchases
        .filter((purchase) => purchase.status === "paid"
          && !purchase.access_revoked_at
          && purchase.entitlement_expires_at
          && new Date(purchase.entitlement_expires_at) > now)
        .map((purchase) => purchase.id),
    );
    const selectedPreviews = new Set(
      purchases
        .filter((purchase) => activePurchases.has(purchase.id))
        .map((purchase) => purchase.selected_preview_generation_id)
        .filter((id): id is string => Boolean(id)),
    );

    const generationPayload = await Promise.all(generations.map(async (generation) => {
      const active = new Date(generation.expires_at) > now;
      const artworkRelation = Array.isArray(generation.artworks)
        ? generation.artworks[0]
        : generation.artworks;
      const result: Record<string, unknown> = {
        id: generation.id,
        artworkId: artworkRelation?.catalog_id ?? "",
        purchaseId: generation.purchase_id,
        prompt: generation.prompt,
        phase: generation.phase,
        status: generation.status,
        createdAt: generation.created_at,
        expiresAt: generation.expires_at,
      };
      const previewAllowed = generation.purchase_id === null || activePurchases.has(generation.purchase_id);
      // `account_assets` releases a selected preview for the full purchase
      // entitlement, independent of the 7-day preview generation expiry. The
      // watermarked preview follows the same rule so the account page never
      // offers a clean download for a row it refuses to render.
      const entitledPreview = selectedPreviews.has(generation.id);
      if (generation.status === "succeeded" && (active || entitledPreview) && previewAllowed && generation.preview_object_key) {
        result.previewUrl = await optionalSignedUrl(generation.preview_object_key, `generation-preview:${generation.id}`);
      }
      const cleanAllowed =
        (generation.purchase_id && activePurchases.has(generation.purchase_id)) ||
        selectedPreviews.has(generation.id);
      if (generation.status === "succeeded" && cleanAllowed && generation.clean_object_key) {
        result.cleanUrl = await optionalSignedUrl(generation.clean_object_key, `generation-clean:${generation.id}`);
      }
      return result;
    }));

    const purchasePayload = purchases.map((purchase) => {
      const successfulPurchased = generations.filter(
        (generation) => generation.purchase_id === purchase.id && generation.phase === "purchased" && generation.status === "succeeded",
      ).length;
      return {
        id: purchase.id,
        artworkId: purchase.artwork_catalog_id,
        artworkTitle: purchase.artwork_title,
        artworkSlug: purchase.artworks?.slug ?? "",
        saleMode: purchase.sale_mode,
        status: purchase.status,
        amountCents: purchase.amount_cents,
        currency: purchase.currency,
        paidAt: purchase.paid_at,
        entitlementExpiresAt: purchase.entitlement_expires_at,
        selectedPreviewGenerationId: purchase.selected_preview_generation_id,
        resetSource: "original" as const,
        accessRevokedAt: purchase.access_revoked_at,
        accessRevocationReason: purchase.access_revocation_reason,
        // An elapsed entitlement leaves no generation allowance: `request_generation`
        // rejects it, so the account page must not advertise remaining attempts.
        remainingGenerations: activePurchases.has(purchase.id)
          ? Math.max(0, 4 - successfulPurchased)
          : 0,
      };
    });

    const signedDownloads = await Promise.all((assetResult.data ?? []).map(async (asset: {
      asset_kind: "base" | "selected_preview" | "purchased_result";
      purchase_id: string;
      artwork_id: string;
      generation_id: string | null;
      object_key: string;
      expires_at: string;
    }) => {
      const url = await optionalSignedUrl(
        asset.object_key,
        `download:${asset.purchase_id}:${asset.asset_kind}:${asset.generation_id ?? "base"}`,
      );
      return url ? {
        kind: asset.asset_kind,
        purchaseId: asset.purchase_id,
        artworkId: asset.artwork_id,
        generationId: asset.generation_id,
        expiresAt: asset.expires_at,
        url,
      } : null;
    }));
    const downloads = signedDownloads.filter((download) => download !== null);

    return privateJson({ purchases: purchasePayload, generations: generationPayload, downloads });
  } catch (error) {
    return respondError(error);
  }
});
