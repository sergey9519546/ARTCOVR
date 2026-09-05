import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkExternalGuideSource,
  isAcceptableExternalStatus,
  validateGuideSourceDefinition,
  validateFirstPartyGuideSource,
} from "../src/lib/artcovr/guide-source-validation";
import type { AnswerGuideSource } from "../src/lib/artcovr/answer-guides";

const firstPartySource: AnswerGuideSource = {
  title: "Commercial Cover Art License",
  publisher: "ARTCOVR",
  href: "/license",
  description: "First-party license terms.",
  kind: "first-party",
};

test("accepts indexable first-party routes without network access", () => {
  assert.equal(validateFirstPartyGuideSource("/guides/test", firstPartySource), null);
  assert.equal(validateGuideSourceDefinition("/guides/test", firstPartySource), null);
});

test("rejects unknown and private first-party routes", () => {
  assert.match(
    validateFirstPartyGuideSource("/guides/test", {
      ...firstPartySource,
      href: "/not-a-public-route",
    })?.reason ?? "",
    /not in public route metadata/,
  );
  assert.match(
    validateFirstPartyGuideSource("/guides/test", {
      ...firstPartySource,
      href: "/my-images",
    })?.reason ?? "",
    /not indexable public content/,
  );
});

test("requires HTTPS for external guide citations", () => {
  assert.match(
    validateGuideSourceDefinition("/guides/test", {
      ...firstPartySource,
      kind: "external",
      href: "http://example.com/source",
    })?.reason ?? "",
    /HTTPS/,
  );
});

test("treats successful redirects as acceptable external responses", () => {
  assert.equal(isAcceptableExternalStatus(200), true);
  assert.equal(isAcceptableExternalStatus(399), true);
  assert.equal(isAcceptableExternalStatus(404), false);
  assert.equal(isAcceptableExternalStatus(500), false);
});

test("falls back from unsupported HEAD to a bounded GET", async () => {
  const methods: string[] = [];
  const result = await checkExternalGuideSource(
    "https://example.com/source",
    async (_input, init) => {
      methods.push(String(init?.method));
      return {
        status: init?.method === "HEAD" ? 405 : 206,
        url: "https://example.com/source",
      } as Response;
    },
  );

  assert.deepEqual(methods, ["HEAD", "GET"]);
  assert.deepEqual(result, {
    ok: true,
    status: 206,
    finalUrl: "https://example.com/source",
  });
});