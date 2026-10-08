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

export class StripeConnectionModeError extends Error {
  readonly code:
    | "stripe_connection_mode_mismatch"
    | "stripe_connection_mode_unverified";
  readonly expectedLivemode: boolean;
  readonly actualLivemode: boolean | undefined;

  constructor(expectedLivemode: boolean, actualLivemode?: boolean) {
    const expectedMode = expectedLivemode ? "live" : "test";
    const actualMode =
      actualLivemode === undefined
        ? "unknown"
        : actualLivemode
          ? "live"
          : "test";
    super(`Stripe connection mode is ${actualMode}; expected ${expectedMode}.`);
    this.name = "StripeConnectionModeError";
    this.code =
      actualLivemode === undefined
        ? "stripe_connection_mode_unverified"
        : "stripe_connection_mode_mismatch";
    this.expectedLivemode = expectedLivemode;
    this.actualLivemode = actualLivemode;
  }
}

export function expectedStripeLivemode(
  env: Record<string, string | undefined> = process.env,
) {
  // NODE_ENV describes the requested application mode. REPLIT_ENVIRONMENT is
  // the connector binding used when NODE_ENV is omitted by an artifact
  // workflow.
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return false;
  return (
    env.NODE_ENV === "production" ||
    env.REPLIT_ENVIRONMENT === "production"
  );
}

export function assertStripeConnectionEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  const configuredEnvironment = env.REPLIT_ENVIRONMENT;
  const requestedEnvironment =
    env.NODE_ENV === "production"
      ? "production"
      : env.NODE_ENV === "development" || env.NODE_ENV === "test"
        ? "development"
        : undefined;

  if (
    requestedEnvironment &&
    configuredEnvironment &&
    configuredEnvironment !== requestedEnvironment
  ) {
    throw new Error(
      `Stripe connection environment "${configuredEnvironment}" does not match requested runtime environment "${requestedEnvironment}".`,
    );
  }
}

export class StripeCheckoutModeError extends Error {
  readonly code = "stripe_checkout_mode_mismatch";
  readonly sessionId: string;
  readonly expectedLivemode: boolean;
  readonly actualLivemode: boolean;

  constructor(
    session: Pick<Stripe.Checkout.Session, "id" | "livemode">,
    expectedLivemode: boolean,
  ) {
    const expectedMode = expectedLivemode ? "live" : "test";
    const actualMode = session.livemode ? "live" : "test";
    super(
      `Stripe checkout session ${session.id} is in ${actualMode} mode; expected ${expectedMode} mode.`,
    );
    this.name = "StripeCheckoutModeError";
    this.sessionId = session.id;
    this.expectedLivemode = expectedLivemode;
    this.actualLivemode = session.livemode;
  }
}

export function validateCheckoutSessionMode(
  session: Stripe.Checkout.Session,
  expectedLivemode = expectedStripeLivemode(),
) {
  if (session.livemode !== expectedLivemode) {
    throw new StripeCheckoutModeError(session, expectedLivemode);
  }
  return session;
}

let verifiedStripeProxyLivemode: boolean | undefined;
let stripeProxyModeVerification: Promise<void> | undefined;

export async function assertStripeProxyMode() {
  const expectedLivemode = expectedStripeLivemode();

  if (stripeProxyModeVerification) {
    await stripeProxyModeVerification;
    if (verifiedStripeProxyLivemode !== expectedLivemode) {
      throw new StripeConnectionModeError(
        expectedLivemode,
        verifiedStripeProxyLivemode,
      );
    }
    return;
  }

  const verification = (async () => {
    const page = await stripeRequest<Stripe.ApiList<Stripe.Price>>(
      "/v1/prices?limit=1",
    );
    const modes = new Set(
      page.data
        .map((price) => price.livemode)
        .filter((livemode): livemode is boolean => typeof livemode === "boolean"),
    );
    if (modes.size !== 1) {
      throw new StripeConnectionModeError(expectedLivemode);
    }

    const actualLivemode = [...modes][0];
    if (actualLivemode !== expectedLivemode) {
      throw new StripeConnectionModeError(expectedLivemode, actualLivemode);
    }
    verifiedStripeProxyLivemode = actualLivemode;
  })();
  stripeProxyModeVerification = verification;
  try {
    await verification;
  } finally {
    if (stripeProxyModeVerification === verification) {
      stripeProxyModeVerification = undefined;
    }
  }
}

