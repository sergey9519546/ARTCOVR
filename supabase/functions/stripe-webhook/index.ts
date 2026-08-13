import { HttpError, json, respondError } from "../_shared/errors.ts";
import { admin } from "../_shared/supabase.ts";
import {
  retrieveCheckout,
  retrievePaymentIntent,
  verifyWebhook,
} from "../_shared/stripe.ts";

type PurchaseSnapshot = {
  id: string;
  status: "reserved" | "pending" | "paid" | "expired" | "refunded";
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
};

async function getPurchaseById(id: string): Promise<PurchaseSnapshot | null> {
  const { data, error } = await admin
    .from("purchases")
    .select("id,status,amount_cents,currency,stripe_checkout_session_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HttpError(502, "purchase_lookup_failed", "Purchase snapshot could not be read.");
  return data as PurchaseSnapshot | null;
}

async function expirePurchase(purchase: PurchaseSnapshot) {
  const { error } = await admin.rpc("expire_purchase", {
    p_purchase_id: purchase.id,
    p_stripe_checkout_session_id: purchase.stripe_checkout_session_id,
  });
  if (error) throw new HttpError(502, "purchase_expiry_failed", "Purchase reservation could not be expired.");
}

Deno.serve(async (request) => {
  let persistedEventId: string | null = null;
  try {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const raw = await request.text();
    const event = await verifyWebhook(raw, request.headers.get("stripe-signature"));
    const objectId = typeof event.data.object.id === "string"
      ? event.data.object.id
      : null;
    const { error: insertError } = await admin.from("stripe_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      // Idempotency does not require retaining Stripe's customer-bearing event
      // object. Keep only a non-secret troubleshooting identity.
      payload: { object_id: objectId },
    });
    const duplicate = insertError?.code === "23505";
    persistedEventId = event.id;
    if (duplicate) {
      const { data: prior } = await admin
        .from("stripe_events")
        .select("processed_at")
        .eq("stripe_event_id", event.id)
        .single();
      if (prior?.processed_at) return json({ received: true, duplicate: true });
    }
    if (insertError && !duplicate) {
      throw new HttpError(502, "event_persist_failed", "Stripe event could not be persisted.");
    }

    const supported = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
      "charge.dispute.created",
    ]);
    if (!supported.has(event.type)) {
      await markProcessed(event.id);
      return json({ received: true, ignored: true });
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as {
        id?: string;
        payment_intent?: string | null;
      };
      if (!dispute.id || !dispute.payment_intent) {
        throw new HttpError(400, "dispute_payment_missing", "Stripe dispute is missing its PaymentIntent.");
      }
      const payment = await retrievePaymentIntent(dispute.payment_intent);
      const { data: purchaseRow, error: lookupError } = await admin
        .from("purchases")
        .select("id,status,amount_cents,currency,stripe_checkout_session_id")
        .eq("stripe_payment_intent_id", payment.id)
        .maybeSingle();
      if (lookupError) {
        throw new HttpError(502, "dispute_purchase_lookup_failed", "The disputed purchase could not be verified.");
      }
      const purchase = purchaseRow as PurchaseSnapshot | null;
      if (!purchase || payment.metadata?.purchase_id !== purchase.id
        || payment.amount !== purchase.amount_cents
        || payment.currency.toUpperCase() !== purchase.currency.toUpperCase()) {
        throw new HttpError(409, "dispute_purchase_mismatch", "Disputed payment does not match a purchase snapshot.");
      }
      const { data: revoked, error: revokeError } = await admin.rpc("revoke_purchase_access", {
        p_purchase_id: purchase.id,
        p_stripe_payment_intent_id: payment.id,
        p_reason: "payment_dispute",
      });
      if (revokeError || !["revoked", "already_revoked"].includes(revoked)) {
        throw new HttpError(502, "dispute_revocation_failed", "Disputed purchase access could not be revoked.");
      }
      await markProcessed(event.id);
      return json({ received: true, accessRevoked: true });
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as {
        payment_intent?: string | null;
        refunded?: boolean;
      };
      if (!charge.refunded) {
        await markProcessed(event.id);
        return json({ received: true, ignored: true, reason: "partial_refund" });
      }
      if (charge.payment_intent) {
        const payment = await retrievePaymentIntent(charge.payment_intent);
        if (payment.id !== charge.payment_intent) {
          throw new HttpError(409, "refund_payment_mismatch", "Refunded charge does not match the canonical PaymentIntent.");
        }
        let purchase: PurchaseSnapshot | null = null;
        const { data: byPaymentIntent, error } = await admin
          .from("purchases")
          .select("id,status,amount_cents,currency,stripe_checkout_session_id")
          .eq("stripe_payment_intent_id", charge.payment_intent)
          .maybeSingle();
        if (error) throw new HttpError(502, "refund_purchase_lookup_failed", "Refunded purchase could not be read.");
        purchase = byPaymentIntent as PurchaseSnapshot | null;
        if (!purchase && payment.metadata?.purchase_id) {
          purchase = await getPurchaseById(payment.metadata.purchase_id);
        }
        if (!purchase) {
          throw new HttpError(409, "refund_purchase_not_found", "Refunded payment has no matching purchase snapshot.");
        }
        if (payment.metadata?.purchase_id !== purchase.id
          || payment.amount !== purchase.amount_cents
          || payment.currency.toUpperCase() !== purchase.currency.toUpperCase()) {
          throw new HttpError(409, "refund_purchase_mismatch", "Refunded payment does not match the purchase snapshot.");
        }
        const { data, error: refundError } = await admin.rpc("reconcile_full_refund", {
          p_purchase_id: purchase.id,
          p_stripe_payment_intent_id: payment.id,
        });
        if (refundError || !["refunded", "already_refunded", "expired_refunded", "already_expired"].includes(data)) {
          throw new HttpError(502, "refund_update_failed", "Refund reconciliation did not reach a terminal state.");
        }
      } else {
        throw new HttpError(400, "refund_payment_missing", "Refunded charge is missing its PaymentIntent.");
      }
      await markProcessed(event.id);
      return json({ received: true });
    }

    const eventSession = event.data.object as {
      id?: string;
      metadata?: { purchase_id?: string };
    };
    if (!eventSession.id) {
      throw new HttpError(400, "missing_checkout_id", "Checkout event is missing its Session ID.");
    }

    const canonical = await retrieveCheckout(eventSession.id);
    const purchaseId = canonical.metadata?.purchase_id;
    if (!purchaseId || (eventSession.metadata?.purchase_id && eventSession.metadata.purchase_id !== purchaseId)) {
      throw new HttpError(400, "missing_purchase_metadata", "Checkout metadata is missing or inconsistent.");
    }
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase
      || purchase.stripe_checkout_session_id !== canonical.id
      || canonical.client_reference_id !== purchase.id) {
      throw new HttpError(409, "checkout_purchase_mismatch", "Checkout Session does not belong to this purchase.");
    }
    if (canonical.amount_total !== purchase.amount_cents
      || canonical.currency?.toUpperCase() !== purchase.currency.toUpperCase()) {
      throw new HttpError(409, "checkout_amount_mismatch", "Checkout amount or currency does not match the purchase snapshot.");
    }

    if (
      (event.type === "checkout.session.completed"
        || event.type === "checkout.session.async_payment_succeeded")
      && canonical.payment_status === "paid"
    ) {
      if (!canonical.payment_intent) {
        throw new HttpError(409, "missing_payment_intent", "Paid Checkout Session has no PaymentIntent.");
      }
      const payment = await retrievePaymentIntent(canonical.payment_intent);
      if (payment.metadata?.purchase_id !== purchase.id
        || payment.amount !== purchase.amount_cents
        || payment.amount_received !== purchase.amount_cents
        || payment.currency.toUpperCase() !== purchase.currency.toUpperCase()) {
        throw new HttpError(409, "payment_snapshot_mismatch", "PaymentIntent does not match the purchase snapshot.");
      }
      const latestCharge = typeof payment.latest_charge === "object" ? payment.latest_charge : null;
      if (latestCharge?.refunded || (latestCharge && latestCharge.amount_refunded >= latestCharge.amount)) {
        const { data, error: refundError } = await admin.rpc("reconcile_full_refund", {
          p_purchase_id: purchase.id,
          p_stripe_payment_intent_id: payment.id,
        });
        if (refundError || !["refunded", "already_refunded", "expired_refunded", "already_expired"].includes(data)) {
          throw new HttpError(502, "refund_update_failed", "Refund reconciliation did not reach a terminal state.");
        }
        await markProcessed(event.id);
        return json({ received: true, fulfilled: false, reason: "payment_refunded" });
      }
      const { data, error } = await admin.rpc("settle_purchase_paid", {
        p_purchase_id: purchase.id,
        p_stripe_checkout_session_id: canonical.id,
        p_stripe_payment_intent_id: canonical.payment_intent,
        p_amount_cents: canonical.amount_total,
        p_currency: canonical.currency,
      });
      if (error || !["paid", "already_paid"].includes(data)) {
        throw new HttpError(409, "fulfillment_conflict", "Purchase settlement did not reach a paid state.");
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      await expirePurchase(purchase);
    } else if (event.type === "checkout.session.expired" && canonical.status === "expired") {
      await expirePurchase(purchase);
    }

    await markProcessed(event.id);
    return json({ received: true });
  } catch (error) {
    // The event row remains unprocessed, so Stripe retries are safe and useful.
    if (persistedEventId) await markFailed(persistedEventId, error);
    return respondError(error);
  }
});

async function markProcessed(eventId: string) {
  const { error } = await admin
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString(), processing_error: null })
    .eq("stripe_event_id", eventId);
  if (error) throw new HttpError(502, "event_update_failed", "Stripe event completion could not be recorded.");
}

async function markFailed(eventId: string, failure: unknown) {
  const classification = failure instanceof HttpError ? failure.code : "internal_error";
  const { error } = await admin
    .from("stripe_events")
    .update({ processing_error: classification.slice(0, 120) })
    .eq("stripe_event_id", eventId)
    .is("processed_at", null);
  if (error) console.error("Stripe event failure classification could not be stored", { eventId });
}
