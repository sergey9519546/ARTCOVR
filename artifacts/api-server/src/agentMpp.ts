import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { Mppx, stripe } from "mppx/server";

const stripeProfileEnvironment = "STRIPE_PROFILE_ID";
const mppPriceEnvironment = "ARTCOVR_AGENT_IMAGE_PRICE_USD";
const mppEnabledEnvironment = "ARTCOVR_AGENT_COMMERCE_ENABLED";

type StripeConnectionResponse = {
  items?: Array<{ settings?: { secret_key?: string } }>;
};

export type AgentMppEnvironment = Record<string, string | undefined>;

export type AgentMppReadinessState =
  | "disabled"
  | "misconfigured"
  | "unavailable"
  | "ready";

export type AgentMppReadinessReason =
  | "explicitly_disabled"
  | "profile_missing"
  | "profile_invalid"
  | "price_invalid"
  | "production_price_override"
  | "stripe_credentials_invalid"
  | "stripe_mode_mismatch"
  | "stripe_credentials_unavailable"
  | "ready";

export type AgentMppReadiness = {
  state: AgentMppReadinessState;
  reason: AgentMppReadinessReason;
  enabled: boolean;
  priceSource: "catalog";
  priceOverrideConfigured: boolean;
  stripeMode: "test" | "live" | "unknown";
  credentialSource: "explicit" | "connected" | "unavailable";
};

function isExplicitlyDisabled(env: AgentMppEnvironment) {
  return ["0", "false", "off", "disabled"].includes(
    env[mppEnabledEnvironment]?.trim().toLowerCase() ?? "",
  );
}

function isValidStripeProfileId(value: string) {
  return /^[A-Za-z0-9_-]{3,128}$/.test(value);
}

function stripeMode(secretKey: string): "test" | "live" | "unknown" {
  if (secretKey.startsWith("sk_test_")) return "test";
  if (secretKey.startsWith("sk_live_")) return "live";
  return "unknown";
}

function configuredPriceCents(env: AgentMppEnvironment = process.env) {
  const configured = env[mppPriceEnvironment]?.trim();
  if (!configured) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(configured)) {
    throw new Error(`${mppPriceEnvironment} must be a USD amount with at most two decimal places.`);
  }
  const cents = Math.round(Number(configured) * 100);
  if (!Number.isSafeInteger(cents) || cents < 50) {
    throw new Error(`${mppPriceEnvironment} must be at least 0.50 USD.`);
  }
  return cents;
}

