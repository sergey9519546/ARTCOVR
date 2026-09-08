"""Build a private, deterministic review batch for a large archive expansion.

This script is deliberately analysis-only. It never edits the approved catalog,
copies private masters into public assets, or asserts rights/pricing/publication.
Candidates are SHA-locked, decoded, square-gated, exact-deduplicated, screened
for close perceptual duplicates, and diversity-ranked from decoded pixels.
"""

from __future__ import annotations

import argparse
import colorsys
import csv
import hashlib
import io
import json
import math
import os
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[3]
APPROVED_PATH = PROJECT_ROOT / ".migration-backup" / "catalog" / "approved-artworks.json"
COLLECTION_ROOT = Path(os.environ.get("ARTCOVR_COLLECTION_ROOT", r"E:\ART_COLLECTION"))
PRIVATE_MAP_PATH = Path(os.environ.get(
    "ARTCOVR_PRIVATE_SOURCE_MAP",
    str(COLLECTION_ROOT / ".artcovr-private" / "direct-source-map.local.json"),
))
CURATION_ROOT = Path(os.environ.get("ARTCOVR_CURATION_ROOT", str(COLLECTION_ROOT / ".artcovr-curation")))
CORPUS_ROOT = Path(os.environ.get("ARTCOVR_CORPUS_ROOT", str(Path.home() / "Downloads" / "meta_ai_images")))
DEFAULT_OUTPUT = PROJECT_ROOT / "outputs" / "catalog" / "review-assets" / "archive-expansion-2026-09-07"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
PROHIBITED_GENERATED = re.compile(r"\b(?:film[ -]?noir|noir|realism|realist|photoreal(?:ism|istic)?)\b", re.I)


@dataclass(frozen=True)
class Source:
    path: Path
    pool: str
    title_basis: str | None = None
    description_basis: str | None = None
    category_basis: str | None = None
    prompt: str | None = None
    allow_square_crop: bool = False
    source_analysis: dict[str, Any] | None = None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def slugify(value: str) -> str:
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:120]


def clean_filename(path: Path) -> str:
    stem = re.sub(r"^\d+(?:_\d+)?_?", "", path.stem)
    stem = re.sub(r"[_-]+", " ", stem).strip(" .")
    return re.sub(r"\s+", " ", stem)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def corpus_crop_inventory(prefilter: int) -> list[Source]:
    """Use the owner's aligned metadata to avoid decoding all 18k E-drive files."""
    if prefilter <= 0:
        return []
    names_payload = load_json(CORPUS_ROOT / "embedding_filenames.json")
    names = names_payload["filenames"]
    metadata = load_json(CORPUS_ROOT / "final_metadata.json")
    if len(names) != len(metadata):
        raise RuntimeError("Corpus filename and metadata arrays are not aligned.")
    prefix = "e:/art_collection/new download_collection_full/"
    ranked: list[tuple[float, Path, str, dict[str, Any]]] = []
    for name, row in zip(names, metadata):
        normalized = str(name).replace("\\", "/")
        is_direct_download = normalized.lower().startswith(prefix)
        path = Path(normalized) if is_direct_download else CORPUS_ROOT / Path(normalized)
        width = int(row.get("width") or 0)
        height = int(row.get("height") or 0)
        if min(width, height) < 1024:
            continue
        features = row.get("features") or {}
        aesthetic = float(features.get("clip_aesthetic_score") or 0.0)
        sharpness = min(float(features.get("sharpness") or 0.0) / 1500.0, 1.0)
        clipping_penalty = abs(float(features.get("brightness_score") or 128.0) - 128.0) / 255.0
        rank_score = aesthetic + 0.12 * sharpness - 0.10 * clipping_penalty
        ranked.append((rank_score, path, "new_download_square_crop" if is_direct_download else "indexed_owner_corpus", row))
    ranked.sort(key=lambda item: (-item[0], str(item[1]).lower()))
    sources: list[Source] = []
    for _, path, pool, row in ranked[:prefilter]:
        features = row.get("features") or {}
        caption = str(features.get("ai_caption") or "").strip() or None
        category_parts = [features.get("classified_medium"), features.get("classified_style")]
        category = " / ".join(str(value).strip() for value in category_parts if value)
        sources.append(Source(
            path=path,
            pool=pool,
            title_basis=clean_filename(path) or None,
            description_basis=caption,
            category_basis=category or None,
            prompt=str(row.get("original_prompt") or "").strip() or None,
            allow_square_crop=True,
            source_analysis={
                "clipAestheticScore": features.get("clip_aesthetic_score"),
                "classifiedMood": features.get("classified_mood"),
                "classifiedMedium": features.get("classified_medium"),
                "classifiedStyle": features.get("classified_style"),
                "clipSubject": features.get("clip_subject"),
                "caption": caption,
                "analysisSource": "owner corpus final_metadata.json",
            },
        ))
    return sources


