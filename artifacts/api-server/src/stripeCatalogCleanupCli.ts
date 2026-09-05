import {
  auditStripeCatalog,
  cleanupStripeCatalog,
  STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
} from "./stripeCatalogCleanup";

const confirmed = process.argv.includes("--confirm-deactivate");
const reconciliationOnly = process.argv.includes("--reconcile-only");
const report = reconciliationOnly
  ? await auditStripeCatalog()
  : await cleanupStripeCatalog({
      confirmation: confirmed
        ? STRIPE_CATALOG_DEACTIVATION_CONFIRMATION
        : undefined,
    });

console.log(JSON.stringify(report, null, 2));
for (const alert of report.reconciliation.alerts) {
  const prefix =
    alert.severity === "error"
      ? "Stripe reconciliation ERROR"
      : "Stripe reconciliation warning";
  console.error(
    `${prefix}: order ${alert.orderId} (${alert.diagnosis}; checkout session ${alert.stripeCheckoutSessionId}; connected account mode ${report.reconciliation.connectedAccountMode})`,
  );
}
if (report.reconciliation.unresolvedOrderIds.length > 0) {
  console.error(
    `Stripe reconciliation failed: ${report.reconciliation.unresolvedOrderIds.length} unresolved live-order reference(s).`,
  );
  process.exitCode = 2;
}
if (!confirmed && !reconciliationOnly) {
  console.error(
    `Dry run only. Re-run with --confirm-deactivate to deactivate only the report's eligible duplicate objects.`,
  );
}