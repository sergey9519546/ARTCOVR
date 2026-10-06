import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyPolicyBody } from "../../components/artcovr/PrivacyPolicyBody";
import { PRIVACY_POLICY } from "./privacy-policy";
import { getRouteMetadata } from "./route-metadata";
import { renderStaticRoute } from "./static-render";

function staticPolicy() {
  return renderStaticRoute({
    artworks: [],
    siteUrl: "https://example.test",
    metadata: getRouteMetadata("/legal/privacy", []),
    getGenres: () => [],
  }).bodyHtml;
}

test("client and crawlable privacy policies render every shared paragraph in order", () => {
  const client = renderToStaticMarkup(createElement(PrivacyPolicyBody));
  const staticHtml = staticPolicy();
  const article = staticHtml.match(/<article>([\s\S]*?)<\/article>/)?.[1];
  assert.ok(article);
  assert.equal(client.replace(/ class="[^"]*"/g, ""), article);
  assert.ok(staticHtml.includes(PRIVACY_POLICY.eyebrow));
  assert.ok(staticHtml.includes(`<h1>${PRIVACY_POLICY.title}</h1>`));

  const page = readFileSync(new URL("../../app/legal/privacy/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<PrivacyPolicyBody\s*\/>/);
  assert.match(page, /eyebrow=\{PRIVACY_POLICY\.eyebrow\}/);
  assert.match(page, /title=\{PRIVACY_POLICY\.title\}/);
});

test("provider disclosure matches the owner-approved paragraph without the old Supabase claim", () => {
  const providers = PRIVACY_POLICY.sections.find((section) => section.heading === "Service providers");
  assert.deepEqual(providers?.paragraphs, [
    "Clerk provides authentication. ARTCOVR stores account and purchase records in a PostgreSQL database and private files in Replit object storage. Stripe processes checkout and payment events; ARTCOVR does not store complete payment-card numbers. OpenAI receives the selected image and your prompt to produce a requested generated image. Hosting, delivery, email, and security providers process limited technical data needed to provide their services.",
  ]);
  assert.doesNotMatch(staticPolicy(), /Supabase/i);
});

test("preserves the existing effective date, rights, retention, and security commitments", () => {
  assert.equal(PRIVACY_POLICY.eyebrow, "Legal · Effective August 13, 2026");
  const html = staticPolicy();
  for (const commitment of [
    "We do not sell personal information.",
    "Essential browser storage may remember session and editing state.",
    "Unselected preview access expires after seven days.",
    "Purchased generation and signed download access expires after thirty days unless the purchase page states otherwise.",
    "Expiration of a link is not a promise that every operational, backup, fraud-prevention, or transaction record is immediately erased.",
    "Purchase and license records may be retained for accounting, dispute, and legal obligations.",
    "Contact ARTCOVR to request access, correction, or deletion where applicable.",
    "A deletion request may not remove records that must be retained to document a license, payment, refund, security incident, or legal obligation.",
    "Clean artwork and generated files are kept in private storage and released through short-lived authorized links.",
    "No internet service can guarantee absolute security.",
    "ARTCOVR is not intended for children under 13.",
  ]) {
    assert.ok(html.includes(commitment), `Missing existing commitment: ${commitment}`);
  }
});
