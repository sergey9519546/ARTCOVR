import { HttpError, json, respondError } from "../_shared/errors.ts";
import { admin } from "../_shared/supabase.ts";
import {
  expireCheckout,
  retrieveCheckout,
  retrievePaymentIntent,
} from "../_shared/stripe.ts";

type ExpiredPurchase = {
  id: string;
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
};

async function expirePurchase(purchase: ExpiredPurchase) {
  const { error } = await admin.rpc("expire_purchase", {
    p_purchase_id: purchase.id,
    p_stripe_checkout_session_id: purchase.stripe_checkout_session_id,
  });
  if (error) throw new HttpError(502, "purchase_expiry_failed", "Expired purchase could not be released.");
  return "expired";
}

async function reconcile(purchase: ExpiredPurchase) {
  if (!purchase.stripe_checkout_session_id) return await expirePurchase(purchase);
  const session = await retrieveCheckout(purchase.stripe_checkout_session_id);
  if (session.id !== purchase.stripe_checkout_session_id
    || session.client_reference_id !== purchase.id
    || session.metadata?.purchase_id !== purchase.id
    || session.amount_total !== purchase.amount_cents
    || session.currency?.toUpperCase() !== purchase.currency.toUpperCase()) {
    throw new HttpError(409, "checkout_purchase_mismatch", "Expired Checkout does not match its purchase snapshot.");
  }

  if (session.payment_intent) {
    const payment = await retrievePaymentIntent(session.payment_intent);
    if (payment.metadata?.purchase_id !== purchase.id
      || payment.amount !== purchase.amount_cents
      || payment.currency.toUpperCase() !== purchase.currency.toUpperCase()) {
      throw new HttpError(409, "payment_snapshot_mismatch", "Expired payment does not match its purchase snapshot.");
    }
    const latestCharge = typeof payment.latest_charge === "object" ? payment.latest_charge : null;
    if (latestCharge?.refunded || (latestCharge && latestCharge.amount_refunded >= latestCharge.amount)) {
      const { data, error } = await admin.rpc("reconcile_full_refund", {
        p_purchase_id: purchase.id,
        p_stripe_payment_intent_id: payment.id,
      });
      if (error || !["refunded", "already_refunded", "expired_refunded", "already_expired"].includes(data)) {
        throw new HttpError(502, "refund_update_failed", "Refund reconciliation did not reach a terminal state.");
      }
      return "refunded";
    }
    if (payment.status === "succeeded" && payment.amount_received !== purchase.amount_cents) {
      throw new HttpError(409, "payment_amount_mismatch", "Succeeded payment amount does not match its purchase snapshot.");
    }
    if (payment.status === "succeeded") {
      const { data, error } = await admin.rpc("settle_purchase_paid", {
        p_purchase_id: purchase.id,
        p_stripe_checkout_session_id: session.id,
        p_stripe_payment_intent_id: payment.id,
        p_amount_cents: session.amount_total,
        p_currency: session.currency,
      });
      if (error || !["paid", "already_paid"].includes(data)) {
        throw new HttpError(409, "fulfillment_conflict", "Expired paid Checkout could not be fulfilled safely.");
      }
      return "paid";
    }
    if (["processing", "requires_action", "requires_capture", "requires_confirmation"].includes(payment.status)) {
      return "payment_pending";
    }
  }

  if (session.payment_status === "paid") {
    throw new HttpError(409, "missing_payment_intent", "Paid Checkout has no PaymentIntent to verify.");
  }

  if (session.status === "open") {
    const expired = await expireCheckout(session.id);
    if (!expired) return "expiry_race_pending";
    return await expirePurchase(purchase);
  }
  if (session.status === "expired" || session.payment_status === "unpaid") {
    return await expirePurchase(purchase);
  }
  return "pending";
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || request.headers.get("x-cron-secret") !== secret) {
      throw new HttpError(401, "unauthorized", "Scheduler authentication failed.");
    }
    const { data, error } = await admin
      .from("purchases")
      .select("id,amount_cents,currency,stripe_checkout_session_id")
      .in("status", ["reserved", "pending"])
      .lte("reservation_expires_at", new Date().toISOString())
      .order("reservation_expires_at", { ascending: true })
      .limit(5);
    if (error) throw new HttpError(502, "reservation_scan_failed", "Expired reservations could not be scanned.");

    const results = await Promise.all(((data ?? []) as ExpiredPurchase[]).map(async (row) => {
      try {
        return { purchaseId: row.id, outcome: await reconcile(row), failed: false };
      } catch (error) {
        const code = error instanceof HttpError ? error.code : "internal_error";
        console.error("Expired reservation reconciliation failed", { purchaseId: row.id, code });
        return { purchaseId: row.id, outcome: code, failed: true };
      }
    }));
    if (results.some((result) => result.failed)) {
      throw new HttpError(502, "reservation_reconciliation_failed", "One or more expired reservations require another reconciliation attempt.");
    }
    return json({ reconciled: results.map(({ purchaseId, outcome }) => ({ purchaseId, outcome })) });
  } catch (error) {
    return respondError(error);
  }
});
