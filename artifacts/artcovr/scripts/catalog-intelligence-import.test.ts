import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const importerScript = fileURLToPath(new URL("./catalog-intelligence-import.ts", import.meta.url));
const manifestScript = fileURLToPath(new URL("./catalog-intelligence-manifest.ts", import.meta.url));
const tsxExecutable = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

type Fixture = {
  root: string;
  bundleDir: string;
  catalogFile: string;
  manifestFile: string;
  outFile: string;
};

type CommandFailure = Error & {
  stdout?: string;
  stderr?: string;
};

async function runScript(script: string, arguments_: readonly string[]) {
  return execFileAsync(tsxExecutable, [script, ...arguments_], {
    maxBuffer: 2 * 1024 * 1024,
  });
}

async function commandFailure(promise: ReturnType<typeof runScript>): Promise<CommandFailure> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof Error);
    return error as CommandFailure;
  }
  throw new Error("Expected command to fail.");
}

async function createFixture(vectorDimensions = 512): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "artcovr-intelligence-import-"));
  const bundleDir = join(root, "bundle");
  const chunksDir = join(bundleDir, "chunks");
  await mkdir(chunksDir, { recursive: true });

  const catalogFile = join(root, "catalog-identities.json");
  const manifestFile = join(root, "manifest.json");
  const outFile = join(root, "catalog-intelligence.json");
  const catalog = [
    { slug: "first-work", image: "/assets/first-work.jpg" },
    { slug: "second-work", image: "/assets/second-work.jpg" },
  ];
  await writeFile(catalogFile, `${JSON.stringify(catalog)}\n`, "utf8");

  for (let index = 0; index < 23; index += 1) {
    const filename = `metadata_${String(index).padStart(4, "0")}.js`;
    const content = index === 0
      ? `window.metadata = ${JSON.stringify([
          { slug: "first-work", filename: "first-work.jpg" },
          { slug: "second-work", filename: "second-work.jpg" },
        ])};`
      : "window.metadata = [];";
    await writeFile(join(chunksDir, filename), content, "utf8");
  }

  const payloadFiles: Record<string, string> = {
    "fasttext_predictions.js":
      "window.fasttextPredictions = {'first-work.jpg': {}, 'second-work.jpg': {}};",
    "fasttext_index.js":
      "window.fasttextIndex = {style: {sample: ['first-work.jpg', 'second-work.jpg']}};",
    "fasttext_stats.js": "window.fasttextStats = {style: {sample: 2}};",
    "fasttext_analysis.js":
      "const fasttextAnalysis = {'first-work.jpg': {}, 'second-work.jpg': {}};",
    "search_index.js":
      "window.searchIndex = {slugs: ['first-work', 'second-work']};",
    "embeddings.js":
      `window.embeddings = {slugs: ['first-work', 'second-work'], dimensions: ${vectorDimensions}};`,
    "similar.js":
      "window.similar = {'first-work.jpg': {related: ['second-work.jpg']}, 'second-work.jpg': {related: []}};",
    "duplicates.js": "window.duplicates = {groups: []};",
  };
  await Promise.all(
    Object.entries(payloadFiles).map(([filename, content]) =>
      writeFile(join(bundleDir, filename), content, "utf8")
    ),
  );

  return { root, bundleDir, catalogFile, manifestFile, outFile };
}

async function generateManifest(fixture: Fixture, sourceVersion: string): Promise<void> {
  await runScript(manifestScript, [
    "generate",
    "--bundle-dir",
    fixture.bundleDir,
    "--catalog-file",
    fixture.catalogFile,
    "--source-version",
    sourceVersion,
    "--expected-corpus-size",
    "2",
    "--out",
    fixture.manifestFile,
  ]);
}

function importArguments(fixture: Fixture, sourceVersion: string): string[] {
  return [
    "--bundle-dir",
    fixture.bundleDir,
    "--catalog-file",
    fixture.catalogFile,
    "--source-version",
    sourceVersion,
    "--manifest",
    fixture.manifestFile,
    "--out",
    fixture.outFile,
    "--expected-corpus-size",
    "2",
  ];
}

