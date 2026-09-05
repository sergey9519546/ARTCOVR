import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import app from "./app";

test("API root returns an explicit service status", async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The test server did not expose a TCP address.");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: "artcovr-api",
      status: "ok",
      health: "/api/healthz",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});