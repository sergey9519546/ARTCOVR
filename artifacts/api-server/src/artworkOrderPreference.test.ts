import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import { artcovrArtworkOrderPreferences, db } from "@workspace/db";
import { inArray } from "drizzle-orm";
import accountRouter from "./routes/account";

function accountTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.headers["x-test-user-id"];
    const auth = Object.assign(
      () => ({
        userId: typeof userId === "string" ? userId : null,
        tokenType: "session_token",
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    Object.assign(req, { auth });
    next();
  });
  app.use("/api", accountRouter);
  return app;
}

test("artwork order preference is authenticated and isolated by Clerk user", async () => {
  const runId = randomUUID();
  const userA = `artwork-order-a-${runId}`;
  const userB = `artwork-order-b-${runId}`;
  const url = await new Promise<{ server: ReturnType<typeof createServer>; url: string }>(
    (resolve, reject) => {
      const server = createServer(accountTestApp());
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("The test server did not expose a TCP address."));
          return;
        }
        resolve({
          server,
          url: `http://127.0.0.1:${address.port}/api/functions/v1/artwork-order-preference`,
        });
      });
    },
  );

  try {
    const anonymousRead = await fetch(url.url);
    assert.equal(anonymousRead.status, 401);
    const anonymousWrite = await fetch(url.url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preference: "shuffle" }),
    });
    assert.equal(anonymousWrite.status, 401);

    const initial = await fetch(url.url, {
      headers: { "x-test-user-id": userA },
    });
    assert.equal(initial.status, 200);
    assert.deepEqual(await initial.json(), { preference: null });
    assert.equal(initial.headers.get("cache-control"), "private, no-store");

    const saveA = await fetch(url.url, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": userA,
      },
      body: JSON.stringify({ preference: "shuffle" }),
    });
    assert.equal(saveA.status, 200);
    assert.deepEqual(await saveA.json(), { preference: "shuffle" });

    const forgedSaveB = await fetch(url.url, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": userB,
      },
      // A forged owner field must not override the authenticated Clerk user.
      body: JSON.stringify({ preference: "rotate", clerkUserId: userA }),
    });
    assert.equal(forgedSaveB.status, 400);

    const saveB = await fetch(url.url, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": userB,
      },
      body: JSON.stringify({ preference: "rotate" }),
    });
    assert.equal(saveB.status, 200);
    assert.deepEqual(await saveB.json(), { preference: "rotate" });

    const readA = await fetch(url.url, {
      headers: { "x-test-user-id": userA },
    });
    const readB = await fetch(url.url, {
      headers: { "x-test-user-id": userB },
    });
    assert.deepEqual(await readA.json(), { preference: "shuffle" });
    assert.deepEqual(await readB.json(), { preference: "rotate" });

    const invalid = await fetch(url.url, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": userA,
      },
      body: JSON.stringify({ preference: "sideways" }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) =>
      url.server.close((error) => (error ? reject(error) : resolve())),
    );
    await db
      .delete(artcovrArtworkOrderPreferences)
      .where(inArray(artcovrArtworkOrderPreferences.clerkUserId, [userA, userB]));
  }
});
