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

test("style-reference uploads fail closed and cannot race generation admission", async () => {
  const [source, envExample] = await Promise.all([
    read("src/components/artcovr/PromptStudio.tsx"),
    read(".env.example"),
  ]);
  assert.match(source, /NEXT_PUBLIC_ARTCOVR_REFERENCE_UPLOADS === "1"/);
  assert.match(source, /canGenerate = [^\n]*!referenceUploading/);
  assert.match(source, /referenceRef\.current\.status === "uploading"/);
  assert.match(source, /referenceUploadsEnabled &&/);
  assert.match(envExample, /NEXT_PUBLIC_ARTCOVR_REFERENCE_UPLOADS=0/);
});

test("optional cover text never defaults to ARTCOVR's catalog title", async () => {
  const [previewStudio, purchasedStudio] = await Promise.all([
    read("src/components/artcovr/PromptStudio.tsx"),
    read("src/components/artcovr/PurchasedGenerationStudio.tsx"),
  ]);

  assert.match(previewStudio, /\[coverTitle, setCoverTitle\] = useState\(""\)/);
  assert.doesNotMatch(previewStudio, /useState\(artwork\.title\)/);
  assert.match(purchasedStudio, /\[coverTitle, setCoverTitle\] = useState\(""\)/);
  assert.doesNotMatch(purchasedStudio, /useState\(purchase\.artworkTitle\)/);
});

test("My Images exposes paid generation controls and refreshes after completion", async () => {
  const source = await read("src/app/my-images/page.tsx");
  assert.match(source, /<PurchasedGenerationStudio/);
  assert.match(source, /onGenerationCompleted/);
  assert.match(source, /checkout=return|searchParams\.get\("checkout"\)/);
  assert.match(source, /Checkout confirmation pending/);
  assert.match(source, /Check again/);
  assert.match(source, /Browse archive/);
  assert.match(source, /Refresh account/);
  assert.match(source, /client\.auth\.signOut\(\)/);
  assert.match(source, /Sign out/);
  assert.match(source, /generation allowance is complete/);
  assert.match(source, /accountRequestSequence/);
  assert.match(source, /requestSequence === accountRequestSequence\.current/);
  assert.match(source, /signingOut\.current = true/);
  assert.match(source, /if \(signingOut\.current\) return null/);
  assert.match(source, /if \(signingOut\.current\) return;/);
  assert.match(source, /accountRequestSequence\.current \+= 1;[\s\S]*client\.auth\.signOut\(\)[\s\S]*accountRequestSequence\.current \+= 1;/);
});

test("My Images makes paid download signing failures visible and retryable", async () => {
  const [page, client] = await Promise.all([
    read("src/app/my-images/page.tsx"),
    read("src/lib/artcovr/functions.ts"),
  ]);
  assert.match(client, /unavailableDownloads: AccountUnavailableDownload\[\]/);
  assert.match(client, /code: "asset_sign_failed"/);
  assert.match(page, /data\.unavailableDownloads \?\? \[\]/);
  assert.match(page, /Downloads temporarily unavailable/);
  assert.match(page, /Your entitlement is unchanged/);
  assert.match(page, /Retry downloads/);
  assert.match(page, /Contact support/);
});

