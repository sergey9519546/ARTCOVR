import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const bundledNodeModules = process.env.CODEX_WORKSPACE_NODE_MODULES ??
  "C:\\Users\\serge\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";

let entryPoint;
try {
  const runtimeRequire = createRequire(path.join(bundledNodeModules, "artcovr-workbook-loader.cjs"));
  entryPoint = runtimeRequire.resolve("@oai/artifact-tool");
} catch {
  throw new Error(
    "The bundled Codex spreadsheet runtime is unavailable. Set CODEX_WORKSPACE_NODE_MODULES to the dependency loader's node_modules path.",
  );
}

const artifactTool = await import(pathToFileURL(entryPoint).href);
export const FileBlob = artifactTool.FileBlob;
export const SpreadsheetFile = artifactTool.SpreadsheetFile;
export const Workbook = artifactTool.Workbook;
