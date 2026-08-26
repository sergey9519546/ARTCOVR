/**
 * Git-native quality gate. Called by .githooks/pre-commit and .githooks/pre-push
 * (activated via `git config core.hooksPath .githooks`).
 *
 * Enforcement lives HERE — in git's own synchronous hook path — rather than in
 * a Claude Code PreToolUse hook, because a killed PreToolUse hook does not
 * deny, it manufactures green, and a tool-name matcher is invisible to other
 * shells and to string-spliced commands. Git hooks are invariant under tool
 * identity and quoting, and have no timeout.
 *
 * FAIL-MODE: closed. Any spawn failure, unresolvable runtime, or non-zero
 * child exit denies the operation. The only sanctioned bypass is the
 * environment variable ARTCOVR_GATE=off, which writes an auditable "bypass"
 * row before exiting 0 (and which doctor flags while set).
 *
 * Phases:
 *   pre-commit : bun run typecheck && bun run test          (~16s measured)
 *   pre-push   : bun run lint && bun run catalog:launch:check
 *                && node scripts/agent/rights-audit.mjs --gate
 *                (push to artcovr-storefront IS the deploy on this project,
 *                 so the 45s lint belongs at push frequency, not commit)
 *
 * Every decision appends one complete JSONL row to
 * C:\Users\serge\.claude\logs\artcovr-gate.jsonl — on C:, outside both repos,
 * so the log survives an unmounted E: and is never part of any working tree.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const phase = process.argv[2];
const started = Date.now();
const LOG_DIR = path.join(homedir(), ".claude", "logs");
const LOG = path.join(LOG_DIR, "artcovr-gate.jsonl");
const ROTATE_BYTES = 5 * 1024 * 1024;

function log(row) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    try {
      if (existsSync(LOG) && statSync(LOG).size > ROTATE_BYTES) {
        renameSync(LOG, `${LOG}.1`);
      }
    } catch {
      /* rotation is best-effort; the append below is not */
    }
    appendFileSync(
      LOG,
      JSON.stringify({ v: 1, ts: new Date().toISOString(), actor: `git-${phase}`, ...row, durationMs: Date.now() - started }) + "\n",
    );
  } catch {
    // Logging must never turn a pass into a fail or mask a deny.
  }
}

function fail(reason) {
  log({ vector: "git", decision: "deny", reason });
  console.error(`[gate] DENY (${phase}): ${reason}`);
  console.error("[gate] Fix the failure, or set ARTCOVR_GATE=off for one audited bypass.");
  process.exit(1);
}

if (phase !== "pre-commit" && phase !== "pre-push") {
  fail(`unknown-phase:${phase ?? "none"}`);
}

if (process.env.ARTCOVR_GATE === "off") {
  log({ vector: "git", decision: "bypass", reason: "ARTCOVR_GATE=off" });
  console.error(`[gate] BYPASS (${phase}): ARTCOVR_GATE=off — this is recorded.`);
  process.exit(0);
}

/** Explicit known location first, then PATH; unresolvable denies (fail closed). */
function resolveBun() {
  const cherry = "C:\\Users\\serge\\.cherrystudio\\bin\\bun.exe";
  if (existsSync(cherry)) return cherry;
  const probe = spawnSync("bun", ["--version"], { shell: false, encoding: "utf8" });
  if (probe.status === 0) return "bun";
  return null;
}

const bun = resolveBun();
if (!bun) fail("preflight:bun-unresolvable");

function run(label, command, args) {
  const child = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (child.error) fail(`${label}:spawn-error:${child.error.code ?? child.error.message}`);
  if (child.status !== 0) fail(`${label}:exit-${child.status}`);
}

if (phase === "pre-commit") {
  run("typecheck", bun, ["run", "typecheck"]);
  run("test", bun, ["run", "test"]);
} else {
  run("lint", bun, ["run", "lint"]);
  run("catalog-launch-check", bun, ["run", "catalog:launch:check"]);
  run("rights-audit", process.execPath, ["scripts/agent/rights-audit.mjs", "--gate"]);
}

log({ vector: "git", decision: "pass", reason: "all-checks-green" });
process.exit(0);