async function stripeSecretFromConnection(env: AgentMppEnvironment = process.env) {
  const explicit = env.STRIPE_SECRET_KEY?.trim();
  if (explicit) return explicit;

  const hostname = env.REPLIT_CONNECTORS_HOSTNAME;
  const identity = env.REPL_IDENTITY
    ? `repl ${env.REPL_IDENTITY}`
    : env.WEB_REPL_RENEWAL
      ? `depl ${env.WEB_REPL_RENEWAL}`
      : null;
  if (!hostname || !identity) {
    throw new Error(
      "Stripe machine payments need STRIPE_SECRET_KEY or a connected Stripe integration.",
    );
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: identity,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Stripe credentials could not be loaded (${response.status}).`);
  }

  const body = (await response.json()) as StripeConnectionResponse;
  const secretKey = body.items?.[0]?.settings?.secret_key?.trim();
  if (!secretKey) {
    throw new Error("The connected Stripe integration did not return a secret key.");
  }
  return secretKey;
}

export async function getAgentMppReadiness(
  env: AgentMppEnvironment = process.env,
  loadSecret: (environment: AgentMppEnvironment) => Promise<string> =
    stripeSecretFromConnection,
): Promise<AgentMppReadiness> {
  const priceOverrideConfigured = Boolean(env[mppPriceEnvironment]?.trim());
  const base = {
    enabled: false,
    priceSource: "catalog" as const,
    priceOverrideConfigured,
    stripeMode: "unknown" as const,
    credentialSource: "unavailable" as const,
  };

  if (isExplicitlyDisabled(env)) {
    return {
      ...base,
      state: "disabled",
      reason: "explicitly_disabled",
    };
  }

  const profileId = env[stripeProfileEnvironment]?.trim();
  if (!profileId) {
    return {
      ...base,
      state: "disabled",
      reason: "profile_missing",
    };
  }
  if (!isValidStripeProfileId(profileId)) {
    return {
      ...base,
      state: "misconfigured",
      reason: "profile_invalid",
    };
  }

  try {
    configuredPriceCents(env);
  } catch {
    return {
      ...base,
      enabled: true,
      state: "misconfigured",
      reason: "price_invalid",
    };
  }

  if (env.NODE_ENV === "production" && priceOverrideConfigured) {
    return {
      ...base,
      enabled: true,
      state: "misconfigured",
      reason: "production_price_override",
    };
  }

  let secretKey: string;
  let credentialSource: AgentMppReadiness["credentialSource"];
  try {
    secretKey = await loadSecret(env);
    credentialSource = env.STRIPE_SECRET_KEY?.trim()
      ? "explicit"
      : "connected";
  } catch {
    return {
      ...base,
      enabled: true,
      state: "unavailable",
      reason: "stripe_credentials_unavailable",
    };
  }

  const mode = stripeMode(secretKey);
  if (mode === "unknown") {
    return {
      ...base,
      enabled: true,
      state: "misconfigured",
      reason: "stripe_credentials_invalid",
      credentialSource,
    };
  }
  if (env.NODE_ENV === "production" && mode !== "live") {
    return {
      ...base,
      enabled: true,
      state: "misconfigured",
      reason: "stripe_mode_mismatch",
      stripeMode: mode,
      credentialSource,
    };
  }

  return {
    ...base,
    enabled: true,
    state: "ready",
    reason: "ready",
    stripeMode: mode,
    credentialSource,
  };
}

async function createMpp() {
  return createAgentMpp();
}

type AgentMpp = Awaited<ReturnType<typeof createMpp>>;
let mppPromise: Promise<AgentMpp> | undefined;

export type AgentMppHooks = {
  onPaymentSuccess?: (context: any) => Promise<void> | void;
};

export async function createAgentMpp(hooks: AgentMppHooks = {}) {
  if (isExplicitlyDisabled(process.env)) {
    throw new Error("Agent commerce is explicitly disabled.");
  }
  const secretKey = await stripeSecretFromConnection();
  const networkId = process.env[stripeProfileEnvironment]?.trim();
  if (!networkId) {
    throw new Error(
      `${stripeProfileEnvironment} is required for Stripe machine payments.`,
    );
  }
  if (!isValidStripeProfileId(networkId)) {
    throw new Error(`${stripeProfileEnvironment} is invalid for Stripe machine payments.`);
  }
  const mode = stripeMode(secretKey);
  if (mode === "unknown") {
    throw new Error("Stripe machine payments require a valid Stripe secret key.");
  }
  if (process.env.NODE_ENV === "production" && mode !== "live") {
    throw new Error("Stripe machine payments require a live Stripe secret key in production.");
  }

  const client = new Stripe(secretKey);
  const machinePayments = stripe.create({
    client,
    networkId,
    livemode: !secretKey.includes("_test_"),
  });
  const spt = machinePayments.spt.charge();
  const method =
    hooks.onPaymentSuccess
      ? {
          ...spt,
          onPaymentSuccess: hooks.onPaymentSuccess,
        }
      : spt;

  const challengeSecret = createHmac("sha256", secretKey)
    .update("mpp-challenge-signing")
    .digest("base64");

  return Mppx.create({
    methods: [method],
    secretKey: challengeSecret,
  });
}

export function getAgentMpp() {
  if (!mppPromise) {
    mppPromise = createMpp().catch((error) => {
      mppPromise = undefined;
      throw error;
    });
  }
  return mppPromise;
}

export function agentImagePriceUsd(
  catalogPriceCents: number,
  env: AgentMppEnvironment = process.env,
) {
  if (!Number.isSafeInteger(catalogPriceCents) || catalogPriceCents < 50) {
    throw new Error("A licensed artwork price must be at least 0.50 USD.");
  }
  const overrideCents = configuredPriceCents(env);
  if (env.NODE_ENV === "production" && overrideCents !== undefined) {
    throw new Error(
      `${mppPriceEnvironment} is not allowed in production; use the catalog license price.`,
    );
  }
  // A non-production override may raise a catalog price for controlled tests,
  // but it can never underprice a licensed artwork.
  const cents = Math.max(catalogPriceCents, overrideCents ?? catalogPriceCents);
  return (cents / 100).toFixed(2);
}