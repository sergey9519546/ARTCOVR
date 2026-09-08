"""Apply an explicit owner keep-list to a private archive review batch."""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--keep-ranks", required=True, help="Comma-separated original review ranks")
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    output = manifest_path.parent
    payload = load_json(manifest_path)
    candidates = list(payload.get("candidates", []))
    requested_ranks = [int(value.strip()) for value in args.keep_ranks.split(",") if value.strip()]
    keep_rank_set = set(requested_ranks)
    if len(keep_rank_set) != len(requested_ranks):
        raise RuntimeError("--keep-ranks contains duplicates.")
    by_rank = {int(row["selectionRank"]): row for row in candidates}
    missing_ranks = sorted(keep_rank_set - set(by_rank))
    if missing_ranks:
        raise RuntimeError(f"Keep ranks are absent from the manifest: {missing_ranks}")

    kept = [by_rank[rank] for rank in requested_ranks]
    rejected = [row for row in candidates if int(row["selectionRank"]) not in keep_rank_set]
    kept_ids = {str(row["id"]) for row in kept}
    for row in kept:
        row["ownerReviewDecision"] = "keep"
        row["originalSelectionRank"] = int(row["selectionRank"])

    owner_decisions = {
        "schemaVersion": 1,
        "purpose": "private owner keep-only decision for archive expansion batch",
        "kept": [
            {"id": row["id"], "originalReviewRank": int(row["selectionRank"]), "ownerDecision": "keep"}
            for row in kept
        ],
        "excluded": [
            {
                "id": row["id"],
                "originalReviewRank": int(row["selectionRank"]),
                "ownerDecision": "reject",
                "reason": "not included in owner's explicit keep-only ranks",
            }
            for row in rejected
        ],
    }
    (output / "owner-exclusions.private.json").write_text(
        json.dumps(owner_decisions, indent=2) + "\n", encoding="utf-8"
    )

    removed_derivatives = 0
    output_resolved = output.resolve()
    for row in rejected:
        source_path = Path(str(row.get("sourcePath") or ""))
        try:
            resolved = source_path.resolve()
        except OSError:
            continue
        if resolved.is_relative_to(output_resolved) and resolved.is_file():
            resolved.unlink()
            removed_derivatives += 1

    for path in output.glob("contact-sheet-*.jpg"):
        path.unlink()

    font = ImageFont.load_default(size=18)
    thumb = 220
    label = 44
    columns = min(7, len(kept))
    rows = math.ceil(len(kept) / columns)
    canvas = Image.new("RGB", (columns * thumb, rows * (thumb + label)), "#f2f0e9")
    draw = ImageDraw.Draw(canvas)
    for index, row in enumerate(kept):
        x = (index % columns) * thumb
        y = (index // columns) * (thumb + label)
        with Image.open(row["sourcePath"]) as opened:
            image = ImageOps.fit(ImageOps.exif_transpose(opened).convert("RGB"), (thumb, thumb), Image.Resampling.LANCZOS)
        canvas.paste(image, (x, y))
        original_rank = int(row["selectionRank"])
        pool = str(row["sourcePool"]).replace("_pending_review", "").replace("_", " ")[:22]
        draw.rectangle((x, y + thumb, x + thumb, y + thumb + label), fill="#f2f0e9")
        draw.text((x + 5, y + thumb + 3), f"{original_rank:03d}  {pool}", font=font, fill="#111111")
        draw.text((x + 5, y + thumb + 23), str(row["id"])[-8:], font=font, fill="#555555")
    sheet_name = "contact-sheet-01.jpg"
    canvas.save(output / sheet_name, "JPEG", quality=90, optimize=True)

    original_requested = int(payload.get("requestedCount") or len(candidates))
    payload["originalRequestedCount"] = original_requested
    payload["requestedCount"] = len(kept)
    payload["originalSelectedCount"] = len(candidates)
    payload["selectedCount"] = len(kept)
    payload["ownerKeepRanks"] = requested_ranks
    payload["ownerKeepCount"] = len(kept)
    payload["ownerPrunedCount"] = len(rejected)
    payload["poolCounts"] = dict(sorted(Counter(row["sourcePool"] for row in kept).items()))
    payload["colorCounts"] = dict(sorted(Counter(
        family for row in kept for family in row["analysis"]["colorFamilies"][:1]
    ).items()))
    payload["reviewFlagCounts"] = dict(sorted(Counter(
        flag for row in kept for flag in row.get("reviewFlags", [])
    ).items()))
    payload["contactSheets"] = [sheet_name]
    payload["derivedSquareMasterCount"] = sum(
        1 for row in kept if Path(str(row["sourcePath"])).resolve().is_relative_to(output_resolved)
    )
    payload["candidates"] = kept
    coverage = payload.get("connectedMetadataCoverage")
    if isinstance(coverage, dict):
        coverage["matched"] = sum(row.get("connectedMetadata", {}).get("status") == "matched" for row in kept)
        coverage["unmatched"] = sum(row.get("connectedMetadata", {}).get("status") == "unmatched" for row in kept)
    manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    rejection_path = output / "rejections.private.json"
    rejection_payload = load_json(rejection_path) if rejection_path.is_file() else {}
    rejection_payload["owner"] = owner_decisions["excluded"]
    rejection_path.write_text(json.dumps(rejection_payload, indent=2) + "\n", encoding="utf-8")

    review_csv = output / "archive-expansion-500-review.csv"
    with review_csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "id", "source_pool", "proposed_title", "proposed_slug", "palette", "machine_moods", "review_flags", "rights_approved", "publication_approved", "sale_mode", "price_usd", "decision"])
        for row in kept:
            writer.writerow([
                row["selectionRank"], row["id"], row["sourcePool"], row["proposed"]["title"], row["proposed"]["slug"],
                "; ".join(row["analysis"]["palette"]), "; ".join(row["proposed"]["moodTags"]),
                "; ".join(row.get("reviewFlags", [])), "", "", "", "", "keep",
            ])

    connected_csv = output / "connected-metadata-review.csv"
    if connected_csv.is_file():
        with connected_csv.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["rank", "id", "source_pool", "status", "corpus_index", "fasttext_title", "fasttext_tags", "fasttext_confidence", "embedding_dimension", "embedding_sha256"])
            for row in kept:
                connected = row.get("connectedMetadata") or {}
                fasttext = connected.get("fastText") or {}
                embedding = connected.get("embedding") or {}
                writer.writerow([
                    row["selectionRank"], row["id"], row["sourcePool"], connected.get("status"),
                    connected.get("corpusIndex", ""), fasttext.get("ai_title", ""),
                    "; ".join(fasttext.get("ai_tags") or []), fasttext.get("ai_confidence", ""),
                    embedding.get("dimension", ""), embedding.get("sha256Float32LittleEndian", ""),
                ])

    vector_path = output / "connected-vectors.private.json"
    if vector_path.is_file():
        vector_payload = load_json(vector_path)
        vectors = vector_payload.get("vectorsByArtworkId", {})
        vector_payload["vectorsByArtworkId"] = {key: value for key, value in vectors.items() if key in kept_ids}
        vector_payload["matchedCount"] = len(vector_payload["vectorsByArtworkId"])
        vector_path.write_text(json.dumps(vector_payload, separators=(",", ":")) + "\n", encoding="utf-8")

    print(json.dumps({
        "manifest": str(manifest_path),
        "originalCount": len(candidates),
        "keptCount": len(kept),
        "prunedCount": len(rejected),
        "keptOriginalRanks": requested_ranks,
        "removedGeneratedDerivatives": removed_derivatives,
        "sourceMastersDeleted": 0,
        "contactSheets": 1,
    }, indent=2))


if __name__ == "__main__":
    main()
