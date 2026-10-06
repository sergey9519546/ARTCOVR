import assert from "node:assert/strict";
import test from "node:test";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { ensureStripeWebhook } from "./stripeClient";

test("webhook setup refuses unsafe live targets and never recreates disabled endpoints", async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  const requests: string[] = [];
  let data: unknown[] = [];
  const stub = t.mock.method(ReplitConnectors.prototype, "proxy", async (_service: string, path: string, options: {method?:string}) => {
    requests.push((options.method ?? "GET") + " " + path);
    return new Response(JSON.stringify({data,has_more:false}), {status:200,headers:{"Content-Type":"application/json"}});
  });
  for (const url of ["https://preview.replit.dev/api/stripe/webhook", "http://artcovr.com/api/stripe/webhook", "https://artcovr.com.evil.invalid/api/stripe/webhook", "https://user:pass@artcovr.com/api/stripe/webhook"]) {
    await assert.rejects(ensureStripeWebhook(url));
  }
  assert.equal(requests.length, 0);
  data = [{id:"we_disabled",url:"https://artcovr.com/api/stripe/webhook",status:"disabled",livemode:true,enabled_events:["*"]}];
  await assert.rejects(ensureStripeWebhook("https://artcovr.com/api/stripe/webhook"), /disabled/);
  assert.deepEqual(requests, ["GET /v1/webhook_endpoints?limit=100"]);
  requests.length=0;
  data = [{id:"we_enabled",url:"https://artcovr.com/api/stripe/webhook",status:"enabled",livemode:true,enabled_events:["*"]}];
  await ensureStripeWebhook("https://artcovr.com/api/stripe/webhook");
  assert.deepEqual(requests, ["GET /v1/webhook_endpoints?limit=100"]);
  requests.length=0;
  process.env.NODE_ENV="test";
  await assert.rejects(ensureStripeWebhook("https://artcovr.com/api/stripe/webhook"), /mode/);
  assert.deepEqual(requests, ["GET /v1/webhook_endpoints?limit=100"]);
});
