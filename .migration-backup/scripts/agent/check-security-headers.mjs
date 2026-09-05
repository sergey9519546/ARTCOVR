/**
 * Gate G7 (.agent-state/RELEASE_GATES.md): security headers.
 *
 * G7 could never be certified because its Command column named `vercel.json`
 * plus prose — there was nothing to execute, so the release-gate runner
 * recorded NOT RUN by definition. This makes the gate real.
 *
 * Static by design: it asserts the deployed configuration in vercel.json rather
 * than probing a URL, so it runs in CI with no network and no credentials and
 * catches a bad header before it ships. Pass --url=https://host to additionally
 * verify a live deployment actually serves them.
 *
 *   node scripts/agent/check-security-headers.mjs
 *   node scripts/agent/check-security-headers.mjs --url=https://artcovr.vercel.app
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const failures = [];
const checked = [];

function require_(condition, message) {
  if (condition) checked.push(message);
  else failures.push(message);
}

const vercel = JSON.parse(await readFile(path.join(projectRoot, "vercel.json"), "utf8"));
const rules = Array.isArray(vercel.headers) ? vercel.headers : [];

const globalRule = rules.find((rule) => rule.source === "/(.*)");
if (!globalRule) {
  failures.push("vercel.json has no site-wide header rule matching /(.*)");
} else {
  const headers = new Map(globalRule.headers.map((h) => [h.key.toLowerCase(), h.value]));

  // Required site-wide headers and the property each one has to actually carry.
  // Presence alone is not enough: a CSP with an unsafe directive is worse than
  // none, because it reads as protection.
  const csp = headers.get("content-security-policy") ?? "";
  require_(csp.length > 0, "Content-Security-Policy is present");
  require_(/(^|;)\s*default-src\s+'self'/.test(csp), "CSP default-src is 'self'");
  require_(/frame-ancestors\s+'none'/.test(csp), "CSP frame-ancestors is 'none'");
  require_(/object-src\s+'none'/.test(csp), "CSP object-src is 'none'");
  require_(/base-uri\s+'self'/.test(csp), "CSP base-uri is 'self'");
  require_(!/script-src[^;]*'unsafe-eval'/.test(csp), "CSP script-src does not allow 'unsafe-eval'");

  require_(headers.get("x-frame-options") === "DENY", "X-Frame-Options is DENY");
  require_(headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options is nosniff");
  require_(/max-age=\d+/.test(headers.get("strict-transport-security") ?? ""), "HSTS carries a max-age");
  require_((headers.get("referrer-policy") ?? "").length > 0, "Referrer-Policy is set");
  require_((headers.get("cross-origin-opener-policy") ?? "").length > 0, "Cross-Origin-Opener-Policy is set");
  require_((headers.get("permissions-policy") ?? "").length > 0, "Permissions-Policy is set");
}

// Private surfaces must never be cached by a shared proxy or indexed. These are
// the routes that can render account-scoped or purchase-scoped material.
const PRIVATE_SOURCES = ["/api/(.*)", "/auth/(.*)", "/checkout/(.*)", "/my-images", "/sign-in"];
for (const source of PRIVATE_SOURCES) {
  const rule = rules.find((r) => r.source === source);
  if (!rule) {
    failures.push(`${source} has no header rule (private routes must be no-store + noindex)`);
    continue;
  }
  const headers = new Map(rule.headers.map((h) => [h.key.toLowerCase(), h.value]));
  require_(/no-store/.test(headers.get("cache-control") ?? ""), `${source} is Cache-Control: no-store`);
  require_(/noindex/.test(headers.get("x-robots-tag") ?? ""), `${source} is X-Robots-Tag: noindex`);
}

// Optional live probe. Off by default so the gate stays runnable offline.
const urlArg = process.argv.find((a) => a.startsWith("--url="));
if (urlArg) {
  const target = urlArg.slice("--url=".length);
  try {
    const response = await fetch(target, { redirect: "manual" });
    for (const key of ["content-security-policy", "x-frame-options", "x-content-type-options", "strict-transport-security"]) {
      require_(Boolean(response.headers.get(key)), `live ${target} serves ${key}`);
    }
  } catch (error) {
    failures.push(`live probe of ${target} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(JSON.stringify({
  gate: "G7",
  source: "vercel.json",
  liveProbe: urlArg ? urlArg.slice("--url=".length) : null,
  passed: checked.length,
  failed: failures.length,
  failures,
}, null, 2));

if (failures.length > 0) process.exit(1);
