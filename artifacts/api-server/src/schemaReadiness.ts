export type RequiredMigration = { hash: string; createdAt: number };

type ManagedMigration = {
  id?: unknown;
  build_id?: unknown;
  deployment_id?: unknown;
  statement_count?: unknown;
  applied_at?: unknown;
};

// Replit applies the production schema during publish and records those
// operations in its managed audit table. The Drizzle history table is a
// development-database detail and is not present in production.
export const migrationHistoryQuery =
  "select id, build_id, deployment_id, statement_count, applied_at from _system.replit_database_migrations_v1 order by id";

function isValidManifest(value: unknown): value is RequiredMigration[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((entry, index) => entry !== null && typeof entry === "object" &&
    /^[a-f0-9]{64}$/.test(entry.hash) && Number.isSafeInteger(entry.createdAt) && entry.createdAt > 0 &&
    (index === 0 || entry.createdAt > value[index - 1].createdAt) &&
    value.findIndex((candidate) => candidate.hash === entry.hash) === index);
}

function isValidManagedMigration(value: unknown): value is ManagedMigration {
  if (value === null || typeof value !== "object") return false;
  const entry = value as ManagedMigration;
  const statementCount =
    typeof entry.statement_count === "number"
      ? entry.statement_count
      : typeof entry.statement_count === "string"
        ? Number(entry.statement_count)
        : Number.NaN;
  return (
    (typeof entry.id === "number" || typeof entry.id === "string") &&
    typeof entry.build_id === "string" &&
    entry.build_id.length > 0 &&
    typeof entry.deployment_id === "string" &&
    entry.deployment_id.length > 0 &&
    Number.isSafeInteger(statementCount) &&
    statementCount >= 0 &&
    (entry.applied_at instanceof Date ||
      (typeof entry.applied_at === "string" && entry.applied_at.length > 0))
  );
}

/** Read-only startup gate. Never migrate or repair a production database here. */
export async function assertProductionSchemaReady(
  nodeEnv: string | undefined,
  requiredMigrations: unknown,
  query: (text: string) => Promise<{ rows: unknown[] }>,
): Promise<void> {
  if (nodeEnv !== "production") return;
  if (!isValidManifest(requiredMigrations)) {
    throw new Error("Production startup blocked: the API migration manifest is missing or invalid. Rebuild the API.");
  }
  let rows: unknown[];
  try {
    ({ rows } = await query(migrationHistoryQuery));
  } catch {
    // Do not expose connection strings or database diagnostics in this error.
    throw new Error("Production startup blocked: migration history is unavailable. Verify database readiness before deployment.");
  }
  // Replit's production migration audit records do not contain Drizzle SQL
  // hashes. Publish owns the schema diff and records its applied statements;
  // the runtime gate verifies that this managed history exists and is
  // structurally readable rather than querying the development-only table.
  const matches =
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(isValidManagedMigration);
  if (!matches) {
    throw new Error("Production startup blocked: managed migration history is missing or invalid. Complete the owner-approved database maintenance through Publish before deployment.");
  }
}
