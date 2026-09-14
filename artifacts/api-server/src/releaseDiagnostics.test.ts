import assert from "node:assert/strict";
import test from "node:test";
import { getReleaseDiagnostics } from "./releaseDiagnostics";

test("release diagnostics expose disabled MPP state without degrading storefront health", async () => {
  const diagnostics = await getReleaseDiagnostics({
    NODE_ENV: "production",
    ARTCOVR_AGENT_COMMERCE_ENABLED: "false",
    STRIPE_PROFILE_ID: "profile_private_value",
    STRIPE_SECRET_KEY: "sk_live_private_value",
  });

  assert.equal(diagnostics.status, "ok");
  assert.deepEqual(diagnostics.agentCommerce, {
    state: "disabled",
    reason: "explicitly_disabled",
    enabled: false,
    priceSource: "catalog",
    priceOverrideConfigured: false,
    stripeMode: "unknown",
    credentialSource: "unavailable",
    operational: {
      counts: {
        challenge_issued: 0,
        payment_verified: 0,
        payment_failed: 0,
        replay_rejected: 0,
        delivery_succeeded: 0,
        delivery_failed: 0,
        refund_completed: 0,
        refund_pending: 0,
      },
      pendingRefunds: 0,
      lastEventAt: null,
    },
  });

  const serialized = JSON.stringify(diagnostics);
  assert.doesNotMatch(serialized, /private_value|sk_live_|profile_/);
});

test("release diagnostics distinguish a ready test-mode MPP configuration", async () => {
  const diagnostics = await getReleaseDiagnostics(
    {
      NODE_ENV: "development",
      STRIPE_PROFILE_ID: "profile_test_agent_mpp",
      STRIPE_SECRET_KEY: "sk_test_agent_mpp",
    },
    async () => "sk_test_agent_mpp",
  );

  assert.equal(diagnostics.status, "ok");
  assert.equal(diagnostics.agentCommerce.state, "ready");
  assert.equal(diagnostics.agentCommerce.stripeMode, "test");
  assert.equal(diagnostics.agentCommerce.credentialSource, "explicit");
});