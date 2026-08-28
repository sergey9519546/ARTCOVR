import { HttpError, json, respondError } from "../_shared/errors.ts";
import { admin } from "../_shared/supabase.ts";
import { allOutputKeys, removePrivate } from "../_shared/storage.ts";

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || request.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "unauthorized", "Scheduler authentication failed.");
    // Must exceed the worst-case worker budget: the 130s provider ceiling plus
    // a 15s watermark render plus a 30s finalization margin. A shorter cutoff
    // reaped live jobs and released allowance a running worker still owned.
    const cutoff = new Date(Date.now() - 180_000).toISOString();
    const { data, error } = await admin.rpc("reap_stale_generations", { p_before: cutoff });
    if (error) throw new HttpError(502, "watchdog_failed", "Timed-out generation cleanup failed.");
    const timedOut = (data ?? []) as Array<{ generation_id: string; artwork_id: string }>;
    await Promise.all(timedOut.map(({ generation_id, artwork_id }) => {
      // The reaped worker died before recording which clean format the provider
      // returned, so sweep every possible output key rather than assuming WebP.
      return removePrivate(allOutputKeys(artwork_id, generation_id));
    }));
    // Expired, never-consumed reference uploads are purged on the same beat:
    // the RPC deletes the rows and hands back the object keys, and the objects
    // go with them. A consumed upload is cleaned by its generation's own
    // failure path, so this only ever touches uploads nothing used.
    const { data: purged, error: purgeError } = await admin.rpc("purge_expired_reference_uploads", {});
    if (purgeError) throw new HttpError(502, "watchdog_failed", "Expired reference-upload cleanup failed.");
    const expired = (purged ?? []) as Array<{ upload_id: string; object_key: string }>;
    await removePrivate(expired.map((row) => row.object_key));

    return json({
      timedOutGenerationIds: timedOut.map((row) => row.generation_id),
      purgedReferenceUploadIds: expired.map((row) => row.upload_id),
    });
  } catch (error) { return respondError(error); }
});