def additional_owner_inventory() -> list[Source]:
    """High-resolution owner-held pools that require per-work rights approval."""
    roots = (
        (COLLECTION_ROOT / "REGENERATED_OURS_2026-08-13", "regenerated_originals_pending_review", None),
        (COLLECTION_ROOT / "CONCEPT ART_1700", "concept_art_reference_pending_review", None),
        (COLLECTION_ROOT / "Christian_surrealism", "christian_collection_pending_review", None),
        (COLLECTION_ROOT / "IMAGES_RANDOM_ART", "random_collection_pending_review", None),
        (COLLECTION_ROOT / "IMAGES_RENEICANCE_GODESS", "renaissance_collection_pending_review", None),
        (COLLECTION_ROOT / "IMAGES_ MODERN SURREALISM", "modern_surrealism_pending_review", None),
        (COLLECTION_ROOT / "IMAGES_ANIME_MUSIC", "anime_music_pending_review", None),
        (COLLECTION_ROOT / "IMAGES_GOTHIC_SURREALISM", "gothic_surrealism_pending_review", None),
        (COLLECTION_ROOT / "maybe_images", "maybe_images_pending_review", 900),
    )
    sources: list[Source] = []
    for root, pool, maximum in roots:
        accepted_from_root = 0
        for path in sorted(root.rglob("*"), key=lambda item: str(item).lower()):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            try:
                with Image.open(path) as opened:
                    width, height = opened.size
            except Exception:
                continue
            if min(width, height) < 1024:
                continue
            sources.append(Source(
                path=path,
                pool=pool,
                title_basis=clean_filename(path) or None,
                allow_square_crop=True,
                source_analysis={
                    "approvalScope": "owner-held source; per-work rights and publication review still required",
                    "inventoryDimensions": [width, height],
                },
            ))
            accepted_from_root += 1
            if maximum is not None and accepted_from_root >= maximum:
                break
    return sources


def source_inventory(crop_prefilter: int) -> list[Source]:
    sources: list[Source] = []

    generated_root = COLLECTION_ROOT / "generated_images"
    for row in load_json(generated_root / "style_library_manifest.json"):
        local_image = row.get("local_image")
        if row.get("status") != "completed" or not local_image:
            continue
        text = " ".join(str(row.get(key) or "") for key in ("primary_family", "name", "subject", "prompt"))
        if row.get("primary_family") == "Photography / Cinematic / Editorial" or PROHIBITED_GENERATED.search(text):
            continue
        sources.append(Source(
            path=generated_root / local_image,
            pool="generated_images",
            title_basis=str(row.get("name") or "").strip() or None,
            description_basis=str(row.get("subject") or "").strip() or None,
            category_basis=str(row.get("primary_family") or "").strip() or None,
            prompt=str(row.get("prompt") or "").strip() or None,
        ))

    new_meta_root = COLLECTION_ROOT / "NEW META IMAGES"
    for path in sorted(new_meta_root.iterdir(), key=lambda item: item.name.lower()):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            sources.append(Source(path=path, pool="new_meta_images"))

    updated_root = COLLECTION_ROOT / "meta_ai_generated_images_since_may11_UPDATED_full"
    updated_by_name: dict[str, dict[str, Any]] = {}
    for row in load_json(updated_root / "manifest.json"):
        name = Path(str(row.get("file") or "")).name
        if name:
            updated_by_name[name.lower()] = row
    for path in sorted((updated_root / "images").iterdir(), key=lambda item: item.name.lower()):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        row = updated_by_name.get(path.name.lower(), {})
        sources.append(Source(
            path=path,
            pool="meta_updated_images",
            title_basis=str(row.get("subject") or "").strip() or None,
            description_basis=str(row.get("subject") or "").strip() or None,
            prompt=str(row.get("alt") or "").strip() or None,
        ))

    for audit_name, pool in (
        ("concept-square1024-audit.json", "concept_reference_art"),
        ("new-download-square1024-audit.json", "new_download"),
    ):
        for row in load_json(CURATION_ROOT / audit_name):
            path = Path(str(row["path"]))
            sources.append(Source(
                path=path,
                pool=pool,
                title_basis=clean_filename(path) or None,
                description_basis=str(row.get("prompt") or "").strip() or None,
                prompt=str(row.get("prompt") or "").strip() or None,
            ))

    sources.extend(corpus_crop_inventory(crop_prefilter))
    sources.extend(additional_owner_inventory())

    unique: dict[str, Source] = {}
    for source in sources:
        unique.setdefault(str(source.path).lower(), source)
    return list(unique.values())


