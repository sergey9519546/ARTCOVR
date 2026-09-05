import assert from "node:assert/strict";
import test from "node:test";
import { developmentSmokeOptions } from "./developmentSmoke";

const environment = { CLERK_SECRET_KEY: "sk_test_fixture", VITE_CLERK_PUBLISHABLE_KEY: "pk_test_fixture", DATABASE_URL: "postgresql://postgres:fixture@127.0.0.1:55439/disposable", NODE_ENV: "development" };
const args = ["--dev-smoke", "--base-url", "http://127.0.0.1:3001"];

test("development smoke requires explicit opt-in and never enables paid generation by default", () => {
  assert.throws(() => developmentSmokeOptions([], environment), /Requires --dev-smoke/);
  assert.equal(developmentSmokeOptions(args, environment).generate, false);
  assert.equal(developmentSmokeOptions([...args, "--generate"], environment).generate, true);
});

test("development smoke refuses live keys, production deployments, and remote databases", () => {
  assert.throws(() => developmentSmokeOptions(args, { ...environment, CLERK_SECRET_KEY: "sk_live_fixture" }), /test secret/);
  assert.throws(() => developmentSmokeOptions(args, { ...environment, VITE_CLERK_PUBLISHABLE_KEY: "pk_live_fixture" }), /test publishable/);
  assert.throws(() => developmentSmokeOptions(args, { ...environment, REPLIT_DEPLOYMENT: "1" }), /production/);
  assert.throws(() => developmentSmokeOptions(args, { ...environment, DATABASE_URL: "postgresql://user:fixture@production.example.com/db" }), /production databases/);
});

test("development smoke restricts token destinations and rejects credential-bearing URLs", () => {
  for (const base of ["https://artcovr.com", "https://other-workspace.replit.dev", "http://user:password@127.0.0.1", "http://127.0.0.1/path"]) {
    assert.throws(() => developmentSmokeOptions(["--dev-smoke", "--base-url", base], environment), /Target must/);
  }
  const replit = { ...environment, REPL_ID: "fixture", REPLIT_DEV_DOMAIN: "this-workspace.replit.dev", DATABASE_URL: "postgresql://user:fixture@helium/database" };
  assert.equal(developmentSmokeOptions(["--dev-smoke", "--base-url", "https://this-workspace.replit.dev"], replit).base, "https://this-workspace.replit.dev");
});
