import assert from "node:assert/strict";
import test from "node:test";
import {
  agentImagePriceUsd,
  getAgentMppReadiness,
  type AgentMppEnvironment,
} from "./agentMpp";

test("agent image payments use the catalog license price by default", () => {
  assert.equal(agentImagePriceUsd(3500, {}), "35.00");
});

test("agent image payments reject prices below the MPP card minimum", () => {
  assert.throws(
    () => agentImagePriceUsd(49, {}),
    /at least 0\.50 USD/,
  );
});

test("agent image payment price can be overridden for controlled environments", () => {
  assert.equal(
    agentImagePriceUsd(3500, { ARTCOVR_AGENT_IMAGE_PRICE_USD: "0.50" }),
    "35.00",
  );
  assert.throws(
    () => agentImagePriceUsd(3500, { ARTCOVR_AGENT_IMAGE_PRICE_USD: "0.49" }),
    /at least 0\.50 USD/,
  );
});

const readyTestEnvironment: AgentMppEnvironment = {
  NODE_ENV: "development",
  STRIPE_PROFILE_ID: "profile_test_agent_mpp",
  STRIPE_SECRET_KEY: "sk_test_agent_mpp",
};

test("MPP readiness treats missing profile configuration as disabled", async () => {
  assert.deepEqual(
    await getAgentMppReadiness(
      { NODE_ENV: "production" },
      async () => "sk_live_should_not_be_used",
    ),
    {
      state: "disabled",
      reason: "profile_missing",
      enabled: false,
      priceSource: "catalog",
      priceOverrideConfigured: false,
      stripeMode: "unknown",
      credentialSource: "unavailable",
    },
  );
});

test("MPP readiness distinguishes explicit disablement from invalid configuration", async () => {
  const disabled = await getAgentMppReadiness({
    ...readyTestEnvironment,
    ARTCOVR_AGENT_COMMERCE_ENABLED: "false",
  });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.reason, "explicitly_disabled");

  const invalidPrice = await getAgentMppReadiness({
    ...readyTestEnvironment,
    ARTCOVR_AGENT_IMAGE_PRICE_USD: "0.499",
  });
  assert.equal(invalidPrice.state, "misconfigured");
  assert.equal(invalidPrice.reason, "price_invalid");
});

test("MPP readiness reports credential failures without revealing credential values", async () => {
  const unavailable = await getAgentMppReadiness(
    { ...readyTestEnvironment, STRIPE_SECRET_KEY: undefined },
    async () => {
      throw new Error("connector unavailable: sk_live_private_value");
    },
  );
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.reason, "stripe_credentials_unavailable");

  const invalid = await getAgentMppReadiness(
    readyTestEnvironment,
    async () => "not-a-stripe-secret",
  );
  assert.equal(invalid.state, "misconfigured");
  assert.equal(invalid.reason, "stripe_credentials_invalid");
});

test("production MPP readiness requires live credentials and catalog pricing", async () => {
  const testMode = await getAgentMppReadiness(
    {
      ...readyTestEnvironment,
      NODE_ENV: "production",
    },
    async () => "sk_test_agent_mpp",
  );
  assert.equal(testMode.reason, "stripe_mode_mismatch");

  const priceOverride = await getAgentMppReadiness(
    {
      ...readyTestEnvironment,
      NODE_ENV: "production",
      ARTCOVR_AGENT_IMAGE_PRICE_USD: "50.00",
    },
    async () => "sk_live_agent_mpp",
  );
  assert.equal(priceOverride.reason, "production_price_override");

  const ready = await getAgentMppReadiness(
    { ...readyTestEnvironment, NODE_ENV: "production" },
    async () => "sk_live_agent_mpp",
  );
  assert.equal(ready.state, "ready");
  assert.equal(ready.stripeMode, "live");
});