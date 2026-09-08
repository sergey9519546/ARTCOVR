"""Attach aligned corpus metadata and CLIP vectors to private review manifests.

Joins are exact normalized source paths only. Unmatched candidates remain explicit;
the script never guesses from filenames or generated titles.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import numpy as np


DEFAULT_CORPUS_ROOT = Path.home() / "Downloads" / "meta_ai_images"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_javascript_assignment(path: Path, prefix: str) -> Any:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw.startswith(prefix):
        raise RuntimeError(f"Unexpected JavaScript assignment in {path}.")
    return json.loads(raw[len(prefix):].rstrip(";").strip())


def normalized_path(value: str | Path, corpus_root: Path) -> str:
    path = Path(str(value))
    if not path.is_absolute():
        path = corpus_root / path
    return os.path.normcase(os.path.abspath(os.path.normpath(str(path)))).replace("\\", "/")


def vector_sha256(vector: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(vector, dtype="<f4").tobytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, action="append", required=True)
    parser.add_argument("--corpus-root", type=Path, default=DEFAULT_CORPUS_ROOT)
    args = parser.parse_args()

    corpus_root = args.corpus_root
    filenames = load_json(corpus_root / "embedding_filenames.json")["filenames"]
    metadata = load_json(corpus_root / "final_metadata.json")
    search_fields = load_json(corpus_root / "_idx_fields.json")
    fasttext = load_javascript_assignment(corpus_root / "fasttext_analysis.js", "window.fasttextAnalysis = ")
    embedding_manifest = load_json(corpus_root / "unify_embeddings_manifest.json")
    embeddings = np.load(corpus_root / "embeddings.npy", mmap_mode="r")

    expected = len(filenames)
    aligned_counts = {
        "filenames": expected,
        "metadata": len(metadata),
        "searchFields": len(search_fields),
        "fastText": len(fasttext),
        "embeddings": int(embeddings.shape[0]),
    }
    if len(set(aligned_counts.values())) != 1:
        raise RuntimeError(f"Connected corpus is not row-aligned: {aligned_counts}")
    if embeddings.ndim != 2:
        raise RuntimeError(f"Expected a 2D embedding matrix, received {embeddings.shape}.")

    path_rows: dict[str, list[int]] = {}
    for index, filename in enumerate(filenames):
        path_rows.setdefault(normalized_path(filename, corpus_root), []).append(index)

    overall_matched = 0
    overall_unmatched = 0
    outputs: list[dict[str, Any]] = []
    for manifest_path in args.manifest:
        payload = load_json(manifest_path)
        vectors: dict[str, list[float]] = {}
        csv_rows: list[list[Any]] = []
        matched = 0
        unmatched = 0
        for row in payload.get("candidates", []):
            provenance = row.get("sourceProvenance") or {}
            source_candidates = [provenance.get("originalPath"), row.get("sourcePath")]
            corpus_index: int | None = None
            for source_path in source_candidates:
                if not source_path:
                    continue
                indices = path_rows.get(normalized_path(source_path, corpus_root), [])
                if len(indices) == 1:
                    corpus_index = indices[0]
                    break

            if corpus_index is None:
                unmatched += 1
                row["connectedMetadata"] = {
                    "status": "unmatched",
                    "reason": "no unique exact normalized source-path match in aligned corpus",
                }
                csv_rows.append([row.get("selectionRank"), row.get("id"), row.get("sourcePool"), "unmatched", "", "", "", "", "", ""])
                continue

            filename = str(filenames[corpus_index])
            fasttext_row = fasttext.get(filename)
            if fasttext_row is None:
                raise RuntimeError(f"FastText row missing for aligned filename: {filename}")
            vector = np.asarray(embeddings[corpus_index], dtype=np.float32)
            if not np.isfinite(vector).all():
                raise RuntimeError(f"Embedding contains non-finite values at row {corpus_index}.")
            vector_digest = vector_sha256(vector)
            vectors[str(row["id"])] = [float(value) for value in vector]
            row["connectedMetadata"] = {
                "status": "matched",
                "matchMethod": "unique exact normalized source path",
                "corpusIndex": corpus_index,
                "corpusFilename": filename,
                "fastText": fasttext_row,
                "searchFields": search_fields[corpus_index],
                "visionMetadata": metadata[corpus_index],
                "embedding": {
                    "artifact": "connected-vectors.private.json",
                    "model": embedding_manifest.get("checkpoint"),
                    "dimension": int(vector.shape[0]),
                    "l2Norm": round(float(np.linalg.norm(vector)), 8),
                    "sha256Float32LittleEndian": vector_digest,
                },
            }
            matched += 1
            csv_rows.append([
                row.get("selectionRank"), row.get("id"), row.get("sourcePool"), "matched", corpus_index,
                fasttext_row.get("ai_title"), "; ".join(fasttext_row.get("ai_tags") or []),
                fasttext_row.get("ai_confidence"), int(vector.shape[0]), vector_digest,
            ])

        vector_payload = {
            "schemaVersion": 1,
            "purpose": "private connected CLIP vectors for archive review candidates",
            "source": {
                "artifact": str(corpus_root / "embeddings.npy"),
                "model": embedding_manifest.get("checkpoint"),
                "rows": expected,
                "dimension": int(embeddings.shape[1]),
                "alignmentManifest": str(corpus_root / "unify_embeddings_manifest.json"),
            },
            "manifest": str(manifest_path),
            "matchedCount": matched,
            "vectorsByArtworkId": vectors,
        }
        vector_path = manifest_path.parent / "connected-vectors.private.json"
        vector_path.write_text(json.dumps(vector_payload, separators=(",", ":")) + "\n", encoding="utf-8")

        csv_path = manifest_path.parent / "connected-metadata-review.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["rank", "id", "source_pool", "status", "corpus_index", "fasttext_title", "fasttext_tags", "fasttext_confidence", "embedding_dimension", "embedding_sha256"])
            writer.writerows(csv_rows)

        payload["connectedMetadataCoverage"] = {
            "schemaVersion": 1,
            "joinPolicy": "unique exact normalized source path only",
            "matched": matched,
            "unmatched": unmatched,
            "corpusRows": expected,
            "embeddingModel": embedding_manifest.get("checkpoint"),
            "vectorArtifact": vector_path.name,
            "reviewCsv": csv_path.name,
        }
        manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        overall_matched += matched
        overall_unmatched += unmatched
        outputs.append({
            "manifest": str(manifest_path),
            "matched": matched,
            "unmatched": unmatched,
            "vectorArtifact": str(vector_path),
            "reviewCsv": str(csv_path),
        })

    print(json.dumps({
        "alignedCorpusCounts": aligned_counts,
        "embeddingModel": embedding_manifest.get("checkpoint"),
        "embeddingDimension": int(embeddings.shape[1]),
        "matched": overall_matched,
        "unmatched": overall_unmatched,
        "outputs": outputs,
    }, indent=2))


if __name__ == "__main__":
    main()
