import assert from "node:assert/strict";
import { test } from "node:test";
import { displayFacetLabel, displayMoodLabel } from "../../components/artcovr/CatalogControls.tsx";
import { displayGenreLabel } from "./genre-index.ts";

test("genre labels preserve supported names and render prototype-property URL values as text", () => {
  assert.equal(displayGenreLabel("ambient"), "Ambient");
  assert.equal(displayGenreLabel("r-and-b-soul"), "R&B / Soul");
  for (const value of ["constructor", "toString", "hasOwnProperty", "__proto__", "unsupported-genre"]) {
    assert.equal(displayGenreLabel(value), value);
  }
});

test("mood labels preserve supported names and safely humanize unknown URL values", () => {
  assert.equal(displayMoodLabel("Mysterious__Dreamy"), "Mysterious");
  assert.equal(displayMoodLabel("Serene__Peaceful"), "Serene");
  for (const value of ["constructor", "toString", "hasOwnProperty", "__proto__", "unknown-mood"]) {
    assert.equal(displayMoodLabel(value), displayFacetLabel(value));
    assert.equal(typeof displayMoodLabel(value), "string");
  }
});
