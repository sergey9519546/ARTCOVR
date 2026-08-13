import { HttpError, json, respondError } from "../_shared/errors.ts";
import { admin } from "../_shared/supabase.ts";
import { outputKeys, removePrivate } from "../_shared/storage.ts";

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || request.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "unauthorized", "Scheduler authentication failed.");
    const cutoff = new Date(Date.now() - 135_000).toISOString();
    const { data, error } = await admin.rpc("reap_stale_generations", { p_before: cutoff });
    if (error) throw new HttpError(502, "watchdog_failed", "Timed-out generation cleanup failed.");
    const timedOut = (data ?? []) as Array<{ generation_id: string; artwork_id: string }>;
    await Promise.all(timedOut.map(({ generation_id, artwork_id }) => {
      const keys = outputKeys(artwork_id, generation_id);
      return removePrivate([keys.clean, keys.preview]);
    }));
    return json({ timedOutGenerationIds: timedOut.map((row) => row.generation_id) });
  } catch (error) { return respondError(error); }
});