def difference_hash(image: Image.Image, size: int = 16) -> str:
    gray = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = np.asarray(gray, dtype=np.int16)
    bits = pixels[:, :-1] > pixels[:, 1:]
    return f"{int(''.join('1' if bit else '0' for bit in bits.flat), 2):0{size * size // 4}x}"


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def color_family(rgb: tuple[int, int, int]) -> str:
    red, green, blue = (channel / 255 for channel in rgb)
    hue, saturation, value = colorsys.rgb_to_hsv(red, green, blue)
    degrees = hue * 360
    if saturation < 0.10:
        return "black" if value < 0.16 else "white" if value > 0.91 else "gray"
    if 15 <= degrees < 48 and value < 0.62:
        return "brown"
    if degrees < 15 or degrees >= 345:
        return "red"
    if degrees < 45:
        return "orange"
    if degrees < 70:
        return "yellow"
    if degrees < 160:
        return "green"
    if degrees < 195:
        return "cyan"
    if degrees < 255:
        return "blue"
    if degrees < 290:
        return "violet"
    return "magenta"


def analyze_image(image: Image.Image) -> tuple[dict[str, Any], np.ndarray]:
    image = image.convert("RGB")
    width, height = image.size
    sample = image.resize((96, 96), Image.Resampling.LANCZOS)
    array = np.asarray(sample, dtype=np.float32) / 255.0
    luminance = 0.2126 * array[:, :, 0] + 0.7152 * array[:, :, 1] + 0.0722 * array[:, :, 2]
    hsv = np.asarray(sample.convert("HSV"), dtype=np.float32) / 255.0
    gray = sample.convert("L")
    entropy = float(gray.entropy() / 8.0)
    edge_density = float(np.asarray(gray.filter(ImageFilter.FIND_EDGES), dtype=np.float32).mean() / 255.0)
    contrast = float(luminance.std())
    mean_rgb = array.reshape(-1, 3).mean(axis=0)
    std_rgb = array.reshape(-1, 3).std(axis=0)
    average_luminance = float(luminance.mean())
    average_saturation = float(hsv[:, :, 1].mean())
    clipped = float(((luminance < 0.015) | (luminance > 0.985)).mean())
    center = np.asarray(gray, dtype=np.float32)[24:72, 24:72]
    center_ratio = float(center.std() / max(np.asarray(gray, dtype=np.float32).std(), 0.001))

    quantized = sample.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    palette_raw = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    total = sum(count for count, _ in counts) or 1
    palette: list[str] = []
    families: list[str] = []
    for count, index in counts:
        offset = index * 3
        rgb = tuple(palette_raw[offset:offset + 3])
        if len(rgb) != 3:
            continue
        palette.append("#" + "".join(f"{component:02x}" for component in rgb))
        family = color_family(rgb)  # type: ignore[arg-type]
        if family not in families:
            families.append(family)
        if len(palette) == 5 or count / total < 0.02:
            break

    feature = np.asarray([
        *mean_rgb.tolist(), *std_rgb.tolist(), average_luminance,
        average_saturation, contrast, entropy, edge_density, clipped,
        min(center_ratio, 2.0) / 2.0,
    ], dtype=np.float64)
    technical_score = (
        0.28 * min(entropy / 0.82, 1.0)
        + 0.24 * min(edge_density / 0.20, 1.0)
        + 0.20 * (1.0 - min(abs(average_luminance - 0.48) / 0.48, 1.0))
        + 0.16 * (1.0 - min(clipped / 0.30, 1.0))
        + 0.12 * min(contrast / 0.24, 1.0)
    )
    analysis = {
        "width": width,
        "height": height,
        "palette": palette,
        "colorFamilies": families[:4],
        "brightness": "dark" if average_luminance < 0.22 else "light" if average_luminance > 0.58 else "balanced",
        "saturation": "muted" if average_saturation < 0.24 else "vivid" if average_saturation > 0.55 else "balanced",
        "averageLuminance": round(average_luminance, 6),
        "averageSaturation": round(average_saturation, 6),
        "contrast": round(contrast, 6),
        "entropy": round(entropy, 6),
        "edgeDensity": round(edge_density, 6),
        "clippedPixelRatio": round(clipped, 6),
        "composition": "center-weighted" if center_ratio > 1.12 else "open-field" if center_ratio < 0.78 else "distributed",
        "perceptualHash": {"algorithm": "dhash-16x16-luma", "value": difference_hash(image)},
        "technicalScore": round(technical_score, 6),
    }
    return analysis, feature


