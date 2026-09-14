import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import app from "../app";
import { getPublicCatalog } from "../catalog";

test("unknown agent artwork slugs do not reach payment setup", async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The test server did not expose a TCP address.");
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/agent/artworks/not-a-real-artwork/image`,
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      code: "artwork_unavailable",
      message: "That artwork is not available through the agent image endpoint.",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("published agent artwork requests return an MPP challenge before delivery", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousProfile = process.env.STRIPE_PROFILE_ID;
  const previousOrigin = process.env.ARTCOVR_PUBLIC_ORIGIN;
  process.env.STRIPE_SECRET_KEY = "sk_test_agent_mpp";
  process.env.STRIPE_PROFILE_ID = "profile_test_agent_mpp";
  process.env.ARTCOVR_PUBLIC_ORIGIN = "https://artcovr.example";

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const artwork = getPublicCatalog()[0];
  if (!address || typeof address === "string" || !artwork) {
    server.close();
    throw new Error("The test server did not expose a TCP address or catalog artwork.");
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/agent/artworks/${artwork.slug}/image`,
    );
    assert.equal(response.status, 402);
    assert.match(response.headers.get("www-authenticate") ?? "", /Payment/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousProfile === undefined) delete process.env.STRIPE_PROFILE_ID;
    else process.env.STRIPE_PROFILE_ID = previousProfile;
    if (previousOrigin === undefined) delete process.env.ARTCOVR_PUBLIC_ORIGIN;
    else process.env.ARTCOVR_PUBLIC_ORIGIN = previousOrigin;
  }
});