async function stripeRequest<T>(
  path: string,
  options: StripeRequestOptions = {},
): Promise<T> {
  if ((options.method ?? "GET") === "POST") {
    await assertStripeProxyMode();
  }

  const connectors = new ReplitConnectors();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
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

export async function listStripeProducts(
  options: { active?: boolean } = { active: true },
) {
  const products: Stripe.Product[] = [];
  let startingAfter: string | undefined;

  do {
    const search = new URLSearchParams({ limit: "100" });
    if (options.active !== undefined) {
      search.set("active", String(options.active));
    }
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

export async function createStripeProduct(
  input: {
    name: string;
    description: string;
    metadata: Record<string, string>;
  },
  idempotencyKey?: string,
) {
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
    idempotencyKey,
  });
}

export async function updateStripeProduct(
  productId: string,
  input: { defaultPrice?: string | null; active?: boolean },
  idempotencyKey?: string,
) {
  const form = new URLSearchParams();
  if (input.defaultPrice !== undefined) {
    // Stripe uses an empty value to remove a product's default price.
    form.set("default_price", input.defaultPrice ?? "");
  }
  if (input.active !== undefined) form.set("active", String(input.active));
  return stripeRequest<Stripe.Product>(
    `/v1/products/${encodeURIComponent(productId)}`,
    {
      method: "POST",
      form,
      idempotencyKey,
    },
  );
}

export async function listStripePrices(
  productId: string,
  options: { active?: boolean; type?: "one_time" } = {
    active: true,
    type: "one_time",
  },
) {
  const prices: Stripe.Price[] = [];
  let startingAfter: string | undefined;

  do {
    const query = new URLSearchParams({ product: productId, limit: "100" });
    if (options.active !== undefined) {
      query.set("active", String(options.active));
    }
    if (options.type) query.set("type", options.type);
    if (startingAfter) query.set("starting_after", startingAfter);
    const page = await stripeRequest<Stripe.ApiList<Stripe.Price>>(
      `/v1/prices?${query.toString()}`,
    );
    prices.push(...page.data);
    startingAfter =
      page.has_more && page.data.length
        ? page.data[page.data.length - 1]?.id
        : undefined;
  } while (startingAfter);

  return prices;
}

export async function deactivateStripeProduct(
  productId: string,
  idempotencyKey?: string,
) {
  return updateStripeProduct(productId, { active: false }, idempotencyKey);
}

export async function deactivateStripePrice(
  priceId: string,
  idempotencyKey?: string,
) {
  return stripeRequest<Stripe.Price>(
    `/v1/prices/${encodeURIComponent(priceId)}`,
    {
      method: "POST",
      form: new URLSearchParams({ active: "false" }),
      idempotencyKey,
    },
  );
}

function appendExpand(search: URLSearchParams, value: string) {
  search.append("expand[]", value);
}

export async function listStripeCheckoutSessions(
  requestPage: (
    path: string,
  ) => Promise<Stripe.ApiList<Stripe.Checkout.Session>> = (path) =>
    stripeRequest<Stripe.ApiList<Stripe.Checkout.Session>>(path),
) {
  const sessions: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;

  do {
    const search = new URLSearchParams({ limit: "100" });
    appendExpand(search, "data.line_items.data.price");
    if (startingAfter) search.set("starting_after", startingAfter);
    const page = await requestPage(
      `/v1/checkout/sessions?${search.toString()}`,
    );
    sessions.push(...page.data);
    startingAfter =
      page.has_more && page.data.length
        ? page.data[page.data.length - 1]?.id
        : undefined;
  } while (startingAfter);

  return sessions;
}

export async function listStripePaymentLinks() {
  const paymentLinks: Stripe.PaymentLink[] = [];
  let startingAfter: string | undefined;

  do {
    const search = new URLSearchParams({ limit: "100" });
    appendExpand(search, "data.line_items.data.price");
    if (startingAfter) search.set("starting_after", startingAfter);
    const page = await stripeRequest<Stripe.ApiList<Stripe.PaymentLink>>(
      `/v1/payment_links?${search.toString()}`,
    );
    paymentLinks.push(...page.data);
    startingAfter =
      page.has_more && page.data.length
        ? page.data[page.data.length - 1]?.id
        : undefined;
  } while (startingAfter);

  return paymentLinks;
}

export async function createStripePrice(
  input: {
    productId: string;
    amountCents: number;
    currency: string;
    metadata: Record<string, string>;
  },
  idempotencyKey?: string,
) {
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
    idempotencyKey,
  });
}

export async function retrieveCheckoutSession(sessionId: string) {
  return stripeRequest<Stripe.Checkout.Session>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}

// Resolve even older sessions that have no PaymentIntent metadata.
export async function retrieveCheckoutSessionForPaymentIntent(
  paymentIntentId: string,
  requestPage: (path: string) => Promise<Stripe.ApiList<Stripe.Checkout.Session>> = (path) =>
    stripeRequest<Stripe.ApiList<Stripe.Checkout.Session>>(path),
) {
  const query = new URLSearchParams({ payment_intent: paymentIntentId, limit: "2" });
  const page = await requestPage(`/v1/checkout/sessions?${query.toString()}`);
  if (page.has_more || page.data.length > 1) {
    throw new Error("Ambiguous Checkout session association for refunded payment");
  }
  return page.data[0] ?? null;
}

