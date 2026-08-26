import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("generation client matches the Edge Function status and query contract", async () => {
  const source = await read("src/lib/artcovr/functions.ts");
  assert.match(source, /status:[\s\S]*"succeeded"/);
  assert.match(source, /previewUrl\?: string/);
  assert.match(source, /generationId=\$\{encodeURIComponent/);
  assert.match(source, /Authorization/);
});

test("prompt editing chains from the current result and labels outputs as generated images", async () => {
  const source = await read("src/components/artcovr/PromptStudio.tsx");
  assert.match(source, /referenceGenerationId: currentResultId\.current/);
  assert.match(source, /Generated image/);
  assert.match(source, />Describe the image you want<\/label>/);
  assert.doesNotMatch(source, /Generated review|Owner source review/);
});

test("prompt editing restores an authorized result and sends explicit reset intent", async () => {
  const source = await read("src/components/artcovr/PromptStudio.tsx");
  assert.match(source, /sessionStorage\.getItem\(selectedPreviewKey\)/);
  assert.match(source, /generation\.artworkId === artwork\.id/);
  assert.match(source, /generation\.phase === "preview"/);
  assert.match(source, /getGenerationStatus\(storedGenerationId\)/);
  assert.match(source, /resetToBase:/);
});

test("My Images exposes paid generation controls and refreshes after completion", async () => {
  const source = await read("src/app/my-images/page.tsx");
  assert.match(source, /<PurchasedGenerationStudio/);
  assert.match(source, /onGenerationCompleted/);
  assert.match(source, /checkout=return|searchParams\.get\("checkout"\)/);
});

test("checkout sends an idempotency key and consumes checkoutUrl", async () => {
  const source = await read("src/components/artcovr/CheckoutReview.tsx");
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /checkoutUrl/);
  assert.match(source, /selectedPreviewId/);
  assert.match(source, /shouldRotateCheckoutIdempotencyKey/);
  assert.match(source, /sessionStorage\.removeItem\(keyName\)/);
});

test("contact inquiry confirms only after the authenticated API succeeds", async () => {
  const source = await read("src/app/contact/page.tsx");
  assert.match(source, /await submitInquiry\(/);
  assert.match(source, /setSent\(true\)/);
  assert.match(source, /Sign in/);
});

test("typed API errors classify only terminal checkout failures for key rotation", async () => {
  const helperSource = await read("src/lib/artcovr/api-error.ts").catch(() => "");
  assert.match(helperSource, /class ArtcovrApiError/);
  const { ArtcovrApiError, shouldRotateCheckoutIdempotencyKey } = await import(
    new URL("../../src/lib/artcovr/api-error.ts", import.meta.url).href
  );

  assert.equal(
    shouldRotateCheckoutIdempotencyKey(
      new ArtcovrApiError(409, "checkout_unavailable", "Expired"),
    ),
    true,
  );
  assert.equal(
    shouldRotateCheckoutIdempotencyKey(
      new ArtcovrApiError(409, "idempotency_expired", "Expired reservation"),
    ),
    true,
  );
  assert.equal(
    shouldRotateCheckoutIdempotencyKey(
      new ArtcovrApiError(502, "stripe_checkout_failed", "Stripe failed"),
    ),
    true,
  );
  assert.equal(
    shouldRotateCheckoutIdempotencyKey(
      new ArtcovrApiError(409, "reservation_reconciliation_pending", "Pending"),
    ),
    false,
  );
  assert.equal(
    shouldRotateCheckoutIdempotencyKey(new Error("network")),
    false,
  );
});

test("safe callback destinations cannot resolve away from the app origin", async () => {
  const helperSource = await read("src/lib/artcovr/navigation.ts").catch(() => "");
  assert.match(helperSource, /function safeNext/);
  const { safeNext } = await import(
    new URL("../../src/lib/artcovr/navigation.ts", import.meta.url).href
  );
  const origin = "https://artcovr.example";

  assert.equal(safeNext("/archive?from=auth", origin), "/archive?from=auth");
  assert.equal(safeNext("/\\evil.example", origin), "/my-images");
  assert.equal(safeNext("https://evil.example/path", origin), "/my-images");
  assert.equal(safeNext("/%5cevil.example", origin), "/my-images");
  assert.equal(safeNext("/archive%0d%0aLocation:evil", origin), "/my-images");
  assert.equal(safeNext("/archive%09Location:evil", origin), "/my-images");
  assert.equal(safeNext("/%2e%2e//evil.example", origin), "/my-images");
});

test("inactive transition layer cannot cover the page", async () => {
  const source = await read("src/components/parity/PageLayer.tsx");
  assert.match(source, /invisible \[clip-path:inset\(0_0_100%_0\)\]/);
  assert.match(source, /aria-hidden=!\{?active\}?|aria-hidden=\{!active\}/);
});
