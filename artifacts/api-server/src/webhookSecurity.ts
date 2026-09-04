import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export class StripeWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookSignatureError";
  }
}

export function verifyStripeWebhookSignature(
  payload: Buffer,
  header: string,
  secret = process.env.STRIPE_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
) {
  if (!secret?.trim()) {
    throw new StripeWebhookSignatureError(
      "STRIPE_WEBHOOK_SECRET is required to verify Stripe webhooks.",
    );
  }

  const values = new Map<string, string[]>();
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key && value) values.set(key, [...(values.get(key) ?? []), value]);
  }

  const timestamp = Number(values.get("t")?.[0]);
  const signatures = values.get("v1") ?? [];
  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    throw new StripeWebhookSignatureError("Stripe webhook signature is malformed.");
  }

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new StripeWebhookSignatureError("Stripe webhook signature is outside the allowed time window.");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`, "utf8")
    .digest();

  const matches = signatures.some((candidate) => {
    if (!/^[a-f0-9]{64}$/i.test(candidate)) return false;
    const received = Buffer.from(candidate, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });

  if (!matches) {
    throw new StripeWebhookSignatureError("Stripe webhook signature is invalid.");
  }

  return true;
}