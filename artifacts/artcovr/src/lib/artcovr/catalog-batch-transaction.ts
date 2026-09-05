import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, rename, rm, writeFile } from "node:fs/promises";

export type CatalogFileReplacement = {
  target: string;
  contents: string;
};

export type CatalogAssetCopy = {
  source: string;
  target: string;
};

type StagedReplacement = CatalogFileReplacement & {
  temporary: string;
  backup: string;
  backedUp: boolean;
  committed: boolean;
};

type StagedAsset = CatalogAssetCopy & {
  temporary: string;
  committed: boolean;
};

const isMissing = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
};

const removeIfPresent = async (target: string) => {
  await rm(target, { force: true });
};

/**
 * Commits catalog JSON replacements and new protected assets as one recoverable
 * local transaction. Existing catalog files remain as backups until every new
 * file is in place; asset targets must not exist and are the only paths removed
 * during rollback.
 */
export async function commitCatalogBatch(input: {
  replacements: CatalogFileReplacement[];
  assets: CatalogAssetCopy[];
  transactionId?: string;
}): Promise<void> {
  if (input.replacements.length === 0) {
    throw new Error("A catalog batch transaction requires at least one file replacement.");
  }

  const targets = [...input.replacements, ...input.assets].map(({ target }) => target);
  if (new Set(targets).size !== targets.length) {
    throw new Error("Catalog batch transaction targets must be unique.");
  }

  const transactionId = input.transactionId ?? randomUUID();
  const replacements: StagedReplacement[] = input.replacements.map((replacement) => ({
    ...replacement,
    temporary: `${replacement.target}.${transactionId}.new`,
    backup: `${replacement.target}.${transactionId}.bak`,
    backedUp: false,
    committed: false,
  }));
  const assets: StagedAsset[] = input.assets.map((asset) => ({
    ...asset,
    temporary: `${asset.target}.${transactionId}.new`,
    committed: false,
  }));

  const rollbackErrors: unknown[] = [];
  try {
    for (const replacement of replacements) {
      if (await isMissing(replacement.target)) {
        throw new Error(`Catalog replacement target does not exist: ${replacement.target}`);
      }
      if (!(await isMissing(replacement.temporary)) || !(await isMissing(replacement.backup))) {
        throw new Error(`Catalog transaction staging path already exists for ${replacement.target}.`);
      }
      await writeFile(replacement.temporary, replacement.contents, { encoding: "utf8", flag: "wx" });
    }
    for (const asset of assets) {
      if (!(await isMissing(asset.target))) {
        throw new Error(`Refusing to overwrite protected display: ${asset.target}`);
      }
      if (!(await isMissing(asset.temporary))) {
        throw new Error(`Catalog transaction staging path already exists for ${asset.target}.`);
      }
      await copyFile(asset.source, asset.temporary, constants.COPYFILE_EXCL);
    }

    for (const replacement of replacements) {
      await rename(replacement.target, replacement.backup);
      replacement.backedUp = true;
    }
    for (const replacement of replacements) {
      await rename(replacement.temporary, replacement.target);
      replacement.committed = true;
    }
    for (const asset of assets) {
      await rename(asset.temporary, asset.target);
      asset.committed = true;
    }
  } catch (error) {
    for (const asset of [...assets].reverse()) {
      try {
        if (asset.committed) await removeIfPresent(asset.target);
        await removeIfPresent(asset.temporary);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const replacement of [...replacements].reverse()) {
      try {
        if (replacement.committed) await removeIfPresent(replacement.target);
        await removeIfPresent(replacement.temporary);
        if (replacement.backedUp) await rename(replacement.backup, replacement.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Catalog batch failed and rollback was incomplete; inspect the reported paths before retrying.",
      );
    }
    throw error;
  }

  const cleanup = await Promise.allSettled(
    replacements.map(({ backup }) => removeIfPresent(backup)),
  );
  const cleanupErrors = cleanup
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map(({ reason }) => reason);
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Catalog batch committed, but one or more transaction backups could not be removed.",
    );
  }
}