export async function createCheckoutSession(
  input: {
    orderId: string;
    priceId: string;
    quantity?: number;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
    metadata: Record<string, string>;
    customerEmail?: string;
  },
  idempotencyKey: string,
) {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": String(input.quantity ?? 1),
    customer_creation: "always",
    allow_promotion_codes: "false",
    client_reference_id: input.orderId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: String(Math.floor(input.expiresAt.getTime() / 1000)),
  });
  if (input.customerEmail) {
    form.set("customer_email", input.customerEmail);
  }
  for (const [key, value] of Object.entries(input.metadata)) {
    form.set(`metadata[${key}]`, value);
  }
  const session = await stripeRequest<Stripe.Checkout.Session>(
    "/v1/checkout/sessions",
    {
      method: "POST",
      form,
      idempotencyKey,
    },
  );
  try {
    return validateCheckoutSessionMode(session);
  } catch (error) {
    if (error instanceof StripeCheckoutModeError && session.status === "open") {
      try {
        await expireCheckoutSession(session.id);
      } catch (expirationError) {
        throw new Error(
          `${error.message} The mismatched open session could not be expired; resolve it in Stripe before rerunning.`,
          { cause: expirationError },
        );
      }
    }
    throw error;
  }
}

export async function refundPaymentIntent(
  input: {
    paymentIntentId: string;
    orderId: string;
  },
  idempotencyKey: string,
) {
  const form = new URLSearchParams({
    payment_intent: input.paymentIntentId,
    "metadata[order_id]": input.orderId,
    "metadata[reason]": "exclusive_inventory_conflict",
  });
  return stripeRequest<Stripe.Refund>("/v1/refunds", {
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

export async function listStripeEvents(
  options: {
    type?: Stripe.Event.Type;
    createdAfter?: Date;
  } = {},
) {
  const events: Stripe.Event[] = [];
  let startingAfter: string | undefined;

  do {
    const search = new URLSearchParams({ limit: "100" });
    if (options.type) search.set("type", options.type);
    if (options.createdAfter) {
      search.set(
        "created[gte]",
        String(Math.floor(options.createdAfter.getTime() / 1000)),
      );
    }
    if (startingAfter) search.set("starting_after", startingAfter);
    const page = await stripeRequest<Stripe.ApiList<Stripe.Event>>(
      `/v1/events?${search.toString()}`,
    );
    events.push(...page.data);
    startingAfter =
      page.has_more && page.data.length
        ? page.data[page.data.length - 1]?.id
        : undefined;
  } while (startingAfter);

  return events;
}

export async function expireCheckoutSession(sessionId: string) {
  return stripeRequest<Stripe.Checkout.Session>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    { method: "POST" },
  );
}

export async function ensureStripeWebhook(url: string) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password || target.pathname !== "/api/stripe/webhook" || target.search || target.hash) {
    throw new Error("Stripe webhook target must be an HTTPS webhook URL without credentials or query parameters.");
  }
  if (expectedStripeLivemode() && !["artcovr.com", "artcovr.replit.app"].includes(target.hostname)) {
    throw new Error("Live Stripe webhooks may only target ARTCOVR production domains; preview registration is blocked.");
  }
  await assertStripeProxyMode();
  const page = await stripeRequest<Stripe.ApiList<Stripe.WebhookEndpoint>>(
    "/v1/webhook_endpoints?limit=100",
  );
  const requiredEvents = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.expired",
    "charge.refunded",
    "payment_intent.payment_failed",
  ] as const;
  const matching = page.data.filter((endpoint) => endpoint.url === url);
  if (page.data.some((endpoint) => endpoint.livemode !== expectedStripeLivemode())) {
    throw new Error("Stripe webhook connection mode does not match the requested application environment.");
  }
  const existing = matching.find((endpoint) => endpoint.status === "enabled");
  if (!existing && matching.length > 0) {
    throw new Error("The ARTCOVR Stripe webhook is disabled. Restore the existing endpoint deliberately; automatic duplicate creation is blocked.");
  }
  if (page.has_more) {
    throw new Error("Stripe webhook inventory is incomplete; refusing automatic endpoint changes.");
  }
  if (
    existing &&
    (existing.enabled_events.includes("*") ||
      requiredEvents.every((event) => existing.enabled_events.includes(event)))
  ) {
    return;
  }

  const form = new URLSearchParams();
  if (!existing) form.set("url", url);
  for (const event of requiredEvents) {
    form.append("enabled_events[]", event);
  }
  await stripeRequest<Stripe.WebhookEndpoint>(
    existing
      ? `/v1/webhook_endpoints/${encodeURIComponent(existing.id)}`
      : "/v1/webhook_endpoints",
    {
      method: "POST",
      form,
    },
  );
}
