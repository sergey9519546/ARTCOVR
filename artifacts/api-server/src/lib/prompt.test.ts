import assert from "node:assert/strict";
import test from "node:test";
import { buildGenerationPrompt, PromptLengthError } from "./prompt";

test("turns plain-language direction into a reference-led generation prompt", () => {
  const prompt = buildGenerationPrompt({
    artwork: {
      title: "Night Transit",
      category: "post-punk",
      moodTags: ["nocturnal", "tense"],
    },
    userPrompt: "  make the sky warmer   and add grain  ",
    coverText: { title: "Night Transit", artistName: "Signal Club" },
    styleMode: "exact",
    hasReferenceUpload: true,
  });

  assert.match(prompt, /Always use the supplied artwork image as the primary visual reference/);
  assert.match(prompt, /Match the primary reference image's exact visual style/);
  assert.match(prompt, /secondary uploaded image is also available as a style reference/);
  assert.match(prompt, /USER'S REQUESTED CHANGE/);
  assert.match(prompt, /make the sky warmer and add grain/);
  assert.match(prompt, /the title "Night Transit"/);
  assert.match(prompt, /the artist name "Signal Club"/);
});

test("rejects a request that becomes too long after prompt creation", () => {
  assert.throws(
    () =>
      buildGenerationPrompt({
        artwork: { title: "Test" },
        userPrompt: "x".repeat(12_000),
        hasReferenceUpload: false,
      }),
    PromptLengthError,
  );
});