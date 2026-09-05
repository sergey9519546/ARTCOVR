import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  indicatesDeployedFunction,
  resolveDeploymentTarget,
} from "../../scripts/agent/deployment-target.mjs";

const source = await readFile(
  new URL("../../scripts/agent/release-gates.mjs", import.meta.url),
  "utf8",
);
const databaseVerifierSource = await readFile(
  new URL("../../scripts/db/verify-database.sh", import.meta.url),
  "utf8",
);

test("release certification fails closed when any gate is not run", () => {
  assert.match(source, /certifications\.get\(row\.id\)\.status/);
  assert.match(source, /tally\["not-run"\] > 0 \? 1 : 0/);
  assert.doesNotMatch(source, /process\.exit\(tally\.fail > 0 \? 1 : 0\)/);
});

test("an unlogged result is tallied as not run, never as its raw outcome", () => {
  assert.match(source, /rec\.logged !== true[\s\S]*status: "not-run"/);
  assert.match(source, /const certifications = new Map/);
});

test("G8 preflight probes the verifier's disposable PostgreSQL defaults", () => {
  assert.match(source, /PGHOST: process\.env\.PGHOST \?\? "127\.0\.0\.1"/);
  assert.match(source, /PGPORT: process\.env\.PGPORT \?\? "5433"/);
  assert.match(source, /PGUSER: process\.env\.PGUSER \?\? "postgres"/);
  assert.match(source, /spawnSync\("psql", \["-w", "-tAc", "select 1"\]/);

  assert.match(databaseVerifierSource, /PGHOST="\$\{PGHOST:-127\.0\.0\.1\}"/);
  assert.match(databaseVerifierSource, /PGPORT="\$\{PGPORT:-5433\}"/);
  assert.match(databaseVerifierSource, /PGUSER="\$\{PGUSER:-postgres\}"/);
});

test("live gate status records its certified target", () => {
  assert.match(source, /new Set\(\["target", "project", "targetSource"\]\)/);
});

test("the release checklist includes the read-only live Edge deployment gate", async () => {
  const [releaseGates, packageJson, deploymentGate] = await Promise.all([
    readFile(new URL("../../.agent-state/RELEASE_GATES.md", import.meta.url), "utf8"),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/agent/check-edge-deployment.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(releaseGates, /G12: Live Edge Deployment/);
  assert.match(releaseGates, /`bun run check:deployment`/);
  assert.match(packageJson, /check:deployment[^\n]*--project-ref=gcnamdbwekikkuqvzuko/);
  assert.match(deploymentGate, /resolveDeploymentTarget/);
  assert.match(deploymentGate, /AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/);
  assert.match(deploymentGate, /PROBE_CONCURRENCY/);
});

test("the production deployment project ref cannot be replaced by ambient URL state", () => {
  assert.deepEqual(
    resolveDeploymentTarget(
      ["node", "check-edge-deployment.mjs", "--project-ref=gcnamdbwekikkuqvzuko"],
      {
        SUPABASE_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      },
    ),
    {
      url: "https://gcnamdbwekikkuqvzuko.supabase.co",
      source: "cli-project-ref",
    },
  );
});

test("deployment evidence rejects missing routes, transport failures, and server errors", () => {
  for (const status of [200, 204, 301, 400, 401, 403, 405, 422]) {
    assert.equal(indicatesDeployedFunction(status), true, `${status} reaches a deployed boundary`);
  }
  for (const status of [0, 404, 500, 502, 503]) {
    assert.equal(indicatesDeployedFunction(status), false, `${status} is not deployment proof`);
  }
});

test("the production live-storefront command pins the canonical origin", async () => {
  const packageJson = await readFile(new URL("../../package.json", import.meta.url), "utf8");
  assert.match(packageJson, /check:live[^\n]*--url=https:\/\/artcovr\.com/);
});
