import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

test("native discovery preserves sorted previews and excludes helper/hidden files", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of [
    "Zebra.tsx",
    "nested/Alpha.tsx",
    "_Helper.tsx",
    "_private/Hidden.tsx",
    "nested/_Ignored.tsx",
    ".hidden/Hidden.tsx",
    ".Hidden.tsx",
    "nested/notes.txt",
  ]) {
    const destination = path.join(root, "src/components/mockups", file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "export default () => null;");
  }
  const plugin = mockupPreviewPlugin();
  plugin.configResolved({ root });
  await plugin.buildStart();
  const generatedPath = path.join(root, "src/.generated/mockup-components.ts");
  const source = await readFile(generatedPath, "utf8");
  assert.match(source, /\.\/components\/mockups\/Zebra\.tsx/);
  assert.match(source, /\.\/components\/mockups\/nested\/Alpha\.tsx/);
  assert.doesNotMatch(source, /Helper|Hidden|Ignored|notes/);
  assert.ok(source.indexOf("Zebra") < source.indexOf("Alpha"));
  await rm(path.join(root, "src/components/mockups/Zebra.tsx"));
  await plugin.buildStart();
  assert.doesNotMatch(await readFile(generatedPath, "utf8"), /Zebra/);
});

test("native discovery handles a missing mockups directory", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "empty-mockup-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = mockupPreviewPlugin();
  plugin.configResolved({ root });
  await plugin.buildStart();
  assert.match(await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8"), /modules: ModuleMap = \{\n\n\};/);
});
