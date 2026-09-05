import { ANSWER_GUIDES } from "../src/lib/artcovr/answer-guides";
import {
  checkExternalGuideSource,
  validateGuideSourceDefinition,
} from "../src/lib/artcovr/guide-source-validation";

const timeoutMs = Number(process.env.ARTCOVR_GUIDE_SOURCE_TIMEOUT_MS || 10_000);
const failures: Array<{ guidePath: string; sourceTitle: string; reason: string }> = [];
let checked = 0;

if (!Number.isFinite(timeoutMs) || timeoutMs < 100) {
  console.error(
    `[guide-sources] ARTCOVR_GUIDE_SOURCE_TIMEOUT_MS must be at least 100ms; received "${process.env.ARTCOVR_GUIDE_SOURCE_TIMEOUT_MS}".`,
  );
  process.exitCode = 1;
} else {
  for (const guide of ANSWER_GUIDES) {
    for (const source of guide.sources) {
      const definitionFailure = validateGuideSourceDefinition(guide.path, source);
      if (definitionFailure) {
        failures.push({
          guidePath: guide.path,
          sourceTitle: source.title,
          reason: definitionFailure.reason,
        });
        continue;
      }

      if (source.kind === "first-party") {
        checked += 1;
        continue;
      }

      checked += 1;
      const result = await checkExternalGuideSource(source.href, fetch, timeoutMs);
      if (!result.ok) {
        failures.push({
          guidePath: guide.path,
          sourceTitle: source.title,
          reason: [
            result.reason,
            result.status === undefined ? "" : `(HTTP ${result.status})`,
            result.finalUrl && result.finalUrl !== source.href
              ? `final URL: ${result.finalUrl}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
    }
  }

  if (failures.length > 0) {
    console.error(`[guide-sources] ${failures.length} citation check(s) failed:`);
    for (const failure of failures) {
      console.error(
        `- ${failure.guidePath} — ${failure.sourceTitle}: ${failure.reason}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      `[guide-sources] checked ${checked} guide sources: first-party routes locally, external HTTPS citations over the network.`,
    );
  }
}