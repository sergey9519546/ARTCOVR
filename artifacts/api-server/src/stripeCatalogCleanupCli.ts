import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditStripeCatalog,
  cleanupStripeCatalog,
  STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
  type StripeCatalogCleanupProgress,
  type StripeCatalogCleanupReport,
} from "./stripeCatalogCleanup";
import { StripeCatalogCleanupLeaseError } from "./stripeCatalogCleanupLease";

export const STRIPE_CATALOG_CLEANUP_INTERRUPTED_EXIT_CODE = 75;

type CliOptions = {
  args?: string[];
  audit?: () => Promise<StripeCatalogCleanupReport>;
  cleanup?: (options: {
    confirmation?: string;
    maxMutations?: number;
    onProgress?: (
      progress: StripeCatalogCleanupProgress,
    ) => void | Promise<void>;
  }) => Promise<StripeCatalogCleanupReport>;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

function maxMutationsFromArgs(args: string[]) {
  const inline = args.find((arg) => arg.startsWith("--max-mutations="));
  const separateIndex = args.indexOf("--max-mutations");
  const raw =
    inline?.slice("--max-mutations=".length) ??
    (separateIndex >= 0 ? args[separateIndex + 1] : undefined);
  if (separateIndex >= 0 && args[separateIndex + 1] === undefined) {
    throw new Error("--max-mutations requires a positive integer.");
  }
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--max-mutations must be a positive integer.");
  }
  return value;
}

function canonicalSelectionDiagnostic(
  report: StripeCatalogCleanupReport,
): string {
  const summary =
    report.canonicalSelection.safetyStop ??
    "Canonical catalog selection changed after cleanup";
  const changes = [...report.canonicalSelection.changes]
    .sort((left, right) => left.artworkId.localeCompare(right.artworkId))
    .map(
      (change) =>
        `${change.artworkId}: product ${change.before.canonicalProductId ?? "none"} -> ${change.after.canonicalProductId ?? "none"}, price ${change.before.canonicalPriceId ?? "none"} -> ${change.after.canonicalPriceId ?? "none"}`,
    );
  return changes.length > 0
    ? `${summary.replace(/[.\s]+$/, "")}; ${changes.join("; ")}.`
    : `${summary.replace(/[.\s]+$/, "")}.`;
}

export async function runStripeCatalogCleanupCli({
  args = process.argv.slice(2),
  audit = auditStripeCatalog,
  cleanup = cleanupStripeCatalog,
  log = console.log,
  error = console.error,
}: CliOptions = {}) {
  const confirmed = args.includes("--confirm-deactivate");
  const reconciliationOnly = args.includes("--reconcile-only");
  let maxMutations: number | undefined;
  try {
    maxMutations = maxMutationsFromArgs(args);
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }
  let report: StripeCatalogCleanupReport;
  try {
    report = reconciliationOnly
      ? await audit()
      : await cleanup({
          confirmation: confirmed
            ? STRIPE_CATALOG_DEACTIVATION_CONFIRMATION
            : undefined,
          maxMutations,
          onProgress: (progress) => {
            if (progress.status === "not_started") return;
            const last = progress.lastCompletedMutation
              ? `; last completed ${progress.lastCompletedMutation.category}/${progress.lastCompletedMutation.objectId}`
              : "";
            error(
              `Stripe catalog cleanup ${progress.status}: ${progress.completedMutations}/${progress.totalMutations} mutations${last}`,
            );
          },
        });
  } catch (cause) {
    if (cause instanceof StripeCatalogCleanupLeaseError) {
      const active = cause.activeOperation;
      error(
        `Stripe catalog cleanup already active: operation ${active.operationId}; pid ${active.pid ?? "unknown"}; acquired ${active.acquiredAt}; lease expires ${active.expiresAt}. Retry after the lease expires.`,
      );
      return STRIPE_CATALOG_CLEANUP_INTERRUPTED_EXIT_CODE;
    }
    throw cause;
  }

  const canonicalSafetyStop =
    report.canonicalSelection.safetyStop ||
    report.canonicalSelection.changes.length > 0;
  const confirmedCleanupSafetyStop = confirmed && Boolean(report.safetyStop);

  log(JSON.stringify(report, null, 2));
  if (report.progress.status === "completed") {
    error(
      `Stripe catalog cleanup completed: ${report.progress.completedMutations}/${report.progress.totalMutations} mutations.`,
    );
  } else if (report.progress.status === "interrupted") {
    error(
      `Stripe catalog cleanup resumable interruption: ${report.progress.interruptionReason ?? "rerun the cleanup to resume."}`,
    );
  }
  for (const alert of report.reconciliation.alerts) {
    const prefix =
      alert.severity === "error"
        ? "Stripe reconciliation ERROR"
        : "Stripe reconciliation warning";
    error(
      `${prefix}: order ${alert.orderId} (${alert.diagnosis}; checkout session ${alert.stripeCheckoutSessionId}; connected account mode ${report.reconciliation.connectedAccountMode})`,
    );
  }
  if (report.reconciliation.unresolvedOrderIds.length > 0) {
    error(
      `Stripe reconciliation failed: ${report.reconciliation.unresolvedOrderIds.length} unresolved live-order reference(s).`,
    );
  }
  if (canonicalSafetyStop || confirmedCleanupSafetyStop) {
    error(
      `Stripe catalog cleanup safety stop: ${
        canonicalSafetyStop
          ? canonicalSelectionDiagnostic(report)
          : `${report.safetyStop?.replace(/[.\s]+$/, "")}.`
      }`,
    );
  }
  if (!confirmed && !reconciliationOnly) {
    error(
      `Dry run only. Re-run with --confirm-deactivate to deactivate only the report's eligible duplicate objects. Use --max-mutations N to bound a long confirmed run.`,
    );
  }

  if (report.reconciliation.unresolvedOrderIds.length > 0) return 2;
  if (canonicalSafetyStop || confirmedCleanupSafetyStop) {
    return 1;
  }
  if (report.progress.status === "interrupted") {
    return STRIPE_CATALOG_CLEANUP_INTERRUPTED_EXIT_CODE;
  }
  return 0;
}

const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  process.exitCode = await runStripeCatalogCleanupCli();
}
