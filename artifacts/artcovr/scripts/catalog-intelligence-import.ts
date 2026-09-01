import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  importCatalogIntelligenceBundle,
  type CatalogManifestFileInput,
} from "../src/lib/artcovr/catalog-manifest.ts";

type Family =
  | "metadata"
  | "fasttextPredictions"
  | "fasttextIndex"
  | "fasttextStats"
  | "fasttextAnalysis"
  | "search"
  | "vectors"
  | "related"
  | "duplicates";

const FAMILY_GLOBALS: Record<Family, readonly string[]> = {
  metadata: ["metadata", "metadataChunks", "metadataChunk", "catalogMetadata"],
  fasttextPredictions: ["fasttextPredictions", "predictions"],
  fasttextIndex: ["fasttextIndex", "index"],
  fasttextStats: ["fasttextStats", "stats"],
  fasttextAnalysis: ["fasttextAnalysis", "analysis"],
  search: ["search", "searchIndex", "search_index"],
  vectors: ["vectors", "embeddings", "embedding"],
  related: ["related", "similar", "similarData"],
  duplicates: ["duplicates", "duplicateGroups"],
};

const FAMILY_BY_PATH: Record<string, Family> = {
  "fasttext_predictions.js": "fasttextPredictions",
  "fasttext_index.js": "fasttextIndex",
  "fasttext_stats.js": "fasttextStats",
  "fasttext_analysis.js": "fasttextAnalysis",
  "search_index.js": "search",
  "embeddings.js": "vectors",
  "similar.js": "related",
  "duplicates.js": "duplicates",
};

type ImportOptions = {
  bundleDir: string;
  manifestFile: string;
  catalogFile: string;
  sourceVersion: string;
  outFile: string;
  expectedCorpusSize: number;
};

function usage(): string {
  return [
    "Usage:",
    "  catalog-intelligence-import --bundle-dir DIR --manifest FILE",
    "    --catalog-file FILE --source-version REV --out FILE",
    "",
    "Optional:",
    "  --expected-corpus-size N    Defaults to the full 22,260-record corpus.",
  ].join("\n");
}

