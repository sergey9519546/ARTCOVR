import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionEnvironment } from "./runtimeConfig";

const requiredProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://example",
  CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
  ARTCOVR_PUBLIC_ORIGIN: "https://artcovr.com",
  ARTCOVR_STOREFRONT_ORIGINS: "https://artcovr.com",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
};

test("development configuration does not require production variables", () => {
  assert.doesNotThrow(() =>
    validateProductionEnvironment({ NODE_ENV: "development" }),
  );
});

test("production configuration rejects missing variables", () => {
  assert.throws(
    () => validateProductionEnvironment({ NODE_ENV: "production" }),
    /Production runtime configuration is incomplete/,
  );
});

test("production configuration rejects development Clerk keys", () => {
  assert.throws(
    () =>
      validateProductionEnvironment({
        ...requiredProductionEnvironment,
        CLERK_PUBLISHABLE_KEY: "pk_test_example",
      }),
    /cannot use a development Clerk publishable key/,
  );
});

test("production configuration accepts complete live credentials", () => {
  assert.doesNotThrow(() =>
    validateProductionEnvironment(requiredProductionEnvironment),
  );
});