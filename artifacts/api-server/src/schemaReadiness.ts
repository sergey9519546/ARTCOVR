export type RequiredMigration = { hash: string; createdAt: number };

export const migrationHistoryQuery = "select hash, created_at from drizzle.__drizzle_migrations order by id";

function isValidManifest(value: unknown): value is RequiredMigration[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((entry, index) => entry !== null && typeof entry === "object" &&
    /^[a-f0-9]{64}$/.test(entry.hash) && Number.isSafeInteger(entry.createdAt) && entry.createdAt > 0 &&
    (index === 0 || entry.createdAt > value[index - 1].createdAt) &&
    value.findIndex((candidate) => candidate.hash === entry.hash) === index);
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
  const matches = Array.isArray(rows) && rows.length === requiredMigrations.length && rows.every((row, index) => {
    if (row === null || typeof row !== "object") return false;
    const applied = row as { hash?: unknown };
    const expected = requiredMigrations[index];
    // Drizzle's created_at is the time the migration was applied, while the
    // journal's createdAt is the time the migration was generated. They are
    // expected to differ; the ordered hashes are the stable identity.
    return applied.hash === expected.hash;
  });
  if (!matches) {
    throw new Error("Production startup blocked: applied migrations do not match this API build. Complete the owner-approved maintenance migration and database verification before deployment.");
  }
}
