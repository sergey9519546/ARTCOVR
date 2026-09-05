/**
 * Deployment health: is every Edge Function the storefront calls actually
 * deployed to the live Supabase project?
 *
 * WHY THIS EXISTS. On 2026-08-31 a probe of the live project found that only
 * `generate-image` of the six functions the frontend invokes was deployed.
 * `create-checkout` and `stripe-webhook` both returned 404, meaning nobody
 * could start a purchase and no payment could ever have been fulfilled. Every
 * one of the nine release gates was green at the time, because every gate
 * tests the repository — none of them looks at what is actually running.
 *
 * A static export plus a 404 backend fails silently: the storefront renders
 * perfectly, the buy button just does nothing. This closes that blind spot.
 *
 * Method: HTTP OPTIONS, a CORS preflight, which the Supabase runtime answers
 * before any business logic runs. It creates nothing, charges nothing and
 * writes nothing. 404 means not deployed; anything else means deployed.
 *
 * The expected list is derived from the frontend source, not hardcoded, so a
 * newly added call site is covered automatically.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *     node scripts/agent/check-edge-deployment.mjs
 *
 * Both variables are public by design — they ship in the browser bundle.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  indicatesDeployedFunction,
  resolveDeploymentTarget,
} from "./deployment-target.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUEST_TIMEOUT_MS = 15_000;
const PROBE_CONCURRENCY = 4;

// The deployed/undeployed signal needs no key at all — the Supabase router
// answers a preflight for a missing function with 404 before any auth runs. So
// this gate needs only the project URL, which is public. Set SUPABASE_PROJECT_REF
// (e.g. abcdefghijklmnop) or NEXT_PUBLIC_SUPABASE_URL.
let target;
try {
  target = resolveDeploymentTarget();
} catch (error) {
  console.error(`NOT RUN: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
const { url } = target;
if (!url) {
  console.error(
    "NOT RUN: set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL. Both are public " +
      "values — the URL ships in the browser bundle. This gate checks the LIVE project.",
  );
  process.exit(2);
}
// Sent only when available; the probe does not depend on it.
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Every function name the frontend actually invokes. */
async function calledByFrontend(dir, found = new Set()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await calledByFrontend(full, found);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const text = await readFile(full, "utf8");
      for (const m of text.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g)) found.add(m[1]);
      for (const m of text.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g)) found.add(m[1]);
    }
  }
  return found;
}

const fromFrontend = [...(await calledByFrontend(path.join(projectRoot, "src")))].sort();
if (fromFrontend.length === 0) {
  console.error("NOT RUN: found no Edge Function call sites in src/; the detector needs updating.");
  process.exit(2);
}

// Functions no browser ever calls, so scanning src/ cannot find them — yet an
// undeployed one is worse, not better. `stripe-webhook` undeployed means Stripe
// takes the money and fulfilment never happens; the watchdogs are what release
// stuck reservations and orphaned generation objects.
const EXTERNALLY_INVOKED = ["stripe-webhook", "generation-watchdog", "commerce-watchdog"];
const onDisk = (await readdir(path.join(projectRoot, "supabase", "functions"), { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name);
const external = EXTERNALLY_INVOKED.filter((name) => onDisk.includes(name));
const expected = [...new Set([...fromFrontend, ...external])].sort();

async function probeFunction(name) {
  let status = 0;
  let detail = "";
  try {
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = response.status;
    if (!indicatesDeployedFunction(status)) detail = (await response.text()).slice(0, 80);
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  return {
    function: name,
    calledBy: fromFrontend.includes(name) ? "storefront" : "stripe/scheduler",
    status,
    deployed: indicatesDeployedFunction(status),
    detail,
  };
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const results = await mapWithConcurrency(expected, PROBE_CONCURRENCY, probeFunction);

const missing = results.filter((r) => !r.deployed);

console.log(JSON.stringify({
  gate: "edge-deployment",
  project: url,
  targetSource: target.source,
  calledByFrontend: fromFrontend.length,
  externallyInvoked: external.length,
  deployed: results.length - missing.length,
  missing: missing.map((r) => r.function),
  results,
}, null, 2));

if (missing.length > 0) {
  console.error(
    `\nFAIL: ${missing.length} of ${expected.length} Edge Functions the storefront calls are NOT deployed: ` +
      `${missing.map((r) => r.function).join(", ")}.\n` +
      "Deploy them with `supabase functions deploy <name>` against this project. " +
      "Until then those product paths return 404 to real users while the storefront renders normally.",
  );
  process.exit(1);
}
console.error(`\nOK: all ${expected.length} Edge Functions the storefront calls are deployed.`);
