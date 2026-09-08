import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIT_PROMPT_MAX_LENGTH, parseEditorDraft, togglePromptClause } from "./editor-draft.ts";

test("draft recovery accepts only bounded editor text and style", () => {
  const draft = parseEditorDraft(JSON.stringify({
    prompt: "a".repeat(2001), coverTitle: "t".repeat(121), coverArtist: "A & B", styleMode: "expand",
    referenceUploadId: "stale-upload", previewUrl: "private-image", artworkId: "other-artwork",
  }));
  assert.deepEqual(draft, { prompt: "a".repeat(2000), coverTitle: "t".repeat(120), coverArtist: "A & B", styleMode: "expand" });
});

test("corrupt or unexpected stored drafts leave a usable empty editor", () => {
  const empty = { prompt: "", coverTitle: "", coverArtist: "", styleMode: "exact" };
  for (const value of [null, "", "{broken", "null", "[]", "true", '{"prompt":42,"coverTitle":{},"styleMode":"unknown"}']) {
    assert.deepEqual(parseEditorDraft(value), empty);
  }
});

test("prompt suggestions cannot bypass the server's character ceiling", () => {
  const clause = "Keep the composition.";
  const atLimit = "x".repeat(EDIT_PROMPT_MAX_LENGTH);
  assert.equal(togglePromptClause(atLimit, clause), atLimit);
  const fitting = "x".repeat(EDIT_PROMPT_MAX_LENGTH - clause.length - 1);
  assert.equal(togglePromptClause(fitting, clause), `${fitting} ${clause}`);
});

test("adding and removing a suggestion preserves multiline user instructions", () => {
  const prompt = "Title:  NIGHT / 01\nArtist: A.R.T. & Me\nKeep  the lettering.";
  const clause = "Change only the sky.";
  const added = togglePromptClause(prompt, clause);
  assert.equal(added, `${prompt} ${clause}`);
  assert.equal(togglePromptClause(added, clause), prompt);
  assert.equal(togglePromptClause(`${prompt}\n`, clause), `${prompt}\n${clause}`);
});
