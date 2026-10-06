import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyBody } from "../../components/artcovr/PolicyBody";
import { LICENSE_POLICY } from "./license-policy";
import { TERMS_POLICY } from "./terms-policy";
import type { PolicyDocument } from "./policy-document";
import { getRouteMetadata } from "./route-metadata";
import { renderStaticRoute } from "./static-render";

function staticPolicy(route: string) {
  return renderStaticRoute({
    artworks: [],
    siteUrl: "https://example.test",
    metadata: getRouteMetadata(route, []),
    getGenres: () => [],
  }).bodyHtml;
}

const fixtures: { route: string; page: string; name: string; policy: PolicyDocument; headings: string[] }[] = [
  {
    route: "/license", page: "../../app/license/page.tsx", name: "LICENSE_POLICY",
    policy: LICENSE_POLICY,
    headings: ["What the license does not allow", "Exclusive and repeatable artwork", "Term and territory", "Refunds", "DMCA"],
  },
  {
    route: "/legal/terms", page: "../../app/legal/terms/page.tsx", name: "TERMS_POLICY",
    policy: TERMS_POLICY,
    headings: ["Purchases and fulfillment", "Commercial license", "Generated images and access", "Refunds", "Service availability"],
  },
];

for (const { route, page, name, policy, headings } of fixtures) {
  test(`${route}: interactive and initial HTML contain every policy block in the same order`, () => {
    const client = renderToStaticMarkup(createElement(PolicyBody, { policy }));
    const html = staticPolicy(route);
    const article = html.match(/<article>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(article);
    // Navigation is rendered by the page's existing client Link, not PolicyBody.
    assert.equal(
      client.replace(/ class="[^"]*"/g, ""),
      article.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, ""),
    );
    assert.deepEqual(policy.sections.map(({ heading }) => heading), headings);
    assert.ok(html.includes(policy.eyebrow));
    assert.ok(html.includes(`<h1>${policy.title}</h1>`));
    const source = readFileSync(new URL(page, import.meta.url), "utf8");
    assert.match(source, new RegExp(`<PolicyBody policy=\\{${name}\\}\\s*/>`));
    assert.match(source, new RegExp(`eyebrow=\\{${name}\\.eyebrow\\}`));
    assert.match(source, new RegExp(`title=\\{${name}\\.title\\}`));
    for (const { href, label } of policy.links ?? []) {
      assert.ok(article.includes(`href="${href}"`));
      assert.ok(article.includes(`>${label}</a>`));
    }
  });
}

test("license preserves term, territory, revocation, copyright, all restrictions, and DMCA wording", () => {
  assert.equal(LICENSE_POLICY.eyebrow, "Licensing · Effective August 13, 2026");
  assert.equal(LICENSE_POLICY.sections[0].blocks[0].items.length, 5);
  const html = staticPolicy("/license");
  for (const commitment of [
    "Use it unlawfully.",
    "Copyright in the base artwork is retained unless a separate written agreement, signed by the rights holder, expressly transfers it.",
    "This license is worldwide and perpetual for the downloaded files you receive. It ends for any asset whose access is revoked under Refunds or Terms.",
    "An approved refund revokes the commercial license for the refunded artwork and disables unused generation access and future signed download links. Files already downloaded cannot be recalled.",
    "If you believe content on ARTCOVR infringes your copyright, notify us through the contact form with a description of the infringing work, your contact information, a statement of good faith, and your electronic signature.",
  ]) {
    assert.ok(html.includes(commitment), `Missing license commitment: ${commitment}`);
  }
  const page = readFileSync(new URL("../../app/license/page.tsx", import.meta.url), "utf8");
  assert.match(page, /LICENSE_POLICY\.links\.map/);
  assert.match(page, /href=\{href\}/);
  assert.match(page, /\{label\}/);
});

test("terms preserve access expiration, refunds, dispute consequences, availability, and checkout precedence", () => {
  assert.equal(TERMS_POLICY.eyebrow, "Legal · Effective August 13, 2026");
  assert.equal(TERMS_POLICY.sections[1].blocks[1].items.length, 3);
  const html = staticPolicy("/legal/terms");
  for (const commitment of [
    "Exclusive artwork is reserved for one checkout at a time for about 30 minutes",
    "It does not transfer copyright, ownership of a broad visual style, unpublished working files, or source materials.",
    "Copyright in the base artwork is retained unless a separate signed agreement states otherwise.",
    "Generation allowances count successful results only. Requests may be rejected for safety, technical, or legal reasons. Purchased generation and signed-download access is time-limited as shown in My Images. You are responsible for saving authorized downloads before access expires.",
    "Refund requests are reviewed individually. An approved refund revokes the commercial license for the refunded artwork, disables unused generations, and disables future signed download links. Files already downloaded cannot be recalled, and exclusive artwork is not automatically relisted. Payment disputes or reversals may suspend related access while the payment status is resolved.",
    "ARTCOVR may protect the service from abuse, correct catalog or pricing errors before payment, and pause unavailable generation services. Nothing in these terms limits rights that cannot legally be limited in your jurisdiction.",
    "If a checkout-specific license and this page conflict, the checkout-specific license controls for that purchase.",
  ]) {
    assert.ok(html.includes(commitment), `Missing terms commitment: ${commitment}`);
  }
});
