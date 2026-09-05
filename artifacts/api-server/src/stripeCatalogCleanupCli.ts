import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditStripeCatalog,
  cleanupStripeCatalog,
  STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
  type StripeCatalogCleanupReport,
} from "./stripeCatalogCleanup";

type CliOptions = {
  args?: string[];
  audit?: () => Promise<StripeCatalogCleanupReport>;
  cleanup?: (options: {
    confirmation?: string;
  }) => Promise<StripeCatalogCleanupReport>;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export async function runStripeCatalogCleanupCli({
  args = process.argv.slice(2),
  audit = auditStripeCatalog,
  cleanup = cleanupStripeCatalog,
  log = console.log,
  error = console.error,
}: CliOptions = {}) {
  const confirmed = args.includes("--confirm-deactivate");
  const reconciliationOnly = args.includes("--reconcile-only");
  const report = reconciliationOnly
    ? await audit()
    : await cleanup({
        confirmation: confirmed
          ? STRIPE_CATALOG_DEACTIVATION_CONFIRMATION
          : undefined,
      });

  log(JSON.stringify(report, null, 2));
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
  if (!confirmed && !reconciliationOnly) {
    error(
      `Dry run only. Re-run with --confirm-deactivate to deactivate only the report's eligible duplicate objects.`,
    );
  }

  return report.reconciliation.unresolvedOrderIds.length > 0 ? 2 : 0;
}

const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  process.exitCode = await runStripeCatalogCleanupCli();
}