test("owner CLI generates a scoped manifest and writes only a validated import", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const sourceVersion = "catalog-export@fixture-success";

  await generateManifest(fixture, sourceVersion);
  const manifest = JSON.parse(await readFile(fixture.manifestFile, "utf8")) as {
    corpus: { count: number };
  };
  assert.equal(manifest.corpus.count, 2);

  const result = await runScript(importerScript, importArguments(fixture, sourceVersion));
  assert.match(result.stdout, /Imported and validated 2 identities/);

  const output = JSON.parse(await readFile(fixture.outFile, "utf8")) as {
    metadata: unknown[];
    vectors: { dimensions: number };
  };
  assert.equal(output.metadata.length, 2);
  assert.equal(output.vectors.dimensions, 512);
});

test("manifest tampering reports the exact file and preserves existing output", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const sourceVersion = "catalog-export@fixture-tamper";

  await generateManifest(fixture, sourceVersion);
  await writeFile(join(fixture.bundleDir, "fasttext_stats.js"), "invalid JavaScript {", "utf8");
  await writeFile(fixture.outFile, "sentinel", "utf8");

  const failure = await commandFailure(
    runScript(importerScript, importArguments(fixture, sourceVersion)),
  );
  assert.match(
    failure.stderr ?? "",
    /\[MANIFEST_HASH_MISMATCH\] \(fasttext_stats\.js\)/,
  );
  assert.equal(await readFile(fixture.outFile, "utf8"), "sentinel");
});

test("malformed manifests and invalid vectors write no import output", async (context) => {
  const malformed = await createFixture();
  const invalidVector = await createFixture(128);
  context.after(async () => {
    await Promise.all([
      rm(malformed.root, { recursive: true, force: true }),
      rm(invalidVector.root, { recursive: true, force: true }),
    ]);
  });

  await writeFile(malformed.manifestFile, "{not-json", "utf8");
  const malformedFailure = await commandFailure(
    runScript(
      importerScript,
      importArguments(malformed, "catalog-export@fixture-malformed"),
    ),
  );
  assert.match(malformedFailure.stderr ?? "", /\[MANIFEST_INVALID\]/);
  await assert.rejects(readFile(malformed.outFile, "utf8"), { code: "ENOENT" });

  const sourceVersion = "catalog-export@fixture-invalid-vector";
  await generateManifest(invalidVector, sourceVersion);
  const vectorFailure = await commandFailure(
    runScript(importerScript, importArguments(invalidVector, sourceVersion)),
  );
  assert.match(
    vectorFailure.stderr ?? "",
    /Vector payload must declare 512 dimensions; received 128/,
  );
  await assert.rejects(readFile(invalidVector.outFile, "utf8"), { code: "ENOENT" });
});

test("executable payload expressions are rejected without host side effects", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const sourceVersion = "catalog-export@fixture-malicious";
  const markerFile = join(fixture.root, "decoder-escaped.txt");
  const maliciousPayload = [
    "window.fasttextStats = globalThis.constructor.constructor(",
    JSON.stringify("return process"),
    ")().getBuiltinModule('node:fs').writeFileSync(",
    JSON.stringify(markerFile),
    ", 'escaped');",
  ].join("");
  await writeFile(
    join(fixture.bundleDir, "fasttext_stats.js"),
    maliciousPayload,
    "utf8",
  );
  await generateManifest(fixture, sourceVersion);

  const failure = await commandFailure(
    runScript(importerScript, importArguments(fixture, sourceVersion)),
  );
  assert.match(
    failure.stderr ?? "",
    /Could not decode fasttext_stats\.js: Unsupported literal globalThis/,
  );
  await assert.rejects(readFile(markerFile, "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(fixture.outFile, "utf8"), { code: "ENOENT" });
});