def analyze_pixels(path: Path) -> tuple[dict[str, Any], np.ndarray]:
    with Image.open(path) as opened:
        opened.load()
        image = ImageOps.exif_transpose(opened).convert("RGB")
    return analyze_image(image)


def square_crop(image: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Choose a square crop by edge activity with a gentle center preference."""
    image = image.convert("RGB")
    width, height = image.size
    side = min(width, height)
    if width == height:
        return image, (0, 0, width, height)
    travel = abs(width - height)
    best_score = -1.0
    best_box = (0, 0, side, side)
    for step in range(9):
        offset = round(travel * step / 8)
        box = (offset, 0, offset + side, side) if width > height else (0, offset, side, offset + side)
        probe = image.crop(box).resize((128, 128), Image.Resampling.LANCZOS).convert("L")
        edge = float(np.asarray(probe.filter(ImageFilter.FIND_EDGES), dtype=np.float32).mean() / 255.0)
        entropy = float(probe.entropy() / 8.0)
        center_bonus = 1.0 - abs(step - 4) / 4
        score = 0.55 * edge + 0.35 * entropy + 0.10 * center_bonus
        if score > best_score:
            best_score = score
            best_box = box
    return image.crop(best_box), best_box


def encoded_crop(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, "JPEG", quality=95, subsampling=0, optimize=True)
    return buffer.getvalue()


def machine_moods(analysis: dict[str, Any]) -> list[str]:
    moods = [analysis["brightness"], analysis["saturation"]]
    family = next(iter(analysis["colorFamilies"]), "neutral")
    moods.append(f"{family}-toned")
    return moods


def conservative_review_flags(source: Source) -> list[str]:
    flags: list[str] = []
    if source.pool.endswith("pending_review") or source.pool == "indexed_owner_corpus":
        flags.append("per_work_rights_and_source_lineage_review_required")
    if source.pool == "new_download_square_crop":
        flags.append("derived_square_crop_requires_owner_composition_approval")
    if "renaissance" in source.pool:
        flags.append("historical_artwork_or_derivative_review_required")
    if "christian" in source.pool:
        flags.append("religious_iconography_review_required")
    if "anime_music" in source.pool:
        flags.append("character_franchise_or_music_rights_review_required")
    if "maybe_images" in source.pool:
        flags.append("editorial_suitability_review_required")
    text = " ".join(filter(None, [source.title_basis, source.description_basis, source.prompt]))
    if re.search(r"\b(?:logo|watermark|caption|poster|signage|words?|text|van gogh|picasso|warhol)\b", text, re.I):
        flags.append("prominent_text_logo_or_named_artist_review_required")
    if re.search(r"\b(?:portrait|person|people|man|woman|boy|girl|child|face)\b", text, re.I):
        flags.append("identifiable_person_or_likeness_review_required")
    return flags


def analyze_sources(sources: list[Source], approved_hashes: set[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    seen_hashes: dict[str, str] = {}
    for ordinal, source in enumerate(sources, start=1):
        try:
            if not source.path.is_file():
                raise ValueError("missing-source")
            original_sha256 = sha256_file(source.path)
            if original_sha256 in approved_hashes:
                rejected.append({"path": str(source.path), "pool": source.pool, "reason": "already-approved", "sha256": original_sha256})
                continue
            with Image.open(source.path) as opened:
                opened.load()
                original = ImageOps.exif_transpose(opened).convert("RGB")
            original_dimensions = original.size
            if min(original_dimensions) < 1024:
                raise ValueError("too-small")
            crop_box: tuple[int, int, int, int] | None = None
            crop_bytes: bytes | None = None
            analysis_image = original
            if original_dimensions[0] != original_dimensions[1]:
                if not source.allow_square_crop:
                    raise ValueError("not-square")
                analysis_image, crop_box = square_crop(original)
                crop_bytes = encoded_crop(analysis_image)
            sha256 = hashlib.sha256(crop_bytes).hexdigest() if crop_bytes is not None else original_sha256
            if sha256 in approved_hashes:
                rejected.append({"path": str(source.path), "pool": source.pool, "reason": "derived-crop-already-approved", "sha256": sha256})
                continue
            if sha256 in seen_hashes:
                rejected.append({"path": str(source.path), "pool": source.pool, "reason": "exact-duplicate", "sha256": sha256, "duplicateOf": seen_hashes[sha256]})
                continue
            analysis, feature = analyze_image(analysis_image)
            seen_hashes[sha256] = str(source.path)
            proposed_title = source.title_basis or clean_filename(source.path) or f"Candidate {sha256[:8]}"
            proposed_slug = slugify(proposed_title) or f"candidate-{sha256[:12]}"
            accepted.append({
                "id": f"art_{sha256[:20]}",
                "sha256": sha256,
                "sourcePath": str(source.path),
                "sourcePool": source.pool,
                "sourceBytes": len(crop_bytes) if crop_bytes is not None else source.path.stat().st_size,
                "sourceProvenance": {
                    "originalPath": str(source.path),
                    "originalSha256": original_sha256,
                    "originalDimensions": list(original_dimensions),
                    "squareTransform": None if crop_box is None else {
                        "method": "edge-activity square crop with center preference",
                        "cropBox": list(crop_box),
                        "encoding": "JPEG quality 95, 4:4:4, metadata stripped",
                    },
                },
                "sourceAnalysis": source.source_analysis,
                "reviewFlags": conservative_review_flags(source),
                "proposed": {
                    "slug": proposed_slug,
                    "title": proposed_title[:160],
                    "description": source.description_basis,
                    "category": source.category_basis,
                    "moodTags": machine_moods(analysis),
                    "prompt": source.prompt,
                    "basis": "trusted source metadata" if source.title_basis else "filename plus decoded-pixel analysis",
                    "status": "pending-owner-editorial-review",
                },
                "analysis": analysis,
                "_feature": feature,
                "_ordinal": ordinal,
                "_cropBox": crop_box,
                "_originalPath": str(source.path),
            })
        except Exception as error:  # keep the batch auditable instead of aborting on one source
            rejected.append({"path": str(source.path), "pool": source.pool, "reason": str(error)})
    return accepted, rejected


def approved_anchors() -> tuple[set[str], list[np.ndarray], list[str]]:
    approved = load_json(APPROVED_PATH)
    hashes = {str(row["sha256"]) for row in approved}
    anchors: list[np.ndarray] = []
    phashes: list[str] = []
    if PRIVATE_MAP_PATH.is_file():
        source_map = {str(row["id"]): row for row in load_json(PRIVATE_MAP_PATH)}
        for row in approved:
            mapped = source_map.get(str(row["id"]))
            if not mapped or mapped.get("sha256") != row.get("sha256"):
                continue
            path = Path(str(mapped.get("sourceAbsolutePath") or ""))
            if not path.is_file():
                continue
            try:
                analysis, feature = analyze_pixels(path)
            except Exception:
                continue
            anchors.append(feature)
            phashes.append(analysis["perceptualHash"]["value"])
    return hashes, anchors, phashes


def robust_scale(matrix: np.ndarray) -> np.ndarray:
    median = np.median(matrix, axis=0)
    spread = np.percentile(matrix, 75, axis=0) - np.percentile(matrix, 25, axis=0)
    spread[spread < 1e-6] = 1.0
    return (matrix - median) / spread


def diversity_select(
    candidates: list[dict[str, Any]],
    anchors: list[np.ndarray],
    anchor_phashes: list[str],
    count: int,
    preferred_ids: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if len(candidates) < count:
        raise RuntimeError(f"Only {len(candidates)} technically eligible unique candidates; need {count}.")
    all_features = np.vstack([*(anchors or []), *(row["_feature"] for row in candidates)])
    scaled = robust_scale(all_features)
    anchor_count = len(anchors)
    candidate_features = scaled[anchor_count:]
    if anchor_count:
        delta = candidate_features[:, None, :] - scaled[:anchor_count][None, :, :]
        min_distance = np.sqrt(np.square(delta).sum(axis=2)).min(axis=1)
    else:
        min_distance = np.ones(len(candidates), dtype=np.float64)

    eligible = np.ones(len(candidates), dtype=bool)
    perceptual_rejections: list[dict[str, Any]] = []
    for index, row in enumerate(candidates):
        phash = row["analysis"]["perceptualHash"]["value"]
        if anchor_phashes and min(hamming(phash, existing) for existing in anchor_phashes) <= 8:
            eligible[index] = False
            perceptual_rejections.append({"id": row["id"], "sourcePath": row["sourcePath"], "reason": "near-duplicate-of-approved"})
    if int(eligible.sum()) < count:
        raise RuntimeError(f"Only {int(eligible.sum())} candidates remain after perceptual-dedup; need {count}.")

    selected_indices: list[int] = []
    selected_phashes: list[str] = []
    quality = np.asarray([row["analysis"]["technicalScore"] for row in candidates])

    def select_index(chosen: int) -> None:
        eligible[chosen] = False
        selected_indices.append(chosen)
        selected_phashes.append(candidates[chosen]["analysis"]["perceptualHash"]["value"])
        distance = np.sqrt(np.square(candidate_features - candidate_features[chosen]).sum(axis=1))
        nonlocal min_distance
        min_distance = np.minimum(min_distance, distance)
        chosen_phash = selected_phashes[-1]
        for index, row in enumerate(candidates):
            if eligible[index] and hamming(chosen_phash, row["analysis"]["perceptualHash"]["value"]) <= 8:
                eligible[index] = False
                perceptual_rejections.append({"id": row["id"], "sourcePath": row["sourcePath"], "reason": "near-duplicate-within-batch", "duplicateOf": candidates[chosen]["id"]})

    candidate_index = {row["id"]: index for index, row in enumerate(candidates)}
    for preferred_id in preferred_ids or []:
        chosen = candidate_index.get(preferred_id)
        if chosen is not None and eligible[chosen] and len(selected_indices) < count:
            select_index(chosen)

    while len(selected_indices) < count:
        scores = min_distance + 0.35 * quality
        scores[~eligible] = -np.inf
        chosen = int(np.argmax(scores))
        if not np.isfinite(scores[chosen]):
            raise RuntimeError("Selection exhausted before reaching requested count.")
        select_index(chosen)

    selected = [candidates[index] for index in selected_indices]
    for rank, row in enumerate(selected, start=1):
        row["selectionRank"] = rank
    return selected, perceptual_rejections


def strip_private_types(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def load_owner_exclusions(path: Path) -> tuple[set[str], list[dict[str, Any]]]:
    if not path.is_file():
        return set(), []
    payload = load_json(path)
    rows = payload.get("excluded", []) if isinstance(payload, dict) else []
    exclusions = [row for row in rows if isinstance(row, dict) and row.get("id")]
    return {str(row["id"]) for row in exclusions}, exclusions


def prior_batch_anchors(paths: list[Path]) -> tuple[set[str], list[np.ndarray], list[str]]:
    excluded_ids: set[str] = set()
    anchors: list[np.ndarray] = []
    phashes: list[str] = []
    for path in paths:
        payload = load_json(path)
        for row in payload.get("candidates", []):
            if not isinstance(row, dict) or not row.get("id"):
                continue
            excluded_ids.add(str(row["id"]))
            source_path = Path(str(row.get("sourcePath") or ""))
            if not source_path.is_file():
                raise RuntimeError(f"Prior-batch source is missing: {source_path}")
            analysis, feature = analyze_pixels(source_path)
            anchors.append(feature)
            phashes.append(analysis["perceptualHash"]["value"])
    return excluded_ids, anchors, phashes


def ensure_unique_proposed_slugs(selected: list[dict[str, Any]]) -> None:
    used = {str(row.get("slug")) for row in load_json(APPROVED_PATH)}
    for row in selected:
        base = row["proposed"]["slug"]
        slug = base
        if slug in used:
            slug = f"{base[:108].rstrip('-')}-{row['sha256'][:8]}"
        counter = 2
        while slug in used:
            slug = f"{base[:104].rstrip('-')}-{row['sha256'][:8]}-{counter}"
            counter += 1
        row["proposed"]["slug"] = slug
        used.add(slug)


def write_derived_masters(selected: list[dict[str, Any]], output: Path) -> int:
    derived_root = output / "square-masters"
    written = 0
    for row in selected:
        crop_box = row.get("_cropBox")
        if crop_box is None:
            continue
        derived_root.mkdir(parents=True, exist_ok=True)
        with Image.open(row["_originalPath"]) as opened:
            opened.load()
            original = ImageOps.exif_transpose(opened).convert("RGB")
        content = encoded_crop(original.crop(tuple(crop_box)))
        actual_sha256 = hashlib.sha256(content).hexdigest()
        if actual_sha256 != row["sha256"]:
            raise RuntimeError(f"Derived crop changed between analysis and write for {row['id']}.")
        target = derived_root / f"{row['id']}.jpg"
        target.write_bytes(content)
        row["sourcePath"] = str(target)
        row["sourceBytes"] = len(content)
        written += 1
    return written


def write_contact_sheets(selected: list[dict[str, Any]], output: Path, per_sheet: int = 50) -> list[str]:
    sheets: list[str] = []
    font = ImageFont.load_default(size=16)
    thumb = 170
    label = 38
    columns = 10
    rows = math.ceil(per_sheet / columns)
    for sheet_index, start in enumerate(range(0, len(selected), per_sheet), start=1):
        chunk = selected[start:start + per_sheet]
        canvas = Image.new("RGB", (columns * thumb, rows * (thumb + label)), "#f2f0e9")
        draw = ImageDraw.Draw(canvas)
        for local_index, row in enumerate(chunk):
            x = (local_index % columns) * thumb
            y = (local_index // columns) * (thumb + label)
            with Image.open(row["sourcePath"]) as opened:
                image = ImageOps.fit(ImageOps.exif_transpose(opened).convert("RGB"), (thumb, thumb), Image.Resampling.LANCZOS)
            canvas.paste(image, (x, y))
            global_rank = start + local_index + 1
            pool = row["sourcePool"].replace("_", " ")[:18]
            draw.rectangle((x, y + thumb, x + thumb, y + thumb + label), fill="#f2f0e9")
            draw.text((x + 5, y + thumb + 3), f"{global_rank:03d}  {pool}", font=font, fill="#111111")
            draw.text((x + 5, y + thumb + 20), row["id"][-8:], font=font, fill="#555555")
        name = f"contact-sheet-{sheet_index:02d}.jpg"
        canvas.save(output / name, "JPEG", quality=88, optimize=True)
        sheets.append(name)
    return sheets


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=500)
    parser.add_argument("--crop-prefilter", type=int, default=900)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--owner-exclusions", type=Path)
    parser.add_argument("--exclude-manifest", type=Path, action="append", default=[])
    args = parser.parse_args()
    if args.count <= 0:
        raise SystemExit("--count must be positive")

    args.output.mkdir(parents=True, exist_ok=True)
    owner_exclusions_path = args.owner_exclusions or (args.output / "owner-exclusions.private.json")
    owner_exclusion_ids, owner_rejections = load_owner_exclusions(owner_exclusions_path)
    previous_manifest = args.output / "archive-expansion-500.private.json"
    preferred_ids: list[str] = []
    if previous_manifest.is_file():
        previous_payload = load_json(previous_manifest)
        preferred_ids = [
            str(row["id"])
            for row in previous_payload.get("candidates", [])
            if isinstance(row, dict) and row.get("id") and str(row["id"]) not in owner_exclusion_ids
        ]
    approved_hashes, anchors, anchor_phashes = approved_anchors()
    approved_anchor_count = len(anchors)
    prior_batch_ids, prior_anchors, prior_phashes = prior_batch_anchors(args.exclude_manifest)
    anchors.extend(prior_anchors)
    anchor_phashes.extend(prior_phashes)
    inventory = source_inventory(args.crop_prefilter)
    candidates, technical_rejections = analyze_sources(inventory, approved_hashes)
    technically_eligible_before_owner_exclusions = len(candidates)
    candidates = [
        row for row in candidates
        if row["id"] not in owner_exclusion_ids and row["id"] not in prior_batch_ids
    ]
    selected, perceptual_rejections = diversity_select(candidates, anchors, anchor_phashes, args.count, preferred_ids)
    ensure_unique_proposed_slugs(selected)
    derived_masters = write_derived_masters(selected, args.output)
    sheets = write_contact_sheets(selected, args.output)

    payload = {
        "schemaVersion": 1,
        "purpose": "private archive expansion review; not publication authority",
        "requestedCount": args.count,
        "inventoryCount": len(inventory),
        "technicallyEligibleUniqueCount": technically_eligible_before_owner_exclusions,
        "ownerExcludedCount": len(owner_rejections),
        "selectedCount": len(selected),
        "approvedAnchorCount": approved_anchor_count,
        "priorBatchExcludedCount": len(prior_batch_ids),
        "selectionAnchorCount": len(anchors),
        "gates": {
            "decodedSquareAtLeast1024": True,
            "exactShaDedup": True,
            "perceptualDedup": {"algorithm": "dhash-16x16-luma", "maximumDistance": 8},
            "rightsApproved": False,
            "publicationApproved": False,
            "pricingApproved": False,
            "editorialMetadataApproved": False,
        },
        "poolCounts": dict(sorted(Counter(row["sourcePool"] for row in selected).items())),
        "colorCounts": dict(sorted(Counter(family for row in selected for family in row["analysis"]["colorFamilies"][:1]).items())),
        "reviewFlagCounts": dict(sorted(Counter(flag for row in selected for flag in row["reviewFlags"]).items())),
        "contactSheets": sheets,
        "derivedSquareMasterCount": derived_masters,
        "candidates": [strip_private_types(row) for row in selected],
    }
    (args.output / "archive-expansion-500.private.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    (args.output / "rejections.private.json").write_text(json.dumps({
        "technical": technical_rejections,
        "perceptual": perceptual_rejections,
        "owner": owner_rejections,
    }, indent=2) + "\n", encoding="utf-8")

    with (args.output / "archive-expansion-500-review.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "id", "source_pool", "proposed_title", "proposed_slug", "palette", "machine_moods", "review_flags", "rights_approved", "publication_approved", "sale_mode", "price_usd", "decision"])
        for row in selected:
            writer.writerow([
                row["selectionRank"], row["id"], row["sourcePool"], row["proposed"]["title"], row["proposed"]["slug"],
                "; ".join(row["analysis"]["palette"]), "; ".join(row["proposed"]["moodTags"]),
                "; ".join(row["reviewFlags"]),
                "", "", "", "", "pending",
            ])

    summary = {
        "output": str(args.output),
        "inventory": len(inventory),
        "technicallyEligibleUnique": technically_eligible_before_owner_exclusions,
        "ownerExclusions": len(owner_rejections),
        "selected": len(selected),
        "technicalRejections": len(technical_rejections),
        "perceptualRejections": len(perceptual_rejections),
        "approvedAnchors": approved_anchor_count,
        "priorBatchExclusions": len(prior_batch_ids),
        "selectionAnchors": len(anchors),
        "poolCounts": payload["poolCounts"],
        "colorCounts": payload["colorCounts"],
        "reviewFlagCounts": payload["reviewFlagCounts"],
        "contactSheets": len(sheets),
        "derivedSquareMasters": derived_masters,
        "publicationState": "blocked pending owner rights, editorial, sale-mode, pricing, and publication decisions",
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
