/**
 * Every environment variable the Edge Functions read must be documented in
 * supabase/.env.example, and everything documented must actually be read.
 *
 * WHY. A function deployed without a secret it needs deploys perfectly and then
 * fails at runtime, so an undocumented variable is invisible until a real user
 * hits it. `IMAGE_PROVIDER` and `OPENAI_IMAGES_ENDPOINT` were both read by
 * supabase/functions/_shared/openai-images.ts and documented nowhere; anyone
 * setting up the project from .env.example would have missed both.
 *
 * The reader is deliberately not a naive grep for Deno.env.get. Three variables
 * (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are read through
 * a requireEnv() wrapper, and a grep that missed them would have reported three
 * false "stale" entries. Both access patterns are matched.
 *
 *   node scripts/agent/check-env-contract.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const functionsDir = path.join(projectRoot, "supabase", "functions");
const examplePath = path.join(projectRoot, "supabase", ".env.example");

// Supabase injects these into every function; they are documented for the
// operator's benefit but are never something the deployer must invent.
const PLATFORM_PROVIDED = new Set(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

async function readVars(dir, found = new Set()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await readVars(full, found);
    else if (/\.(ts|mjs|js)$/.test(entry.name)) {
      const text = await readFile(full, "utf8");
      // Direct access, and the requireEnv()/optionalEnv() wrappers.
      for (const m of text.matchAll(/Deno\.env\.get\(\s*["'`]([A-Z0-9_]+)["'`]/g)) found.add(m[1]);
      for (const m of text.matchAll(/\b(?:require|optional)Env\(\s*["'`]([A-Z0-9_]+)["'`]/g)) found.add(m[1]);
    }
  }
  return found;
}

const read = [...(await readVars(functionsDir))].sort();
const documented = [...new Set(
  (await readFile(examplePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter(Boolean),
)].sort();

const undocumented = read.filter((v) => !documented.includes(v));
const unread = documented.filter((v) => !read.includes(v) && !PLATFORM_PROVIDED.has(v));

console.log(JSON.stringify({
  gate: "env-contract",
  readByFunctions: read.length,
  documented: documented.length,
  undocumented,
  documentedButUnread: unread,
}, null, 2));

const problems = [];
if (undocumented.length) {
  problems.push(
    `${undocumented.length} variable(s) read by the Edge Functions but absent from supabase/.env.example: ` +
      `${undocumented.join(", ")}. A deployer would never know to set them, and the function would fail at runtime.`,
  );
}
if (unread.length) {
  problems.push(
    `${unread.length} variable(s) documented but never read: ${unread.join(", ")}. ` +
      "Either the code dropped them or the reader needs a new access pattern — check before deleting.",
  );
}

if (problems.length) {
  console.error("\n" + problems.map((p) => `FAIL: ${p}`).join("\n"));
  process.exit(1);
}
console.error(`\nOK: ${read.length} variables read, all documented; nothing documented is unread.`);
