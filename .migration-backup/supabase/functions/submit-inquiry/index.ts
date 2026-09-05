import { preflight } from "../_shared/cors.ts";
import { HttpError, json, respondError } from "../_shared/errors.ts";
import { admin, readJson, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = preflight(request); if (options) return options;
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const user = await requireUser(request);
    const body = await readJson<{ name?: string; message?: string }>(request);
    if (!body.message || body.message.trim().length < 1 || body.message.length > 5000) throw new HttpError(400, "invalid_message", "Message must contain 1–5000 characters.");
    if (!user.email) throw new HttpError(400, "missing_email", "Authenticated user has no email address.");
    // One authenticated account cannot turn the contact form into an unbounded
    // write channel. `inquiries_owner_idx` covers this count.
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error: countError } = await admin.from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if (countError) throw new HttpError(502, "inquiry_failed", "Your inquiry could not be saved.");
    if ((count ?? 0) >= 5) throw new HttpError(429, "inquiry_rate_limited", "Too many inquiries in the last hour. Try again later.");
    const { data, error } = await admin.from("inquiries").insert({ user_id: user.id, email: user.email, name: body.name?.trim() || null, message: body.message.trim() }).select("id,created_at").single();
    if (error) throw new HttpError(502, "inquiry_failed", "Your inquiry could not be saved.");
    await admin.from("analytics_events").insert({ user_id: user.id, event_name: "inquiry_submitted" });
    return json({ inquiryId: data.id, createdAt: data.created_at }, 201);
  } catch (error) { return respondError(error); }
});
