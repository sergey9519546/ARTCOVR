import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { admin, readJson, requireUser } from "../_shared/supabase.ts";
import { signPrivate } from "../_shared/storage.ts";

type CatalogArtworkRow = {
  catalog_object_key: string | null;
  is_listed: boolean | null;
  published_at: string | null;
  rights_approved_at: string | null;
  publication_approved_at: string | null;
  sold_at: string | null;
  source_sha256: string | null;
  source_width: number | null;
  source_height: number | null;
  source_bytes: number | string | null;
  source_mime_type: string | null;
};

// The exact predicate set of the `catalog_artworks` view. That view is revoked
// from every browser role, so this endpoint re-states it rather than reading it,
// and an artwork missing technical provenance stays invisible here too.
function isPubliclyVisible(artwork: CatalogArtworkRow | null): boolean {
  if (!artwork) return false;
  return artwork.is_listed === true
    && typeof artwork.published_at === "string"
    && new Date(artwork.published_at).getTime() <= Date.now()
    && Boolean(artwork.rights_approved_at)
    && Boolean(artwork.publication_approved_at)
    && !artwork.sold_at
    && typeof artwork.source_sha256 === "string"
    && /^[0-9a-f]{64}$/.test(artwork.source_sha256)
    && typeof artwork.source_width === "number"
    && artwork.source_width >= 1024
    && artwork.source_height === artwork.source_width
    && Number(artwork.source_bytes) > 0
    && (artwork.source_mime_type === "image/jpeg" || artwork.source_mime_type === "image/png")
    && typeof artwork.catalog_object_key === "string"
    && artwork.catalog_object_key.trim().length > 0;
}

Deno.serve(async (request) => {
  const options = preflight(request); if (options) return options;
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use GET or POST.");
    }
    const query = new URL(request.url).searchParams;
    const body = request.method === "GET" ? null : await readJson<{ generationId?: string; artworkId?: string }>(request);
    const generationId = request.method === "GET" ? query.get("generationId") : body?.generationId;
    const artworkId = request.method === "GET" ? query.get("artworkId") : body?.artworkId;
    if (!generationId && artworkId) {
      const { data: artwork } = await admin.from("artworks")
        .select("catalog_object_key,is_listed,published_at,rights_approved_at,publication_approved_at,sold_at,source_sha256,source_width,source_height,source_bytes,source_mime_type")
        .eq("catalog_id", artworkId).single();
      const catalogArtwork = artwork as CatalogArtworkRow | null;
      if (!isPubliclyVisible(catalogArtwork)) {
        throw new HttpError(404, "artwork_not_found", "Artwork was not found.");
      }
      return privateJson({ artworkId, catalogUrl: await signPrivate(catalogArtwork!.catalog_object_key!, 300) });
    }
    const user = await requireUser(request);
    if (!generationId) throw new HttpError(400, "invalid_request", "generationId is required.");
    const { data: generation, error } = await admin.from("generations").select("id,status,user_id,purchase_id,preview_object_key,clean_object_key,error_code,finished_at,expires_at").eq("id", generationId).single();
    if (error || !generation || generation.user_id !== user.id) throw new HttpError(404, "generation_not_found", "Generation was not found.");
    const result: Record<string, unknown> = { generationId, status: generation.status, errorCode: generation.error_code, finishedAt: generation.finished_at };
    const active = new Date(generation.expires_at).getTime() > Date.now();
    let purchasedAccess = false;
    if (generation.purchase_id) {
      const { data: purchase } = await admin.from("purchases")
        .select("status,user_id,entitlement_expires_at,access_revoked_at")
        .eq("id", generation.purchase_id).single();
      const entitlementExpiresAt = purchase?.entitlement_expires_at;
      purchasedAccess = purchase?.status === "paid" && purchase.user_id === user.id
        && !purchase.access_revoked_at
        && typeof entitlementExpiresAt === "string"
        && new Date(entitlementExpiresAt).getTime() > Date.now();
    }
    if (generation.status === "succeeded" && generation.preview_object_key && active
      && (!generation.purchase_id || purchasedAccess)) {
      result.previewUrl = await signPrivate(generation.preview_object_key, 300);
    }
    if (generation.status === "succeeded" && generation.purchase_id && generation.clean_object_key && purchasedAccess) {
      result.cleanUrl = await signPrivate(generation.clean_object_key, 300);
    }
    return privateJson(result);
  } catch (error) { return respondError(error); }
});
