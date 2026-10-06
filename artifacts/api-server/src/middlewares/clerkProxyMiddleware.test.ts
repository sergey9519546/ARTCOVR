import assert from "node:assert/strict";
import { createServer, request, type Server, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import express from "express";
import { CLERK_PROXY_PATH, createClerkFrontendProxy, getClerkProxyHost } from "./clerkProxyMiddleware";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function send(url: string, method = "GET", body = "", headers: IncomingHttpHeaders = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("test request timed out")));
    req.end(body);
  });
}

test("Clerk transport preserves forwarding and edge-safe response handling", async (t) => {
  const secret = "test-only-placeholder";
  const compressed = gzipSync('{"client":"fixture"}');
  const received: Array<{ url: string; body: string; headers: IncomingHttpHeaders }> = [];
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received.push({ url: req.url ?? "", body: Buffer.concat(chunks).toString(), headers: req.headers });
    if (req.url?.startsWith("/v1/client")) {
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "set-cookie": ["fixture_a=1; HttpOnly; Secure", "fixture_b=2; SameSite=Lax"],
      });
      res.write(compressed.subarray(0, 5));
      res.end(compressed.subarray(5));
    } else if (req.url === "/npm/asset.js") {
      res.writeHead(200, { "content-length": "5" });
      res.end("asset");
    } else if (req.url === "/head") {
      res.writeHead(200, { "content-length": "123" });
      res.end();
    } else if (req.url === "/empty") {
      res.writeHead(204);
      res.end();
    } else if (req.url === "/not-modified") {
      res.writeHead(304, { "content-length": "123" });
      res.end();
    } else if (req.url === "/redirect") {
      res.writeHead(302, { location: "/v1/redirected" });
      res.end();
    } else if (req.url === "/broken") {
      req.socket.destroy();
    } else {
      res.writeHead(404, { "content-length": "0" });
      res.end();
    }
  });
  const target = await listen(upstream);
  t.after(() => close(upstream));
  const app = express();
  app.use(CLERK_PROXY_PATH, createClerkFrontendProxy(secret, target));
  const server = createServer(app);
  const origin = await listen(server);
  t.after(() => close(server));

  await t.test("forwards mounted path, query, body, credentials and first proxy hop", async () => {
    const result = await send(`${origin}${CLERK_PROXY_PATH}/v1/client?fixture=1`, "POST", "fixture-body", {
      "x-forwarded-host": "artcovr.example, internal.example",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "192.0.2.1, 192.0.2.2",
      cookie: "fixture_session=1",
      "content-type": "text/plain",
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, compressed);
    assert.equal(result.headers["content-length"], String(compressed.length));
    assert.equal(result.headers["transfer-encoding"], undefined);
    assert.equal(result.headers["content-encoding"], "gzip");
    assert.deepEqual(result.headers["set-cookie"], ["fixture_a=1; HttpOnly; Secure", "fixture_b=2; SameSite=Lax"]);
    assert.equal(received[0]?.url, "/v1/client?fixture=1");
    assert.equal(received[0]?.body, "fixture-body");
    assert.equal(received[0]?.headers.host, new URL(target).host);
    assert.equal(received[0]?.headers["clerk-proxy-url"], "https://artcovr.example/api/__clerk");
    assert.equal(received[0]?.headers["clerk-secret-key"], secret);
    assert.equal(received[0]?.headers["x-forwarded-for"], "192.0.2.1");
    assert.equal(received[0]?.headers.cookie, "fixture_session=1");
  });

  await t.test("streams length-known assets", async () => {
    const result = await send(`${origin}${CLERK_PROXY_PATH}/npm/asset.js`);
    assert.equal(result.status, 200);
    assert.equal(result.body.toString(), "asset");
    assert.equal(result.headers["content-length"], "5");
    assert.equal(result.headers["transfer-encoding"], undefined);
  });

  await t.test("preserves HEAD, 204 and 304 without bodies", async () => {
    for (const [path, method, status, length] of [
      ["/head", "HEAD", 200, "123"],
      ["/empty", "GET", 204, undefined],
      ["/not-modified", "GET", 304, "123"],
    ] as const) {
      const result = await send(`${origin}${CLERK_PROXY_PATH}${path}`, method);
      assert.equal(result.status, status);
      assert.equal(result.body.length, 0);
      assert.equal(result.headers["content-length"], length);
      assert.equal(result.headers["transfer-encoding"], undefined);
    }
  });

  await t.test("relays redirects and errors without exposing upstream details", async () => {
    const redirect = await send(`${origin}${CLERK_PROXY_PATH}/redirect`);
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, "/v1/redirected");
    const failure = await send(`${origin}${CLERK_PROXY_PATH}/broken`);
    assert.equal(failure.status, 502);
    assert.equal(failure.headers["content-length"], "0");
    assert.equal(failure.body.length, 0);
  });
});

test("Clerk public host normalization preserves fallback and first-hop behavior", () => {
  assert.equal(getClerkProxyHost({ headers: { host: "public.example" } }), "public.example");
  assert.equal(getClerkProxyHost({ headers: {
    host: "internal.example",
    "x-forwarded-host": [" first.example, next.example ", "last.example"],
  } }), "first.example");
});
