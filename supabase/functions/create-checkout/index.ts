import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { admin, readJson, requireUser } from "../_shared/supabase.ts";
import { postgresHttpError } from "../_shared/postgres-errors.ts";
import {
  createCheckout,
  expireCheckout,
  isStripeRequestIndeterminate,
  retrieveCheckout,
  retrievePaymentIntent,
} from "../_shared/stripe.ts";

// `artworks_catalog_id_format` in SQL. Rejecting a malformed identifier here
// keeps a hostile body from reaching the reservation RPC at all.
const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,95}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;

  try {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const user = await requireUser(request);
    const body = await readJson<{
      artworkId?: string;
      idempotencyKey?: string;
      selectedPreviewId?: string | null;
    }>(request);
    if (!body.artworkId || !body.idempotencyKey) {
      throw new HttpError(400, "invalid_request", "artworkId and idempotencyKey are required.");
    }
    if (!CATALOG_ID_PATTERN.test(body.artworkId)) {
      throw new HttpError(400, "invalid_request", "artworkId is not a valid catalog identifier.");
    }
    if (!UUID_PATTERN.test(body.idempotencyKey)) {
      throw new HttpError(400, "invalid_request", "idempotencyKey must be a UUID.");
    }
    if (body.selectedPreviewId && !UUID_PATTERN.test(body.selectedPreviewId)) {
      throw new HttpError(400, "invalid_request", "selectedPreviewId must be a UUID.");
    }

    const reserve = async () => {
      const { data, error } = await admin.rpc("reserve_artwork", {
        p_catalog_id: body.artworkId,
        p_user_id: user.id,
        p_idempotency_key: body.idempotencyKey,
        p_selected_preview_generation_id: body.selectedPreviewId ?? null,
      });
      if (error) {
        throw postgresHttpError(error, {
          status: 409,
          code: "reservation_failed",
          message: "Checkout could not reserve this artwork.",
        });
      }
      return data?.[0] as {
        outcome: string;
        purchase_id: string | null;
        reservation_expires_at: string | null;
      } | undefined;
    };

    let reservation = await reserve();
    if (reservation?.outcome === "expired_pending" && reservation.purchase_id) {
      const { data: stale } = await admin
        .from("purchases")
        .select("user_id,idempotency_key,artwork_catalog_id,stripe_checkout_session_id,amount_cents,currency")
        .eq("id", reservation.purchase_id)
        .single();
      if (!stale) {
        throw new HttpError(409, "reservation_reconciliation_failed", "Stale reservation could not be read.");
      }
      if (stale.stripe_checkout_session_id) {
        const session = await retrieveCheckout(stale.stripe_checkout_session_id);
        let refundedPayment = false;
        if (session.status === "complete" && session.payment_status === "paid") {
          if (!session.payment_intent
            || session.metadata?.purchase_id !== reservation.purchase_id
            || session.metadata?.artwork_catalog_id !== stale.artwork_catalog_id
            || session.client_reference_id !== reservation.purchase_id
            || session.amount_total !== stale.amount_cents
            || session.currency?.toUpperCase() !== stale.currency.toUpperCase()) {
            throw new HttpError(409, "reservation_reconciliation_mismatch", "Existing payment does not match its reservation.");
          }
          const payment = await retrievePaymentIntent(session.payment_intent);
          const latestCharge = typeof payment.latest_charge === "object" ? payment.latest_charge : null;
          if (payment.metadata?.purchase_id !== reservation.purchase_id
            || payment.amount !== stale.amount_cents
            || payment.amount_received !== stale.amount_cents
            || payment.currency.toUpperCase() !== stale.currency.toUpperCase()) {
            throw new HttpError(409, "reservation_payment_mismatch", "Existing PaymentIntent does not match its reservation.");
          }
          refundedPayment = Boolean(
            latestCharge?.refunded || (latestCharge && latestCharge.amount_refunded >= latestCharge.amount),
          );
          if (refundedPayment) {
            const { data: reconciled, error: reconcileError } = await admin.rpc("reconcile_full_refund", {
              p_purchase_id: reservation.purchase_id,
              p_stripe_payment_intent_id: payment.id,
            });
            if (reconcileError || !["refunded", "already_refunded", "expired_refunded", "already_expired"].includes(reconciled)) {
              throw new HttpError(502, "reservation_refund_failed", "Refund reconciliation did not reach a terminal state.");
            }
          } else {
            const { data: settled, error: settleError } = await admin.rpc("settle_purchase_paid", {
              p_purchase_id: reservation.purchase_id,
              p_stripe_checkout_session_id: session.id,
              p_stripe_payment_intent_id: session.payment_intent,
              p_amount_cents: session.amount_total,
              p_currency: session.currency,
            });
            if (settleError || !["paid", "already_paid"].includes(settled)) {
              throw new HttpError(409, "reservation_fulfillment_failed", "Existing payment could not be fulfilled safely.");
            }
            throw new HttpError(409, "sold", "Artwork was purchased before its reservation could be released.");
          }
        }
        if (session.status !== "expired" && !refundedPayment) {
          throw new HttpError(409, "reservation_reconciliation_pending", "Existing checkout is still being resolved.");
        }
      }
      const { error: expireError } = await admin.rpc("expire_purchase", {
        p_purchase_id: reservation.purchase_id,
        p_stripe_checkout_session_id: stale.stripe_checkout_session_id ?? null,
      });
      if (expireError) {
        throw new HttpError(502, "reservation_expiry_failed", "The expired reservation could not be released.");
      }
      if (stale.user_id === user.id && stale.idempotency_key === body.idempotencyKey) {
        throw new HttpError(409, "idempotency_expired", "This checkout attempt expired. Start checkout again.");
      }
      reservation = await reserve();
    }

    if (reservation?.outcome === "reservation_rate_limited") {
      throw new HttpError(
        429,
        "reservation_rate_limited",
        "Too many open or abandoned checkouts on this account. Complete or let an existing checkout expire, then try again.",
      );
    }
    if (reservation?.outcome === "selected_preview_conflict") {
      throw new HttpError(
        409,
        "selected_preview_conflict",
        "Your active checkout for this artwork uses a different selected preview. Complete or wait for that checkout to expire, then try again.",
      );
    }

    if (!reservation || !reservation.purchase_id || !reservation.reservation_expires_at) {
      throw new HttpError(409, reservation?.outcome ?? "unavailable", "Artwork is not currently available.");
    }

    const { data: purchase, error: purchaseError } = await admin
      .from("purchases")
      .select("artwork_id,artwork_catalog_id,artwork_title,amount_cents,currency,stripe_checkout_session_id,stripe_checkout_expires_at,artworks!purchases_artwork_id_fkey(slug)")
      .eq("id", reservation.purchase_id)
      .eq("user_id", user.id)
      .single();
    if (purchaseError || !purchase || purchase.artwork_catalog_id !== body.artworkId) {
      throw new HttpError(409, "reservation_snapshot_mismatch", "Checkout reservation does not match the requested artwork.");
    }
    const artworkRelation = purchase.artworks as { slug?: unknown } | null;
    if (typeof artworkRelation?.slug !== "string" || !CATALOG_ID_PATTERN.test(artworkRelation.slug)) {
      throw new HttpError(409, "reservation_snapshot_mismatch", "Checkout reservation has no valid artwork destination.");
    }

    if (reservation.outcome === "existing") {
      if (purchase?.stripe_checkout_session_id) {
        const session = await retrieveCheckout(purchase.stripe_checkout_session_id);
        if (session.status !== "open" || !session.url) {
          throw new HttpError(409, "checkout_unavailable", "Existing checkout can no longer be used.");
        }
        if (session.client_reference_id !== reservation.purchase_id
          || session.metadata?.purchase_id !== reservation.purchase_id
          || session.metadata?.artwork_catalog_id !== purchase.artwork_catalog_id
          || session.amount_total !== purchase.amount_cents
          || session.currency?.toUpperCase() !== purchase.currency.toUpperCase()) {
          throw new HttpError(409, "checkout_snapshot_mismatch", "Existing checkout no longer matches its reservation.");
        }
        return privateJson({
          purchaseId: reservation.purchase_id,
          checkoutUrl: session.url,
          expiresAt: new Date(session.expires_at * 1000).toISOString(),
        });
      }
      // A prior request can be interrupted after Stripe creates the Session but
      // before the DB attach. The purchase-scoped Stripe idempotency key below
      // safely retrieves that same Session and completes the attach.
    }

    let session: Awaited<ReturnType<typeof createCheckout>>;
    try {
      session = await createCheckout({
        purchaseId: reservation.purchase_id,
        catalogId: purchase.artwork_catalog_id,
        artworkSlug: artworkRelation.slug,
        title: purchase.artwork_title,
        amount: purchase.amount_cents,
        currency: purchase.currency,
        expiresAt: purchase.stripe_checkout_expires_at,
      });
    } catch (error) {
      // A timeout, network failure, 409, 429, or Stripe 5xx can occur after
      // Stripe accepted the idempotent request. Preserve the reservation so a
      // retry with identical parameters can recover the canonical Session.
      if (!isStripeRequestIndeterminate(error)) {
        await admin.rpc("expire_purchase", {
          p_purchase_id: reservation.purchase_id,
          p_stripe_checkout_session_id: null,
        });
      }
      throw error;
    }

    if (session.client_reference_id !== reservation.purchase_id
      || session.metadata?.purchase_id !== reservation.purchase_id
      || session.metadata?.artwork_catalog_id !== purchase.artwork_catalog_id
      || session.amount_total !== purchase.amount_cents
      || session.currency?.toUpperCase() !== purchase.currency.toUpperCase()) {
      const expired = await expireCheckout(session.id);
      if (expired) {
        await admin.rpc("expire_purchase", {
          p_purchase_id: reservation.purchase_id,
          p_stripe_checkout_session_id: null,
        });
      }
      throw new HttpError(409, "checkout_snapshot_mismatch", "Checkout does not match its reserved purchase snapshot.");
    }

    const sessionExpiresAt = new Date(session.expires_at * 1000).toISOString();
    const { data: attached, error: attachError } = await admin.rpc(
      "attach_checkout_session",
      {
        p_purchase_id: reservation.purchase_id,
        p_user_id: user.id,
        p_stripe_checkout_session_id: session.id,
        p_reservation_expires_at: sessionExpiresAt,
      },
    );

    if (attachError || !attached) {
      const { data: current } = await admin
        .from("purchases")
        .select("stripe_checkout_session_id")
        .eq("id", reservation.purchase_id)
        .single();
      if (current?.stripe_checkout_session_id !== session.id) {
        await expireCheckout(session.id);
        throw new HttpError(409, "checkout_attach_failed", "Checkout could not be attached to its reservation.");
      }
    }

    await admin.from("analytics_events").insert({
      user_id: user.id,
      artwork_id: purchase.artwork_id,
      purchase_id: reservation.purchase_id,
      event_name: "checkout_redirected",
    });
    return privateJson({
      purchaseId: reservation.purchase_id,
      checkoutUrl: session.url,
      expiresAt: sessionExpiresAt,
    });
  } catch (error) {
    return respondError(error);
  }
});
