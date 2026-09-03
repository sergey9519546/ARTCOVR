import assert from "node:assert/strict";
import test from "node:test";
import {
  browserMutationOriginGuard,
  disallowUnknownPreflight,
  getConfiguredStorefrontOrigins,
  getTrustedPublicOrigin,
  normalizeOrigin,
  trustedCorsOptions,
} from "./trustBoundary";

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
  };
}

function request(
  method: string,
  headers: Record<string, string | undefined> = {},
) {
  return {
    method,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

test("origin configuration normalizes only explicit storefront origins", () => {
  const origins = getConfiguredStorefrontOrigins({
    ARTCOVR_STOREFRONT_ORIGINS: "https://artcovr.example/, https://studio.artcovr.example",
  });

  assert.deepEqual([...origins], [
    "https://artcovr.example",
    "https://studio.artcovr.example",
  ]);
  assert.equal(normalizeOrigin("https://artcovr.example/path"), null);
  assert.equal(normalizeOrigin("https://user:pass@artcovr.example"), null);
});

test("CORS allows configured origins and does not reflect unknown origins", () => {
  const options = trustedCorsOptions();
  if (typeof options.origin !== "function") {
    throw new Error("Expected a dynamic CORS origin callback.");
  }
  const callback = options.origin;

  const allowed = new Promise((resolve, reject) => {
    process.env.ARTCOVR_STOREFRONT_ORIGINS = "https://artcovr.example";
    callback?.("https://artcovr.example", (error, value) =>
      error ? reject(error) : resolve(value),
    );
  });
  const disallowed = new Promise((resolve, reject) => {
    callback?.("https://attacker.example", (error, value) =>
      error ? reject(error) : resolve(value),
    );
  });

  return Promise.all([allowed, disallowed]).then(([allowedOrigin, disallowedOrigin]) => {
    assert.equal(allowedOrigin, "https://artcovr.example");
    assert.equal(disallowedOrigin, false);
  });
});

test("mutation origin guard accepts same-origin requests with matching referer", () => {
  const response = responseRecorder();
  let called = false;
  process.env.ARTCOVR_STOREFRONT_ORIGINS = "https://artcovr.example";

  browserMutationOriginGuard(
    request("POST", {
      origin: "https://artcovr.example",
      referer: "https://artcovr.example/checkout/cover",
    }) as never,
    response as never,
    () => {
      called = true;
    },
  );

  assert.equal(called, true);
  assert.equal(response.statusCode, 200);
});

test("mutation origin guard accepts a trusted referer when Origin is omitted", () => {
  const response = responseRecorder();
  let called = false;
  process.env.ARTCOVR_STOREFRONT_ORIGINS = "https://artcovr.example";

  browserMutationOriginGuard(
    request("POST", {
      referer: "https://artcovr.example/account",
    }) as never,
    response as never,
    () => {
      called = true;
    },
  );

  assert.equal(called, true);
  assert.equal(response.statusCode, 200);
});

test("mutation origin guard rejects missing, cross-site, and mismatched origins", () => {
  process.env.ARTCOVR_STOREFRONT_ORIGINS = "https://artcovr.example";
  for (const headers of [
    {},
    { origin: "https://attacker.example" },
    {
      origin: "https://artcovr.example",
      referer: "https://attacker.example/form",
    },
  ]) {
    const response = responseRecorder();
    let called = false;
    browserMutationOriginGuard(
      request("POST", headers) as never,
      response as never,
      () => {
        called = true;
      },
    );
    assert.equal(called, false);
    assert.equal(response.statusCode, 403);
  }
});

test("unknown CORS preflights are rejected without credentialed access", () => {
  process.env.ARTCOVR_STOREFRONT_ORIGINS = "https://artcovr.example";
  const response = responseRecorder();
  let called = false;
  disallowUnknownPreflight(
    request("OPTIONS", { origin: "https://attacker.example" }) as never,
    response as never,
    () => {
      called = true;
    },
  );

  assert.equal(called, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, {
    code: "cors_origin_forbidden",
    message: "This browser origin is not allowed to access the API.",
  });
});

test("trusted public origin never comes from forwarded request headers", () => {
  assert.equal(
    getTrustedPublicOrigin({
      ARTCOVR_PUBLIC_ORIGIN: "https://artcovr.example",
      HOST: "attacker.example",
      X_FORWARDED_HOST: "attacker.example",
    }),
    "https://artcovr.example",
  );
  assert.throws(
    () =>
      getTrustedPublicOrigin({
        HOST: "attacker.example",
        X_FORWARDED_HOST: "attacker.example",
      }),
    /ARTCOVR_PUBLIC_ORIGIN must be configured/,
  );
});