import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { Mppx, stripe } from "mppx/server";

const stripeProfileEnvironment = "STRIPE_PROFILE_ID";
const mppPriceEnvironment = "ARTCOVR_AGENT_IMAGE_PRICE_USD";

type StripeConnectionResponse = {
  items?: Array<{ settings?: { secret_key?: string } }>;
};

function configuredPrice(env: Record<string, string | undefined> = process.env) {
  const configured = env[mppPriceEnvironment]?.trim() || "0.50";
  if (!/^\d+(?:\.\d{1,2})?$/.test(configured)) {
    throw new Error(`${mppPriceEnvironment} must be a USD amount with at most two decimal places.`);
  }
  const cents = Math.round(Number(configured) * 100);
  if (!Number.isSafeInteger(cents) || cents < 50) {
    throw new Error(`${mppPriceEnvironment} must be at least 0.50 USD.`);
  }
  return (cents / 100).toFixed(2);
}

async function stripeSecretFromConnection() {
  const explicit = process.env.STRIPE_SECRET_KEY?.trim();
  if (explicit) return explicit;

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const identity = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
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

async function createMpp() {
  return createAgentMpp();
}

type AgentMpp = Awaited<ReturnType<typeof createMpp>>;
let mppPromise: Promise<AgentMpp> | undefined;

export type AgentMppHooks = {
  onPaymentSuccess?: (context: any) => Promise<void> | void;
};

export async function createAgentMpp(hooks: AgentMppHooks = {}) {
  const secretKey = await stripeSecretFromConnection();
  const networkId = process.env[stripeProfileEnvironment]?.trim();
  if (!networkId) {
    throw new Error(
      `${stripeProfileEnvironment} is required for Stripe machine payments.`,
    );
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
  env: Record<string, string | undefined> = process.env,
) {
  const configured = env[mppPriceEnvironment]?.trim();
  if (!configured) {
    if (!Number.isSafeInteger(catalogPriceCents) || catalogPriceCents < 50) {
      throw new Error("A licensed artwork price must be at least 0.50 USD.");
    }
    return (catalogPriceCents / 100).toFixed(2);
  }
  return configuredPrice(env);
}