test("My Images renews short-lived signed URLs without extending entitlement", async () => {
  const page = await read("src/app/my-images/page.tsx");
  assert.match(page, /signedUrlRefreshDelay\(signedUrlExpirations\(data\)\)/);
  assert.match(page, /window\.setTimeout\(\(\) => \{[\s\S]*refreshSignedUrls\(\)/);
  assert.match(page, /window\.addEventListener\("focus", refreshIfNearExpiry\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", refreshIfNearExpiry\)/);
  assert.match(page, /signedUrlRefreshInFlight\.current/);
});

test("checkout sends an idempotency key and consumes checkoutUrl", async () => {
  const source = await read("src/components/artcovr/CheckoutReview.tsx");
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /checkoutUrl/);
  assert.match(source, /selectedPreviewId/);
  assert.match(source, /shouldRotateCheckoutIdempotencyKey/);
  assert.match(source, /sessionStorage\.removeItem\(keyName\)/);
  assert.match(source, /shouldDiscardSelectedPreview/);
  assert.match(source, /removeSavedPreview\(selectedPreviewKey\)/);
});

test("generation and checkout present recoverable sign-in paths before protected actions", async () => {
  const [studio, checkout] = await Promise.all([
    read("src/components/artcovr/PromptStudio.tsx"),
    read("src/components/artcovr/CheckoutReview.tsx"),
  ]);

  for (const source of [studio, checkout]) {
    assert.match(source, /getSupabaseBrowserClient/);
    assert.match(source, /onAuthStateChange/);
    assert.match(source, /authState !== "signed-in"/);
    assert.match(source, /\/sign-in\?next=/);
  }
  assert.match(studio, /Sign in and return/);
  assert.match(studio, /artcovr:prompt-draft:/);
  assert.match(studio, /onClick=\{saveDraftForSignIn\}/);
  assert.match(studio, /sessionStorage\.getItem\(promptDraftKey\)/);
  assert.match(checkout, /Sign in with email/);
});

test("reference controls expose focus and recover from an unauthorized upload", async () => {
  const studio = await read("src/components/artcovr/PromptStudio.tsx");

  assert.equal(studio.match(/focus-within:ring-2/g)?.length, 2);
  assert.equal(studio.match(/focus-within:opacity-100/g)?.length, 2);
  assert.match(
    studio,
    /catch \(cause\) \{[\s\S]*?cause instanceof ArtcovrApiError && cause\.code === "unauthorized"[\s\S]*?setAuthState\("signed-out"\)/,
  );
});

test("sign-in validates and preserves the requested same-origin return path", async () => {
  const [source, callback, browserClient] = await Promise.all([
    read("src/app/sign-in/page.tsx"),
    read("src/app/auth/callback/page.tsx"),
    read("src/lib/supabase/client.ts"),
  ]);
  assert.match(source, /safeNext\(params\.get\("next"\), window\.location\.origin\)/);
  assert.match(source, /callbackUrl\.searchParams\.set\("next", destination\)/);
  assert.match(source, /emailRedirectTo: callbackUrl\.toString\(\)/);
  assert.match(callback, /retryUrl\.searchParams\.set\("next", destination\)/);
  assert.match(callback, /window\.location\.replace\(retryDestination\)/);
  assert.doesNotMatch(callback, /opacity:\s*0\.5/);
  assert.match(browserClient, /detectSessionInUrl:\s*false/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
});

test("product pages disclose the verified native deliverable before checkout", async () => {
  const [product, projection] = await Promise.all([
    read("src/app/product/[slug]/page.tsx"),
    read("src/lib/artcovr/catalog-projection.ts"),
  ]);

  assert.match(product, /Native file/);
  assert.match(product, /sourceWidth/);
  assert.match(product, /sourceHeight/);
  assert.match(product, /sourceMimeType/);
  assert.match(projection, /sourceWidth: row\.sourceWidth/);
  assert.match(projection, /sourceHeight: row\.sourceHeight/);
  assert.match(projection, /sourceMimeType: row\.sourceMimeType/);
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

test("only authoritative selected-preview failures discard the saved preview", async () => {
  const { ArtcovrApiError, shouldDiscardSelectedPreview } = await import(
    new URL("../../src/lib/artcovr/api-error.ts", import.meta.url).href
  );

  for (const code of ["generation_not_found", "invalid_selected_preview", "selected_preview_unavailable"]) {
    assert.equal(shouldDiscardSelectedPreview(new ArtcovrApiError(409, code, "Unavailable")), true);
  }
  assert.equal(shouldDiscardSelectedPreview(new ArtcovrApiError(503, "request_failed", "Network")), false);
  assert.equal(shouldDiscardSelectedPreview(new Error("network")), false);
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
