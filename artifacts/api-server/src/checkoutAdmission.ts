export const checkoutAdmissionWindowMs = 15 * 60_000;
export const checkoutAdmissionMaxAttempts = 5;

type Bucket = {
  startedAt: number;
  attempts: number;
};

export type CheckoutAdmissionResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Bounds new checkout creation before it can write an order or call Stripe.
 *
 * This is intentionally process-local and bounded. The request address and
 * customer identity are independent keys so changing a guest email does not
 * bypass the address budget, while a shared reverse proxy address does not
 * make the whole storefront share one customer budget.
 */
export class CheckoutAdmissionLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs = checkoutAdmissionWindowMs,
    private readonly maxAttempts = checkoutAdmissionMaxAttempts,
    private readonly maxBuckets = 4096,
  ) {}

  admit(keys: readonly string[], now = Date.now()): CheckoutAdmissionResult {
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    this.prune(now);

    let retryAfterMs = 0;
    for (const key of uniqueKeys) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;

      const age = now - bucket.startedAt;
      if (age >= this.windowMs) continue;
      if (bucket.attempts >= this.maxAttempts) {
        retryAfterMs = Math.max(retryAfterMs, this.windowMs - age);
      }
    }

    if (retryAfterMs > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    for (const key of uniqueKeys) {
      const bucket = this.buckets.get(key);
      if (!bucket || now - bucket.startedAt >= this.windowMs) {
        this.buckets.set(key, { startedAt: now, attempts: 1 });
      } else {
        bucket.attempts += 1;
        this.buckets.delete(key);
        this.buckets.set(key, bucket);
      }
    }
    this.trimToCapacity();
    return { allowed: true };
  }

  clear() {
    this.buckets.clear();
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  private trimToCapacity() {
    while (this.buckets.size > this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.buckets.delete(oldestKey);
    }
  }
}