function flag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.\n${usage()}`);
  return value;
}

function optionalFlag(name: string, fallback: string): string {
  return process.argv.includes(name) ? flag(name) : fallback;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseOptions(): ImportOptions {
  const required = [
    "--bundle-dir",
    "--manifest",
    "--catalog-file",
    "--source-version",
    "--out",
  ];
  if (required.some((name) => !process.argv.includes(name))) {
    throw new Error(`Missing required import option.\n${usage()}`);
  }

  return {
    bundleDir: resolve(flag("--bundle-dir")),
    manifestFile: resolve(flag("--manifest")),
    catalogFile: resolve(flag("--catalog-file")),
    sourceVersion: flag("--source-version"),
    outFile: resolve(flag("--out")),
    expectedCorpusSize: positiveInteger(
      optionalFlag("--expected-corpus-size", "22260"),
      "--expected-corpus-size",
    ),
  };
}

async function filesInDirectory(root: string): Promise<CatalogManifestFileInput[]> {
  const files: CatalogManifestFileInput[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push({
          path: relative(root, absolute).replaceAll("\\", "/"),
          content: await readFile(absolute),
        });
      }
    }
  }

  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function payloadNames(family: Family): string[] {
  return [...new Set([family, ...FAMILY_GLOBALS[family]])];
}

class DeclarativeAssignmentParser {
  private index = 0;
  private depth = 0;

  constructor(
    private readonly source: string,
    private readonly path: string,
    private readonly allowedNames: ReadonlySet<string>,
  ) {}

  parse(): unknown {
    this.skipIgnored();
    const first = this.identifier("assignment target");
    let payloadName: string;
    if (first === "window" || first === "self" || first === "globalThis") {
      this.skipIgnored();
      this.expect(".");
      this.skipIgnored();
      payloadName = this.identifier("payload name");
    } else if (first === "const" || first === "let" || first === "var") {
      this.skipIgnored();
      payloadName = this.identifier("payload name");
    } else {
      this.fail("Payload must use a window/global assignment or a const/let/var declaration");
    }
    if (!this.allowedNames.has(payloadName)) {
      this.fail(
        `Unexpected payload name ${payloadName}; expected one of ${[...this.allowedNames].join(", ")}`,
      );
    }

    this.skipIgnored();
    this.expect("=");
    const value = this.value();
    this.skipIgnored();
    if (this.source[this.index] === ";") {
      this.index += 1;
      this.skipIgnored();
    }
    if (this.index !== this.source.length) {
      this.fail("Executable expressions or additional statements are not allowed");
    }
    return value;
  }

  private value(): unknown {
    this.skipIgnored();
    if (this.depth >= 200) this.fail("Payload nesting exceeds 200 levels");
    this.depth += 1;
    try {
      const character = this.source[this.index];
      if (character === "{") return this.object();
      if (character === "[") return this.array();
      if (character === "\"" || character === "'") return this.string();
      if (character === "-" || this.isDigit(character)) return this.number();

      const keyword = this.identifier("literal");
      if (keyword === "true") return true;
      if (keyword === "false") return false;
      if (keyword === "null") return null;
      this.fail(`Unsupported literal ${keyword}`);
    } finally {
      this.depth -= 1;
    }
  }

  private object(): Record<string, unknown> {
    this.expect("{");
    const result: Record<string, unknown> = Object.create(null);
    const keys = new Set<string>();
    this.skipIgnored();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return result;
    }

    while (this.index < this.source.length) {
      this.skipIgnored();
      const character = this.source[this.index];
      const key = character === "\"" || character === "'"
        ? this.string()
        : this.identifier("object key");
      if (keys.has(key)) this.fail(`Duplicate object key ${key}`);
      keys.add(key);
      this.skipIgnored();
      this.expect(":");
      result[key] = this.value();
      this.skipIgnored();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return result;
      }
      this.expect(",");
      this.skipIgnored();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return result;
      }
    }
    this.fail("Unterminated object literal");
  }

  private array(): unknown[] {
    this.expect("[");
    const result: unknown[] = [];
    this.skipIgnored();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return result;
    }

    while (this.index < this.source.length) {
      result.push(this.value());
      this.skipIgnored();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return result;
      }
      this.expect(",");
      this.skipIgnored();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return result;
      }
    }
    this.fail("Unterminated array literal");
  }

  private string(): string {
    const quote = this.source[this.index];
    this.index += 1;
    let result = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === quote) return result;
      if (character === "\n" || character === "\r") {
        this.fail("Unescaped newline in string literal");
      }
      if (character !== "\\") {
        result += character;
        continue;
      }

      if (this.index >= this.source.length) this.fail("Unterminated string escape");
      const escaped = this.source[this.index];
      this.index += 1;
      const escapes: Record<string, string> = {
        "\"": "\"",
        "'": "'",
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
        v: "\v",
        "0": "\0",
      };
      if (escaped in escapes) {
        result += escapes[escaped];
        continue;
      }
      if (escaped === "u" || escaped === "x") {
        const length = escaped === "u" ? 4 : 2;
        const hex = this.source.slice(this.index, this.index + length);
        if (!new RegExp(`^[a-fA-F0-9]{${length}}$`).test(hex)) {
          this.fail(`Invalid \\${escaped} escape`);
        }
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.index += length;
        continue;
      }
      this.fail(`Unsupported string escape \\${escaped}`);
    }
    this.fail("Unterminated string literal");
  }

  private number(): number {
    const remaining = this.source.slice(this.index);
    const match = remaining.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) this.fail("Invalid number literal");
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail("Number literal must be finite");
    return value;
  }

  private identifier(label: string): string {
    const remaining = this.source.slice(this.index);
    const match = remaining.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!match) this.fail(`Expected ${label}`);
    this.index += match[0].length;
    return match[0];
  }

  private skipIgnored(): void {
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (/\s/.test(character)) {
        this.index += 1;
        continue;
      }
      if (this.source.startsWith("//", this.index)) {
        const newline = this.source.indexOf("\n", this.index + 2);
        this.index = newline === -1 ? this.source.length : newline + 1;
        continue;
      }
      if (this.source.startsWith("/*", this.index)) {
        const close = this.source.indexOf("*/", this.index + 2);
        if (close === -1) this.fail("Unterminated block comment");
        this.index = close + 2;
        continue;
      }
      return;
    }
  }

  private expect(expected: string): void {
    if (!this.source.startsWith(expected, this.index)) {
      this.fail(`Expected ${expected}`);
    }
    this.index += expected.length;
  }

  private isDigit(value: string | undefined): boolean {
    return value !== undefined && value >= "0" && value <= "9";
  }

  private fail(message: string): never {
    throw new Error(`${message} at character ${this.index} of ${this.path}.`);
  }
}

function decodeDeclarativeFile(file: CatalogManifestFileInput, family: Family): unknown {
  if (!(file.content instanceof Uint8Array)) {
    throw new Error(`Payload ${file.path} must be read as bytes.`);
  }
  const names = payloadNames(family);
  try {
    return new DeclarativeAssignmentParser(
      Buffer.from(file.content).toString("utf8"),
      file.path,
      new Set(names),
    ).parse();
  } catch (error) {
    throw new Error(
      `Could not decode ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function decodePayload(files: readonly CatalogManifestFileInput[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const metadataChunks: unknown[] = [];

  for (const file of files) {
    const filename = basename(file.path);
    const family = file.path.startsWith("chunks/metadata_")
      ? "metadata"
      : FAMILY_BY_PATH[filename];
    if (!family) {
      throw new Error(`No decoder is registered for manifest payload ${file.path}.`);
    }

    const value = decodeDeclarativeFile(file, family);
    if (family === "metadata") {
      if (Array.isArray(value)) metadataChunks.push(...value);
      else metadataChunks.push(value);
    } else {
      if (payload[family] !== undefined) {
        throw new Error(`Manifest contains more than one ${family} payload.`);
      }
      payload[family] = value;
    }
  }

  payload.metadata = metadataChunks;
  return payload;
}

function printIssues(
  issues: readonly { code: string; message: string; path?: string }[],
): void {
  for (const issue of issues) {
    const location = issue.path ? ` (${issue.path})` : "";
    console.error(`[${issue.code}]${location} ${issue.message}`);
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readManifest(path: string): Promise<unknown> {
  try {
    return await readJson(path);
  } catch (error) {
    throw new Error(
      `[MANIFEST_INVALID] Manifest ${path} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function serializablePayload(payload: unknown): string {
  try {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new Error("decoded payload is not JSON-serializable");
    return `${serialized}\n`;
  } catch (error) {
    throw new Error(
      `Validated payload could not be serialized: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }
  const options = parseOptions();
  const [catalog, manifest, files] = await Promise.all([
    readJson(options.catalogFile),
    readManifest(options.manifestFile),
    filesInDirectory(options.bundleDir),
  ]);

  let decodedPayload: unknown;
  const result = importCatalogIntelligenceBundle({
    catalog,
    manifest,
    manifestFiles: files,
    sourceVersion: options.sourceVersion,
    options: {
      expectedCorpusSize: options.expectedCorpusSize,
      requireFullCorpus: true,
    },
    decodePayload: (verifiedFiles) => {
      decodedPayload = decodePayload(verifiedFiles);
      return decodedPayload;
    },
  });

  if (!result.ok) {
    printIssues(result.manifestVerification.issues);
    const payloadIssues = result.issues.filter(({ code }) => code !== "MANIFEST_MISMATCH");
    if (payloadIssues.length > 0) {
      console.error("Payload validation issues:");
      printIssues(payloadIssues);
    }
    throw new Error(
      result.manifestVerification.ok
        ? "Catalog intelligence import failed payload validation; no output was written."
        : "Catalog intelligence manifest verification failed; no output was written.",
    );
  }

  if (decodedPayload === undefined) {
    throw new Error("Validated import did not produce a decoded payload; no output was written.");
  }
  await writeFile(options.outFile, serializablePayload(decodedPayload), "utf8");
  console.log(
    `Imported and validated ${result.observedCorpusSize} identities across ${files.length} payload files to ${options.outFile}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export {
  decodePayload,
  filesInDirectory,
  parseOptions,
};