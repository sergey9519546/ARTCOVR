/**
 * Catalog rights auditor — generated from the DATA schema, not from contract
 * prose. The plan's adversary proved why: .agent-state/PRODUCT_CONTRACT.md
 * states the rights gate in snake_case while catalog/approved-artworks.json
 * uses camelCase; an auditor written from the contract reports 0 approved on a
 * fully-approved catalog — fail-closed and indistinguishable from a real
 * rights emergency. Here the artefact's own key set is ground truth, contract
 * spellings are resolved through one alias map, and a spelling that matches
 * nothing while its sibling matches everything is emitted as
 * CONTRACT_FIELD_DRIFT instead of silently zeroing the catalog.
 *
 * "0 approved" on a non-empty catalog is defined as a FAILURE OF THE AUDITOR
 * (exit 3): it is exactly the false-emergency class this tool exists to
 * prevent, and it must never be reported as a clean fail-closed result.
 *
 * Modes:
 *   (default)  human report: totals, tiers, publishable count, drift findings
 *   --gate     exit non-zero when any entry fails rights/published/price,
 *              naming the offending slugs; called by .githooks/pre-push.
 *
 * FAIL-MODE: closed — unreadable catalog, empty catalog, or auditor
 * self-inconsistency all exit non-zero. When the file is unreachable (e.g. the
 * E:-hosted gitdir is unmounted and the tree is incomplete) the reason names
 * the path; no PASS is ever emitted in that state.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CATALOG = path.join(ROOT, "catalog", "approved-artworks.json");
const CONTRACT = path.join(ROOT, ".agent-state", "PRODUCT_CONTRACT.md");
const GATE = process.argv.includes("--gate");

/** One alias map, one place. Exact data key wins. */
const ALIASES = {
  rightsApproved: ["rightsApproved", "rights_approved"],
  published: ["published"],
  priceCents: ["priceCents", "price_cents"],
};

function die(code, reason) {
  console.error(`[rights-audit] FAIL: ${reason}`);
  process.exit(code);
}

let rows;
try {
  rows = JSON.parse(readFileSync(CATALOG, "utf8"));
} catch (cause) {
  die(2, `catalog unreadable at ${CATALOG} (${cause.code ?? cause.message}) — cannot confirm rights; refusing to pass.`);
}
if (!Array.isArray(rows) || rows.length === 0) die(2, `catalog at ${CATALOG} is empty or not an array — refusing to pass.`);

const dataKeys = new Set(rows.flatMap((row) => Object.keys(row)));

function resolveKey(canonical) {
  for (const spelling of ALIASES[canonical]) if (dataKeys.has(spelling)) return spelling;
  return null;
}

const keyOf = {};
const drift = [];
for (const canonical of Object.keys(ALIASES)) {
  const resolved = resolveKey(canonical);
  if (!resolved) die(2, `no spelling of "${canonical}" (${ALIASES[canonical].join("/")}) exists in the data — schema changed under the auditor; refusing to pass.`);
  keyOf[canonical] = resolved;
}

// Contract drift: a spelling the contract uses that matches zero entries while
// a sibling spelling matches N>0 is a first-class finding, never a zeroing.
let contract = "";
try {
  contract = readFileSync(CONTRACT, "utf8");
} catch {
  drift.push({ finding: "CONTRACT_UNREADABLE", path: CONTRACT });
}
for (const [canonical, spellings] of Object.entries(ALIASES)) {
  for (const spelling of spellings) {
    if (spelling === keyOf[canonical]) continue;
    if (contract.includes(spelling)) {
      drift.push({
        finding: "CONTRACT_FIELD_DRIFT",
        contractSpelling: spelling,
        dataSpelling: keyOf[canonical],
        note: `PRODUCT_CONTRACT.md says "${spelling}"; the data says "${keyOf[canonical]}" (${rows.length} entries).`,
      });
    }
  }
}

const offenders = [];
let approved = 0;
const tiers = {};
for (const row of rows) {
  const slug = row.slug ?? row.id ?? "(unidentified)";
  tiers[row.tier ?? "(none)"] = (tiers[row.tier ?? "(none)"] ?? 0) + 1;
  const failures = [];
  if (row[keyOf.rightsApproved] !== true) failures.push(`${keyOf.rightsApproved}=${JSON.stringify(row[keyOf.rightsApproved])}`);
  if (row[keyOf.published] !== true) failures.push(`${keyOf.published}=${JSON.stringify(row[keyOf.published])}`);
  if (!(Number(row[keyOf.priceCents]) > 0)) failures.push(`${keyOf.priceCents}=${JSON.stringify(row[keyOf.priceCents])}`);
  if (failures.length > 0) offenders.push({ slug, failures });
  else approved += 1;
}

// The auditor's own sanity: a fully-populated catalog reporting zero approved
// means the AUDITOR is wrong (the drift class), not the catalog.
if (approved === 0) die(3, `0 of ${rows.length} entries pass — on a populated catalog this indicates auditor/schema drift, not a rights emergency. Refusing to certify either way.`);

const publishable = rows.filter((row) => row.tier !== "delete").length;

const report = {
  catalog: path.relative(ROOT, CATALOG),
  total: rows.length,
  approved,
  tiers,
  publishable,
  offenders: offenders.length,
  drift,
};

if (GATE) {
  if (offenders.length > 0) {
    console.error(`[rights-audit] GATE DENY: ${offenders.length} entr${offenders.length === 1 ? "y" : "ies"} fail rights/published/price:`);
    for (const o of offenders) console.error(`  - ${o.slug}: ${o.failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`[rights-audit] gate pass: ${approved}/${rows.length} approved, ${publishable} publishable${drift.length ? `, ${drift.length} contract-drift finding(s) (non-blocking)` : ""}`);
  process.exit(0);
}

console.log(JSON.stringify(report, null, 2));
process.exit(offenders.length > 0 ? 1 : 0);
