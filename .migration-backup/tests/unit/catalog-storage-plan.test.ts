import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the private storage plan can be written from a clean checkout", async () => {
  const source = await readFile(
    new URL("../../scripts/catalog/plan-storage-upload.ts", import.meta.url),
    "utf8",
  );

  const createParent = source.indexOf("await mkdir(path.dirname(planPath), { recursive: true })");
  const createTemporaryPlan = source.indexOf("await writeFile(temporaryPath, serializedPlan");

  assert.ok(createParent >= 0, "storage planner must create its ignored output directory");
  assert.ok(
    createTemporaryPlan > createParent,
    "the exact output directory must exist before the exclusive temporary write",
  );
  assert.match(source, /flag: "wx"/);
  assert.match(source, /await rename\(temporaryPath, planPath\)/);
});

test("the storage plan reports native dimension eligibility without claiming channel readiness", async () => {
  const source = await readFile(
    new URL("../../scripts/catalog/plan-storage-upload.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /APPLE_MUSIC_MINIMUM_PX = 1400/);
  assert.match(source, /APPLE_MUSIC_RECOMMENDED_PX = 3000/);
  assert.match(source, /TUNECORE_MINIMUM_PX = 1600/);
  assert.match(source, /TUNECORE_MAXIMUM_PX = 3000/);
  assert.match(source, /nativeDimensionEligibility/);
  assert.match(source, /meetsMinimumDimensions/);
  assert.match(source, /meetsDimensionRange/);
  assert.match(source, /dimensionsOnly: true/);
  assert.match(source, /fullChannelComplianceVerified: false/);
  assert.match(source, /help\.apple\.com\/itc\/videoaudioassetguide/);
  assert.match(source, /support\.tunecore\.com/);
});
