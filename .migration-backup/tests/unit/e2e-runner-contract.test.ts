import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), "utf8");

test("the E2E command owns and cleans up only its spawned process trees", async () => {
  const [runner, packageJson, workflow, playwrightConfig, smoke, catalogVisual] = await Promise.all([
    read("scripts/agent/run-e2e.mjs"),
    read("package.json"),
    read(".github/workflows/ci.yml"),
    read("playwright.config.ts"),
    read("tests/e2e/smoke.spec.ts"),
    read("tests/e2e/catalog-visual.spec.ts"),
  ]);

  assert.match(packageJson, /"test:e2e": "node scripts\/agent\/run-e2e\.mjs"/);
  assert.match(packageJson, /"test:e2e:ui": "node scripts\/agent\/run-e2e\.mjs --artcovr-mode=public --ui"/);
  assert.match(runner, /spawn\(command, args, options\)/);
  assert.match(runner, /shell: false/);
  assert.match(runner, /PLAYWRIGHT_BASE_URL: baseUrl/);
  assert.match(runner, /const APP_MODES = \["public", "staging"\]/);
  assert.match(runner, /function parseArguments\(args\)/);
  assert.match(runner, /playwrightArgs\.push\(argument\)/);
  assert.match(runner, /requestedMode === "all" \? APP_MODES : \[requestedMode\]/);
  assert.match(runner, /for \(const mode of modes\)/);
  assert.match(runner, /const port = process\.env\.PLAYWRIGHT_PORT[\s\S]*await unusedPort\(\)/);
  assert.match(runner, /ARTCOVR_ALLOW_INDEXING: isStaging \? "0" : "1"/);
  assert.match(runner, /NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING: isStaging \? "1" : "0"/);
  assert.match(runner, /PLAYWRIGHT_ARTCOVR_MODE: mode/);
  assert.match(runner, /runPlaywright\(baseUrl, mode, playwrightArgs\)/);
  assert.doesNotMatch(
    runner,
    /\[playwrightCli, "test", \.\.\.process\.argv\.slice\(2\)\]/,
  );
  assert.match(runner, /function isChildRunning\(child\)/);
  assert.match(runner, /child\.exitCode === null && child\.signalCode === null/);
  assert.match(runner, /child\.kill\("SIGTERM"\)/);
  assert.match(runner, /\["\/PID", String\(pid\), "\/T", "\/F"\]/);
  assert.match(runner, /if \(isChildRunning\(child\)\) \{[\s\S]*?run\("taskkill"/);
  assert.match(runner, /process\.kill\(-pid, "SIGTERM"\)/);
  assert.match(runner, /detached: process\.platform !== "win32"/);
  assert.match(runner, /activePlaywright = runPlaywright\(baseUrl, mode, playwrightArgs\)/);
  assert.match(runner, /interruptedSignal && activePlaywright[\s\S]*terminateOwnedTree\(activePlaywright\.child/);
  assert.match(runner, /if \(port && !\(await waitForPortRelease\(port\)\)\)/);
  assert.match(runner, /left port \$\{port\} open/);
  assert.match(runner, /finally \{[\s\S]*await terminateOwnedTree/);
  assert.doesNotMatch(runner, /taskkill[\s\S]*\/IM/);
  assert.match(workflow, /owns the Next dev server process tree/);
  assert.doesNotMatch(playwrightConfig, /command: `npx /);
  assert.match(playwrightConfig, /command: `bunx next dev/);
  assert.match(playwrightConfig, /const appMode = process\.env\.PLAYWRIGHT_ARTCOVR_MODE/);
  assert.doesNotMatch(playwrightConfig, /PLAYWRIGHT_ARTCOVR_MODE \|\|/);
  assert.match(playwrightConfig, /NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING: isPrivateStaging \? "1" : "0"/);
  assert.match(smoke, /PLAYWRIGHT_ARTCOVR_MODE/);
  assert.match(smoke, /appMode === "staging"/);
  assert.match(smoke, /private routes remain noindex/);
  assert.match(catalogVisual, /curated-public\.json/);
  assert.match(catalogVisual, /curated-review\.json/);
  assert.match(catalogVisual, /appMode === "public" \? curatedPublic : curatedReview/);
});
