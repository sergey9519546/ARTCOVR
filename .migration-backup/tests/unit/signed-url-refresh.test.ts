import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNED_URL_REFRESH_BUFFER_MS,
  signedUrlRefreshDelay,
} from "../../src/lib/artcovr/signed-url-refresh.ts";

test("signed URL refresh schedules against the earliest valid expiry", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z");
  assert.equal(
    signedUrlRefreshDelay([
      "2026-09-04T12:05:00.000Z",
      "2026-09-04T12:03:00.000Z",
    ], now),
    3 * 60_000 - SIGNED_URL_REFRESH_BUFFER_MS,
  );
});

test("signed URL refresh fires immediately inside the safety buffer", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z");
  assert.equal(
    signedUrlRefreshDelay(["2026-09-04T12:00:30.000Z"], now),
    0,
  );
  assert.equal(
    signedUrlRefreshDelay(["2026-09-04T11:59:00.000Z"], now),
    0,
  );
});

test("signed URL refresh ignores absent and malformed deployment data", () => {
  assert.equal(signedUrlRefreshDelay([undefined, "not-a-date"]), null);
});
