import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const validatorScript = fileURLToPath(new URL("./validate-prospect-reports.ts", import.meta.url));
const tsxExecutable = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const sourceReportsDir = fileURLToPath(new URL("../reports/", import.meta.url));

type CommandFailure = Error & {
  stderr?: string;
};

test("identifies the prospect and shared field when a report drifts", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "artcovr-prospect-validator-"));
  const reportsDir = join(root, "reports");
  await mkdir(reportsDir);
  context.after(() => rm(root, { recursive: true, force: true }));

  const csvPath = join(reportsDir, "artcovr-prospect-list.csv");
  const jsonPath = join(reportsDir, "prospect-research.json");
  await Promise.all([
    copyFile(join(sourceReportsDir, "prospect-research.json"), jsonPath),
    copyFile(join(sourceReportsDir, "artcovr-prospect-list.csv"), csvPath),
  ]);

  const csv = await readFile(csvPath, "utf8");
  const driftedCsv = csv.replace(
    "ATC Management,atcmanagement.com,",
    "ATC Management,drifted.example,",
  );
  assert.notEqual(driftedCsv, csv);
  await writeFile(csvPath, driftedCsv, "utf8");

  await assert.rejects(
    execFileAsync(tsxExecutable, [validatorScript], {
      cwd: root,
      maxBuffer: 2 * 1024 * 1024,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const failure = error as CommandFailure;
      assert.match(
        failure.stderr ?? "",
        /"ATC Management" Domain differs: CSV="drifted\.example" JSON="atcmanagement\.com"/,
      );
      return true;
    },
  );
});