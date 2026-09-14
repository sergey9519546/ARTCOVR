import assert from "node:assert/strict";
import test from "node:test";
import { agentImagePriceUsd } from "./agentMpp";

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
    "0.50",
  );
  assert.throws(
    () => agentImagePriceUsd(3500, { ARTCOVR_AGENT_IMAGE_PRICE_USD: "0.49" }),
    /at least 0\.50 USD/,
  );
});