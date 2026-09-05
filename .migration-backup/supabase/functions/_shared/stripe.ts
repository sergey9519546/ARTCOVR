import { HttpError } from "./errors.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const stripeApi = "https://api.stripe.com/v1";
const stripeVersion = "2026-02-25.clover";

export class StripeRequestError extends HttpError {
  constructor(
    status: number,
    code: string,
    message: string,
    public indeterminate: boolean,
  ) {
    super(status, code, message);
  }
}

export const isStripeRequestIndeterminate = (error: unknown) =>
  error instanceof StripeRequestError && error.indeterminate;

function key() {
  if (!stripeKey) throw new Error("Missing STRIPE_SECRET_KEY.");
  return stripeKey;
}

function origin() {
  const value = Deno.env.get("APP_ORIGIN");
  if (!value) throw new Error("Missing APP_ORIGIN.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN must be an absolute web origin.");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash) {
    throw new Error("APP_ORIGIN must contain only an http(s) origin.");
  }
  return parsed.origin;
}

export async function createCheckout(input: {
  purchaseId: string;
  catalogId: string;
  artworkSlug: string;
  title: string;
  amount: number;
  currency: string;
  expiresAt: string;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new HttpError(500, "invalid_checkout_amount", "The authoritative artwork price is invalid.");
  }

  const expiresAt = Math.floor(new Date(input.expiresAt).getTime() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new HttpError(500, "invalid_checkout_expiry", "The checkout reservation expiry is invalid.");
  }
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${origin()}/my-images?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin()}/checkout/${encodeURIComponent(input.artworkSlug)}`,
    client_reference_id: input.purchaseId,
    "metadata[purchase_id]": input.purchaseId,
    "metadata[artwork_catalog_id]": input.catalogId,
    "payment_intent_data[metadata][purchase_id]": input.purchaseId,
    "payment_intent_data[metadata][artwork_catalog_id]": input.catalogId,
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": input.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": input.title.slice(0, 120),
    "line_items[0][price_data][unit_amount]": String(input.amount),
    "line_items[0][quantity]": "1",
    expires_at: String(expiresAt),
  });
  const response = await stripeFetch(
    `${stripeApi}/checkout/sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `artcovr_checkout_${input.purchaseId}`,
        "Stripe-Version": stripeVersion,
      },
      body,
    },
    "checkout_create",
    true,
  );
  if (!response.ok) {
    throw await stripeResponseError(response, "stripe_checkout_failed", "Stripe could not create Checkout.");
  }
  let session: {
    id: string;
    url: string | null;
    expires_at: number;
    amount_total: number | null;
    currency: string | null;
    client_reference_id: string | null;
    metadata: Record<string, string>;
  };
  try {
    session = await response.json() as typeof session;
  } catch {
    throw new StripeRequestError(
      503,
      "stripe_checkout_indeterminate",
      "Stripe returned an unreadable Checkout response. It is safe to retry.",
      true,
    );
  }
  if (!session.url || !Number.isFinite(session.expires_at) || session.expires_at !== expiresAt) {
    throw new StripeRequestError(
      503,
      "stripe_checkout_indeterminate",
      "Stripe returned an unusable Checkout Session. It is safe to retry.",
      true,
    );
  }
  return session;
}

export async function expireCheckout(sessionId: string) {
  const response = await stripeFetch(
    `${stripeApi}/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Stripe-Version": stripeVersion,
      },
    },
    "checkout_expire",
  );
  if (!response.ok && response.status !== 400) {
    throw await stripeResponseError(response, "stripe_expiry_failed", "Stripe could not expire Checkout.");
  }
  // Stripe returns 400 when the Session changed state before this request.
  // Callers must not expire the DB reservation unless Stripe confirmed expiry.
  return response.ok;
}

export async function retrieveCheckout(sessionId: string) {
  const response = await stripeFetch(
    `${stripeApi}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${key()}`,
        "Stripe-Version": stripeVersion,
      },
    },
    "checkout_retrieve",
  );
  if (!response.ok) {
    throw await stripeResponseError(response, "stripe_session_lookup_failed", "Stripe Checkout could not be verified.");
  }
  return await response.json() as {
    id: string;
    url: string | null;
    status: string;
    payment_status: string;
    payment_intent: string | null;
    amount_total: number | null;
    currency: string | null;
    client_reference_id: string | null;
    expires_at: number;
    metadata: Record<string, string>;
  };
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  const query = new URLSearchParams({ "expand[]": "latest_charge" });
  const response = await stripeFetch(
    `${stripeApi}/payment_intents/${encodeURIComponent(paymentIntentId)}?${query}`,
    {
      headers: {
        Authorization: `Bearer ${key()}`,
        "Stripe-Version": stripeVersion,
      },
    },
    "payment_intent_retrieve",
  );
  if (!response.ok) {
    throw await stripeResponseError(response, "stripe_payment_lookup_failed", "Stripe payment could not be verified.");
  }
  return await response.json() as {
    id: string;
    status: string;
    amount: number;
    amount_received: number;
    currency: string;
    metadata: Record<string, string>;
    latest_charge: string | {
      id: string;
      refunded: boolean;
      amount: number;
      amount_refunded: number;
    } | null;
  };
}

async function stripeFetch(
  url: string,
  init: RequestInit,
  operation: string,
  indeterminateOnFailure = false,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    console.error("Stripe transport failed", {
      operation,
      timedOut: controller.signal.aborted,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw new StripeRequestError(
      503,
      indeterminateOnFailure ? "stripe_checkout_indeterminate" : "stripe_unavailable",
      "Stripe is temporarily unavailable. It is safe to retry this request.",
      indeterminateOnFailure,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function stripeResponseError(response: Response, code: string, message: string) {
  let providerCode = "unknown";
  let providerType = "unknown";
  try {
    const payload = await response.json() as {
      error?: { code?: string; type?: string };
    };
    providerCode = payload.error?.code ?? providerCode;
    providerType = payload.error?.type ?? providerType;
  } catch {
    // The stable local classification still applies to a non-JSON response.
  }
  const indeterminate = response.status === 409 || response.status === 429 || response.status >= 500;
  console.error("Stripe request rejected", {
    status: response.status,
    requestId: response.headers.get("request-id"),
    providerCode,
    providerType,
    classification: code,
  });
  return new StripeRequestError(
    indeterminate ? 503 : 502,
    indeterminate && code === "stripe_checkout_failed" ? "stripe_checkout_indeterminate" : code,
    indeterminate ? "Stripe is temporarily unavailable. It is safe to retry this request." : message,
    indeterminate,
  );
}

async function hmac(message: string) {
  if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyWebhook(rawBody: string, signature: string | null) {
  if (!signature) throw new HttpError(400, "missing_signature", "Missing Stripe-Signature.");
  const timestamp = signature.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const timestampNumber = Number(timestamp);
  const values = signature
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  if (
    !timestamp ||
    !Number.isSafeInteger(timestampNumber) ||
    values.length === 0 ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) {
    throw new HttpError(400, "invalid_signature", "Invalid Stripe signature.");
  }
  const expected = await hmac(`${timestamp}.${rawBody}`);
  const same = (left: string, right: string) => {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  };
  if (!values.some((value) => same(value, expected))) {
    throw new HttpError(400, "invalid_signature", "Invalid Stripe signature.");
  }
  try {
    return JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
  } catch {
    throw new HttpError(400, "invalid_webhook_json", "Stripe webhook payload is not valid JSON.");
  }
}
