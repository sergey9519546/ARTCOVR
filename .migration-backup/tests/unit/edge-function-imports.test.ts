import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

/**
 * Static import-resolution check for the Supabase Edge Functions.
 *
 * tsconfig.json excludes supabase/functions (they compile under Deno, not the
 * app's tsc), so a named import that the target module does not export is
 * invisible to every repo gate — Deno only throws at MODULE LOAD, i.e. on
 * deploy. That exact failure shipped once: generate-image imported
 * `mimeTypeFor` from _shared/storage.ts before storage.ts exported it, and the
 * function was dead on deploy while tests, tsc and lint stayed green.
 *
 * This test walks every .ts file under supabase/functions, collects each
 * relative named import, and asserts the target file actually exports every
 * imported name. It is deliberately regex-based (no Deno available in the
 * unit-test runner); the vacuity guard at the bottom keeps a regex regression
 * from silently turning the whole check into a no-op.
 */

const FUNCTIONS_ROOT = new URL("../../supabase/functions/", import.meta.url);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Named exports of a module: declarations plus export-brace lists. */
function exportedNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const raw of match[1].split(",")) {
      const item = raw.trim();
      if (!item) continue;
      // `orig as alias` exports the alias; a bare name exports itself.
      const alias = item.match(/^(?:type\s+)?[\w$]+\s+as\s+([\w$]+)$/);
      names.add(alias ? alias[1] : item.replace(/^type\s+/, ""));
    }
  }
  if (/export\s+default/.test(source)) names.add("default");
  return names;
}

/** Relative named imports: [{ names, specifier }] — URL/npm imports skipped. */
function relativeNamedImports(source: string): { names: string[]; specifier: string }[] {
  const out: { names: string[]; specifier: string }[] = [];
  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"(\.[^"]+)"/g,
  )) {
    const names = match[1]
      .split(",")
      .map((raw) => raw.trim())
      .filter(Boolean)
      // `orig as alias` imports orig; strip inline `type` qualifiers.
      .map((item) => item.replace(/^type\s+/, "").replace(/\s+as\s+[\w$]+$/, ""));
    out.push({ names, specifier: match[2] });
  }
  return out;
}

test("every relative named import in supabase/functions resolves to a real export", async () => {
  const root = FUNCTIONS_ROOT.pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const files = await walk(root);
  assert.ok(files.length >= 10, `expected the functions tree, found ${files.length} files`);

  const failures: string[] = [];
  let checkedEdges = 0;
  let checkedNames = 0;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const { names, specifier } of relativeNamedImports(source)) {
      const targetPath = path.resolve(path.dirname(file), specifier);
      let targetSource: string;
      try {
        targetSource = await readFile(targetPath, "utf8");
      } catch {
        failures.push(`${path.relative(root, file)}: import target missing: ${specifier}`);
        continue;
      }
      const exported = exportedNames(targetSource);
      checkedEdges += 1;
      for (const name of names) {
        checkedNames += 1;
        if (!exported.has(name)) {
          failures.push(
            `${path.relative(root, file)}: imports { ${name} } from "${specifier}", ` +
              `but that module does not export it — Deno throws at module load, ` +
              `so this function is dead on deploy.`,
          );
        }
      }
    }
  }

  assert.deepEqual(failures, []);

  // Vacuity guard: if the import regex ever stops matching, this test must
  // fail loudly instead of passing over zero checks. The tree currently has
  // well over these counts; the floor only rules out "checked nothing".
  assert.ok(checkedEdges >= 15, `only ${checkedEdges} import edges checked — matcher broken?`);
  assert.ok(checkedNames >= 40, `only ${checkedNames} imported names checked — matcher broken?`);
});

test("the checker catches the historical mimeTypeFor defect shape", () => {
  // The exact pre-fix state: generate-image named an export storage.ts lacked.
  const brokenTarget = `
    export function outputKeys(artworkId: string, generationId: string) {}
    export async function uploadPrivate(path: string) {}
  `;
  const importer = `import { outputKeys, uploadPrivate, mimeTypeFor } from "../_shared/storage.ts";`;
  const exported = exportedNames(brokenTarget);
  const [imports] = relativeNamedImports(importer);
  const missing = imports.names.filter((name) => !exported.has(name));
  assert.deepEqual(missing, ["mimeTypeFor"]);
});
