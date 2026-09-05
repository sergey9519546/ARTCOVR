import {
  cleanupStripeCatalog,
  STRIPE_CATALOG_DEACTIVATION_CONFIRMATION,
} from "./stripeCatalogCleanup";

const confirmed = process.argv.includes("--confirm-deactivate");
const report = await cleanupStripeCatalog({
  confirmation: confirmed
    ? STRIPE_CATALOG_DEACTIVATION_CONFIRMATION
    : undefined,
});

console.log(JSON.stringify(report, null, 2));
if (!confirmed) {
  console.error(
    `Dry run only. Re-run with --confirm-deactivate to deactivate only the report's eligible duplicate objects.`,
  );
}