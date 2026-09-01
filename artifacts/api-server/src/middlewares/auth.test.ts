import assert from "node:assert/strict";
import test from "node:test";
import { requireAuth } from "./auth";

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

function clerkRequest(userId: string | null) {
  const auth = Object.assign(() => ({ userId, tokenType: "session_token" }), {
    [Symbol.for("@clerk/express.auth")]: true,
  });
  return { auth };
}

test("requireAuth rejects requests without a Clerk session", () => {
  const response = responseRecorder();
  let called = false;
  const request = clerkRequest(null);

  requireAuth(request as never, response as never, () => {
    called = true;
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.payload, {
    code: "unauthorized",
    message: "Sign in before continuing.",
  });
  assert.equal(called, false);
});

test("requireAuth attaches the Clerk subject to authenticated requests", () => {
  const response = responseRecorder();
  const request = clerkRequest("user_artcovr_test") as Record<string, unknown>;
  let called = false;

  requireAuth(request as never, response as never, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(request.clerkUserId, "user_artcovr_test");
});