import { ReplitConnectors } from "@replit/connectors-sdk";
import type Stripe from "stripe";

type StripeRequestOptions = {
  method?: "GET" | "POST";
  form?: URLSearchParams;
  idempotencyKey?: string;
};

export class StripeProxyError extends Error {
  readonly status: number;
  readonly stripeCode?: string;

  constructor(status: number, message: string, stripeCode?: string) {
    super(message);
    this.name = "StripeProxyError";
    this.status = status;
    this.stripeCode = stripeCode;
  }
}

async function stripeRequest<T>(
  path: string,
  options: StripeRequestOptions = {},
): Promise<T> {
  const connectors = new ReplitConnectors();
  const headers = new Headers({ Accept: "application/json" });
  if (options.form) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    headers,
    body: options.form?.toString(),
  });
  const payload = (await response.json()) as {
    error?: { message?: string; code?: string };
  } & T;

  if (!response.ok) {
    throw new StripeProxyError(
      response.status,
      payload.error?.message ?? "Stripe request failed.",
      payload.error?.code,
    );
  }

  return payload;
}

export async function listStripeProducts() {
  const products: Stripe.Product[] = [];
  let startingAfter: string | undefined;

  do {
    const search = new URLSearchParams({ active: "true", limit: "100" });
    if (startingAfter) search.set("starting_after", startingAfter);
    const page = await stripeRequest<Stripe.ApiList<Stripe.Product>>(
      `/v1/products?${search.toString()}`,
    );
    products.push(...page.data);
    startingAfter =
      page.has_more && page.data.length
        ? page.data[page.data.length - 1]?.id
        : undefined;
  } while (startingAfter);

  return products;
}

export async function createStripeProduct(input: {
  name: string;
  description: string;
  metadata: Record<string, string>;
}) {
  const form = new URLSearchParams({
    name: input.name,
    description: input.description,
  });
  for (const [key, value] of Object.entries(input.metadata)) {
    form.set(`metadata[${key}]`, value);
  }
  return stripeRequest<Stripe.Product>("/v1/products", {
    method: "POST",
    form,
  });
}

export async function updateStripeProduct(
  productId: string,
  input: { defaultPrice: string },
) {
  return stripeRequest<Stripe.Product>(
    `/v1/products/${encodeURIComponent(productId)}`,
    {
      method: "POST",
      form: new URLSearchParams({ default_price: input.defaultPrice }),
    },
  );
}

export async function listStripePrices(productId: string) {
  const query = new URLSearchParams({
    product: productId,
    active: "true",
    type: "one_time",
    limit: "100",
  });
  const page = await stripeRequest<Stripe.ApiList<Stripe.Price>>(
    `/v1/prices?${query.toString()}`,
  );
  return page.data;
}

export async function createStripePrice(input: {
  productId: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
}) {
  const form = new URLSearchParams({
    product: input.productId,
    unit_amount: String(input.amountCents),
    currency: input.currency,
  });
  for (const [key, value] of Object.entries(input.metadata)) {
    form.set(`metadata[${key}]`, value);
  }
  return stripeRequest<Stripe.Price>("/v1/prices", {
    method: "POST",
    form,
  });
}

export async function retrieveCheckoutSession(sessionId: string) {
  return stripeRequest<Stripe.Checkout.Session>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function createCheckoutSession(
  input: {
    orderId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  },
  idempotencyKey: string,
) {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    customer_creation: "always",
    allow_promotion_codes: "false",
    client_reference_id: input.orderId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  for (const [key, value] of Object.entries(input.metadata)) {
    form.set(`metadata[${key}]`, value);
  }
  return stripeRequest<Stripe.Checkout.Session>("/v1/checkout/sessions", {
    method: "POST",
    form,
    idempotencyKey,
  });
}

export async function retrieveStripeEvent(eventId: string) {
  return stripeRequest<Stripe.Event>(
    `/v1/events/${encodeURIComponent(eventId)}`,
  );
}

export async function ensureStripeWebhook(url: string) {
  const page = await stripeRequest<Stripe.ApiList<Stripe.WebhookEndpoint>>(
    "/v1/webhook_endpoints?limit=100",
  );
  if (page.data.some((endpoint) => endpoint.url === url && endpoint.status === "enabled")) {
    return;
  }

  const form = new URLSearchParams({ url });
  form.append("enabled_events[]", "checkout.session.completed");
  form.append("enabled_events[]", "checkout.session.async_payment_succeeded");
  await stripeRequest<Stripe.WebhookEndpoint>("/v1/webhook_endpoints", {
    method: "POST",
    form,
  });
}