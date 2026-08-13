import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { admin, readJson, requireUser } from "../_shared/supabase.ts";
import { signPrivate } from "../_shared/storage.ts";

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
        .select("catalog_object_key,is_listed,published_at,rights_approved_at,publication_approved_at,sold_at")
        .eq("catalog_id", artworkId).single();
      if (!artwork || !artwork.is_listed || !artwork.published_at || new Date(artwork.published_at) > new Date()
        || !artwork.rights_approved_at || !artwork.publication_approved_at || artwork.sold_at) {
        throw new HttpError(404, "artwork_not_found", "Artwork was not found.");
      }
      return privateJson({ artworkId, catalogUrl: await signPrivate(artwork.catalog_object_key, 300) });
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
