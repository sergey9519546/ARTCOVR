import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const allowedTargets = new Set([
  "build-approval-workbook.mjs",
  "import-approval-workbook.mjs",
  "verify-approval-workbook.mjs",
]);
const target = process.argv[2];
if (!target || !allowedTargets.has(target)) {
  throw new Error(`Expected one workbook target: ${[...allowedTargets].join(", ")}.`);
}

process.argv.splice(1, 2, path.join(scriptDirectory, target));
await import(pathToFileURL(path.join(scriptDirectory, target)).href);
