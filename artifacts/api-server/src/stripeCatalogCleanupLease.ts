import { randomUUID } from "node:crypto";
import {
  open,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";

export const STRIPE_CATALOG_CLEANUP_LEASE_TTL_MS = 30 * 60_000;
const DEFAULT_LEASE_PATH = "/tmp/artcovr-stripe-catalog-cleanup-lease.json";

export type StripeCatalogCleanupLeaseDetails = {
  operationId: string;
  pid: number | null;
  acquiredAt: string;
  expiresAt: string;
};

export type StripeCatalogCleanupLease = {
  details: StripeCatalogCleanupLeaseDetails;
  refresh: () => Promise<void>;
  release: () => Promise<void>;
};

export class StripeCatalogCleanupLeaseError extends Error {
  readonly activeOperation: StripeCatalogCleanupLeaseDetails;

  constructor(activeOperation: StripeCatalogCleanupLeaseDetails) {
    super(
      `Stripe catalog cleanup ${activeOperation.operationId} already holds the operation lease until ${activeOperation.expiresAt}.`,
    );
    this.name = "StripeCatalogCleanupLeaseError";
    this.activeOperation = activeOperation;
  }
}

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readLeaseDetails(
  leasePath: string,
  ttlMs: number,
): Promise<StripeCatalogCleanupLeaseDetails> {
  try {
    return JSON.parse(
      await readFile(leasePath, "utf8"),
    ) as StripeCatalogCleanupLeaseDetails;
  } catch (error) {
    const file = await stat(leasePath);
    const acquiredAt = file.mtime;
    return {
      operationId: "unknown",
      pid: null,
      acquiredAt: acquiredAt.toISOString(),
      expiresAt: new Date(acquiredAt.getTime() + ttlMs).toISOString(),
    };
  }
}

export async function acquireStripeCatalogCleanupLease({
  leasePath = process.env.ARTCOVR_STRIPE_CLEANUP_LEASE_PATH ??
    DEFAULT_LEASE_PATH,
  ttlMs = STRIPE_CATALOG_CLEANUP_LEASE_TTL_MS,
  operationId = `stripe_cleanup_${randomUUID()}`,
  pid = process.pid,
  now = () => new Date(),
}: {
  leasePath?: string;
  ttlMs?: number;
  operationId?: string;
  pid?: number | null;
  now?: () => Date;
} = {}): Promise<StripeCatalogCleanupLease> {
  for (;;) {
    const acquiredAt = now();
    const details: StripeCatalogCleanupLeaseDetails = {
      operationId,
      pid,
      acquiredAt: acquiredAt.toISOString(),
      expiresAt: new Date(acquiredAt.getTime() + ttlMs).toISOString(),
    };

    try {
      const file = await open(leasePath, "wx", 0o600);
      await file.writeFile(`${JSON.stringify(details)}\n`, "utf8");
      await file.close();

      return {
        details,
        refresh: async () => {
          const active = await readLeaseDetails(leasePath, ttlMs);
          if (active.operationId !== operationId) {
            throw new StripeCatalogCleanupLeaseError(active);
          }
          const refreshedAt = now();
          details.expiresAt = new Date(
            refreshedAt.getTime() + ttlMs,
          ).toISOString();
          await writeFile(leasePath, `${JSON.stringify(details)}\n`, {
            encoding: "utf8",
            mode: 0o600,
          });
        },
        release: async () => {
          try {
            const active = await readLeaseDetails(leasePath, ttlMs);
            if (active.operationId === operationId) await unlink(leasePath);
          } catch (error) {
            if (!isFileMissingError(error)) throw error;
          }
        },
      };
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      let active: StripeCatalogCleanupLeaseDetails;
      try {
        active = await readLeaseDetails(leasePath, ttlMs);
      } catch (readError) {
        if (isFileMissingError(readError)) continue;
        throw readError;
      }
      if (new Date(active.expiresAt).getTime() > acquiredAt.getTime()) {
        throw new StripeCatalogCleanupLeaseError(active);
      }
      try {
        await unlink(leasePath);
      } catch (unlinkError) {
        if (!isFileMissingError(unlinkError)) throw unlinkError;
      }
    }
  }
}
