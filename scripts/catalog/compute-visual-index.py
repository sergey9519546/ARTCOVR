#!/usr/bin/env python3
"""Offline visual-index computation for the ARTCOVR display catalog.

This script is NOT part of `npm run build`. It is run manually (via
`npm run catalog:visual-index`, which drives scripts/catalog/build-visual-index.ts)
and produces a deterministic artifact that is committed to the repository.

It computes, for every display derivative in public/assets/artworks:

  * a 512-d L2-normalized image vector,
  * the top-6 visually nearest OTHER works (cosine),
  * a global diversity order (farthest-point traversal),
  * one label per fastText task from the owner's exact vocabularies
    (scripts/catalog/fasttext-vocabularies.json).

Backends
--------
`--backend descriptor` (default, used for the committed artifact)
    A deterministic, dependency-light visual descriptor computed from the
    pixels themselves (numpy + Pillow only). Blocks: spatial hue/saturation
    histograms, spatial luminance histograms, a global HSV joint histogram,
    spatial edge-orientation histograms, edge statistics, multi-scale
    Laplacian texture energy, CIELAB colour moments and global scalars.
    Labels are derived from measured pixel statistics plus the SHA-locked
    curator text already in the catalog — never invented: every label is the
    argmax of an explicit, auditable scoring rule, and the reported confidence
    is the winner/runner-up margin scaled by how much evidence actually
    matched.

`--backend clip`
    CLIP ViT-B/32 (openai/clip-vit-base-patch32 — the same weights the owner's
    22k-image fastText system used through Xenova/clip-vit-base-patch32) with
    zero-shot text-image similarity over the same vocabularies. This path
    requires `pip install torch transformers` and network access to the model
    weights. It could NOT be executed in the build container that produced the
    committed artifact (see .agent-state/DECISIONS.md, ADR-014: the session's
    egress policy denies huggingface.co, download.pytorch.org and every other
    model-weight host), so it is provided as the regeneration path for a
    machine with model access and is marked unverified there.

Both backends emit the identical payload shape, so the site artifact and all
consumers are backend-agnostic; only the recorded version strings change.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

DESCRIPTOR_VECTOR_VERSION = "artcovr-visual-descriptor-v1"
DESCRIPTOR_LABEL_VERSION = "descriptor-rules-v1"
CLIP_VECTOR_VERSION = "clip-vitb32-v1"
CLIP_LABEL_VERSION = "clip-zeroshot-v1"

VECTOR_DIMENSIONS = 512
RELATED_COUNT = 6
ANALYSIS_SIZE = 256

TASKS = ("style", "medium", "mood", "category", "weather", "colorblend", "domcolor")

# Governance: taxonomy terms that may never enter machine metadata, mirroring
# BANNED_KEYWORD_TERMS in tests/unit/catalog-curation.test.ts. The vocabularies
# are visual labels so this is a defensive filter, applied to every emitted
# label before it can reach the artifact.
BANNED_LABEL_TERMS = (
    "masterpiece",
    "best quality",
    "award winning",
    "trending",
    "viral",
    "4k",
    "8k",
    "ultra hd",
    "ai art",
    "ai-generated",
    "prompt",
)


# --------------------------------------------------------------------------
# image statistics
# --------------------------------------------------------------------------

def load_pixels(path: Path) -> np.ndarray:
    with Image.open(path) as handle:
        image = handle.convert("RGB").resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.BILINEAR)
        return np.asarray(image, dtype=np.float64) / 255.0


def rgb_to_hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    maximum = rgb.max(axis=-1)
    minimum = rgb.min(axis=-1)
    delta = maximum - minimum
    hue = np.zeros_like(maximum)
    safe = delta > 1e-9
    red_peak = safe & (maximum == red)
    green_peak = safe & (maximum == green) & ~red_peak
    blue_peak = safe & ~red_peak & ~green_peak
    with np.errstate(invalid="ignore", divide="ignore"):
        hue[red_peak] = ((green - blue)[red_peak] / delta[red_peak]) % 6.0
        hue[green_peak] = ((blue - red)[green_peak] / delta[green_peak]) + 2.0
        hue[blue_peak] = ((red - green)[blue_peak] / delta[blue_peak]) + 4.0
    hue = hue * 60.0
    saturation = np.where(maximum > 1e-9, delta / np.maximum(maximum, 1e-9), 0.0)
    return hue, saturation, maximum


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    matrix = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    )
    xyz = linear @ matrix.T
    white = np.array([0.95047, 1.0, 1.08883])
    ratio = xyz / white
    epsilon = 216.0 / 24389.0
    kappa = 24389.0 / 27.0
    f = np.where(ratio > epsilon, np.cbrt(ratio), (kappa * ratio + 16.0) / 116.0)
    lightness = 116.0 * f[..., 1] - 16.0
    a_axis = 500.0 * (f[..., 0] - f[..., 1])
    b_axis = 200.0 * (f[..., 1] - f[..., 2])
    return np.stack([lightness / 100.0, a_axis / 128.0, b_axis / 128.0], axis=-1)


def sobel(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    kernel_x = np.array([[1.0, 0.0, -1.0], [2.0, 0.0, -2.0], [1.0, 0.0, -1.0]])
    kernel_y = kernel_x.T
    padded = np.pad(gray, 1, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, (3, 3))
    gradient_x = np.einsum("ijkl,kl->ij", windows, kernel_x)
    gradient_y = np.einsum("ijkl,kl->ij", windows, kernel_y)
    magnitude = np.hypot(gradient_x, gradient_y)
    orientation = (np.arctan2(gradient_y, gradient_x) % math.pi) / math.pi
    return magnitude, orientation


def laplacian(gray: np.ndarray) -> np.ndarray:
    kernel = np.array([[0.0, 1.0, 0.0], [1.0, -4.0, 1.0], [0.0, 1.0, 0.0]])
    padded = np.pad(gray, 1, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, (3, 3))
    return np.abs(np.einsum("ijkl,kl->ij", windows, kernel))


def downsample(channel: np.ndarray, factor: int) -> np.ndarray:
    size = channel.shape[0] // factor
    return channel[: size * factor, : size * factor].reshape(size, factor, size, factor).mean(axis=(1, 3))


def grid_slices(size: int, cells: int) -> list[tuple[slice, slice]]:
    edges = [round(index * size / cells) for index in range(cells + 1)]
    return [
        (slice(edges[row], edges[row + 1]), slice(edges[column], edges[column + 1]))
        for row in range(cells)
        for column in range(cells)
    ]


def histogram(values: np.ndarray, bins: int, low: float, high: float, weights: np.ndarray | None = None) -> np.ndarray:
    counts, _ = np.histogram(values, bins=bins, range=(low, high), weights=weights)
    total = counts.sum()
    return counts / total if total > 0 else counts


def normalize_block(block: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(block))
    return block / norm if norm > 1e-12 else block


def color_class_masses(hue: np.ndarray, saturation: np.ndarray, value: np.ndarray) -> dict[str, float]:
    """Fraction of pixels falling in each of the 9 domcolor classes."""
    total = float(hue.size)
    black = value < 0.18
    white = (~black) & (saturation < 0.15) & (value > 0.85)
    gray = (~black) & (~white) & (saturation < 0.15)
    chromatic = ~(black | white | gray)
    buckets = {
        "Red": ((hue < 15.0) | (hue >= 345.0)),
        "Orange": (hue >= 15.0) & (hue < 45.0),
        "Yellow": (hue >= 45.0) & (hue < 70.0),
        "Green": (hue >= 70.0) & (hue < 165.0),
        "Blue": (hue >= 165.0) & (hue < 260.0),
        "Purple": (hue >= 260.0) & (hue < 345.0),
    }
    masses = {
        "Black": float(black.sum()) / total,
        "White": float(white.sum()) / total,
        "Gray": float(gray.sum()) / total,
    }
    for name, mask in buckets.items():
        masses[name] = float((mask & chromatic).sum()) / total
    return masses


def image_statistics(rgb: np.ndarray) -> dict[str, float]:
    hue, saturation, value = rgb_to_hsv(rgb)
    gray = rgb @ np.array([0.299, 0.587, 0.114])
    magnitude, _ = sobel(gray)
    texture = laplacian(gray)
    masses = color_class_masses(hue, saturation, value)
    chromatic = saturation >= 0.15
    warm = float(masses["Red"] + masses["Orange"] + masses["Yellow"])
    quantized = np.unique((rgb * 8).astype(np.int16).reshape(-1, 3), axis=0).shape[0]
    stats: dict[str, float] = {
        "value_mean": float(value.mean()),
        "value_std": float(value.std()),
        "saturation_mean": float(saturation.mean()),
        "saturation_p90": float(np.percentile(saturation, 90)),
        "chromatic_fraction": float(chromatic.mean()),
        "dark_fraction": float((value < 0.25).mean()),
        "light_fraction": float((value > 0.80).mean()),
        "edge_density": float((magnitude > 0.35).mean()),
        "edge_mean": float(magnitude.mean()),
        "texture_mean": float(texture.mean()),
        "flat_fraction": float((magnitude < 0.04).mean()),
        "color_count_ratio": float(quantized) / 512.0,
        "warm_mass": warm,
        "cool_mass": float(masses["Blue"] + masses["Green"]),
        "contrast": float(np.percentile(value, 95) - np.percentile(value, 5)),
    }
    stats.update({f"mass_{name}": mass for name, mass in masses.items()})
    return stats


# --------------------------------------------------------------------------
# descriptor backend
# --------------------------------------------------------------------------

def descriptor_vector(rgb: np.ndarray) -> np.ndarray:
    """A deterministic 512-d visual descriptor. Block sizes sum to exactly 512."""
    hue, saturation, value = rgb_to_hsv(rgb)
    gray = rgb @ np.array([0.299, 0.587, 0.114])
    lab = rgb_to_lab(rgb)
    magnitude, orientation = sobel(gray)
    size = rgb.shape[0]

    blocks: list[np.ndarray] = []

    # A. 2x2 grid x 18 hue bins x 2 saturation levels = 144
    hue_saturation: list[np.ndarray] = []
    for rows, columns in grid_slices(size, 2):
        cell_hue = hue[rows, columns]
        cell_saturation = saturation[rows, columns]
        for low, high in ((0.15, 0.45), (0.45, 1.01)):
            mask = (cell_saturation >= low) & (cell_saturation < high)
            hue_saturation.append(histogram(cell_hue[mask], 18, 0.0, 360.0))
    blocks.append(np.concatenate(hue_saturation))

    # B. 3x3 grid x 8 luminance bins = 72
    blocks.append(
        np.concatenate([histogram(value[rows, columns], 8, 0.0, 1.0) for rows, columns in grid_slices(size, 3)])
    )

    # C. global joint 8 hue x 3 saturation x 3 value = 72
    hue_index = np.clip((hue / 360.0 * 8).astype(int), 0, 7)
    saturation_index = np.clip((saturation * 3).astype(int), 0, 2)
    value_index = np.clip((value * 3).astype(int), 0, 2)
    joint = np.zeros((8, 3, 3))
    np.add.at(joint, (hue_index, saturation_index, value_index), 1.0)
    blocks.append((joint / joint.sum()).reshape(-1))

    # D. 3x3 grid x 8 edge orientations (magnitude weighted) = 72
    blocks.append(
        np.concatenate(
            [
                histogram(
                    orientation[rows, columns].reshape(-1),
                    8,
                    0.0,
                    1.0,
                    weights=magnitude[rows, columns].reshape(-1),
                )
                for rows, columns in grid_slices(size, 3)
            ]
        )
    )

    # E. 3x3 grid x 4 edge statistics = 36
    edge_stats: list[float] = []
    for rows, columns in grid_slices(size, 3):
        cell = magnitude[rows, columns]
        edge_stats.extend(
            [float(cell.mean()), float(cell.std()), float(np.percentile(cell, 90)), float((cell > 0.35).mean())]
        )
    blocks.append(np.asarray(edge_stats))

    # F. 3x3 grid x 3 Laplacian scales = 27
    texture_stats: list[float] = []
    scales = [laplacian(gray), laplacian(downsample(gray, 2)), laplacian(downsample(gray, 4))]
    for scale in scales:
        for rows, columns in grid_slices(scale.shape[0], 3):
            texture_stats.append(float(scale[rows, columns].mean()))
    blocks.append(np.asarray(texture_stats))

    # G. 3x3 grid x 6 CIELAB colour moments = 54
    lab_stats: list[float] = []
    for rows, columns in grid_slices(size, 3):
        cell = lab[rows, columns]
        lab_stats.extend([float(cell[..., channel].mean()) for channel in range(3)])
        lab_stats.extend([float(cell[..., channel].std()) for channel in range(3)])
    blocks.append(np.asarray(lab_stats))

    # H. 35 global scalars
    masses = color_class_masses(hue, saturation, value)
    top = np.sort(np.asarray(list(masses.values())))[::-1]
    hue_histogram = histogram(hue[saturation >= 0.15], 12, 0.0, 360.0)
    hue_entropy = float(-(hue_histogram * np.log(np.maximum(hue_histogram, 1e-12))).sum())
    center = value[size // 4 : 3 * size // 4, size // 4 : 3 * size // 4]
    border_mask = np.ones_like(value, dtype=bool)
    border_mask[size // 4 : 3 * size // 4, size // 4 : 3 * size // 4] = False
    globals_block = [
        float(value.mean()),
        float(value.std()),
        float(saturation.mean()),
        float(saturation.std()),
        float(np.percentile(saturation, 90)),
        float((saturation >= 0.15).mean()),
        float((value < 0.25).mean()),
        float((value > 0.80).mean()),
        float(np.percentile(value, 95) - np.percentile(value, 5)),
        float(magnitude.mean()),
        float(magnitude.std()),
        float((magnitude > 0.35).mean()),
        float((magnitude < 0.04).mean()),
        float(scales[0].mean()),
        float(scales[1].mean()),
        float(scales[2].mean()),
        hue_entropy,
        float(np.unique((rgb * 8).astype(np.int16).reshape(-1, 3), axis=0).shape[0]) / 512.0,
        float(center.mean() - value[border_mask].mean()),
        float(center.std()),
        float(np.abs(value - value[:, ::-1]).mean()),
        float(np.abs(value - value[::-1, :]).mean()),
        float(lab[..., 0].mean()),
        float(lab[..., 1].mean()),
        float(lab[..., 2].mean()),
        float(lab[..., 1].std()),
        float(lab[..., 2].std()),
        float(np.hypot(lab[..., 1], lab[..., 2]).mean()),
        float(top[0]),
        float(top[1]),
        float(top[2]),
        float(masses["Black"]),
        float(masses["White"] + masses["Gray"]),
        float(masses["Red"] + masses["Orange"] + masses["Yellow"]),
        float(masses["Blue"] + masses["Green"] + masses["Purple"]),
    ]
    blocks.append(np.asarray(globals_block))

    vector = np.concatenate([normalize_block(np.nan_to_num(block)) for block in blocks])
    if vector.shape[0] != VECTOR_DIMENSIONS:
        raise SystemExit(f"descriptor produced {vector.shape[0]} dimensions, expected {VECTOR_DIMENSIONS}")
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 1e-12 else vector


# --------------------------------------------------------------------------
# rule-based labelling (descriptor backend)
# --------------------------------------------------------------------------

def evidence_text(record: dict, enrichment: dict | None) -> str:
    parts = [
        str(record.get("title") or ""),
        str(record.get("description") or ""),
        str(record.get("alt") or ""),
        str(record.get("category") or ""),
        " ".join(record.get("moodTags") or []),
    ]
    metadata = (enrichment or {}).get("metadata") or {}
    parts.extend(
        [
            " ".join(metadata.get("keywords") or []),
            " ".join(metadata.get("palette") or []),
            str(metadata.get("lighting") or ""),
            str(metadata.get("mediumAndTexture") or ""),
            str(metadata.get("lineworkAndEdges") or ""),
            str(metadata.get("compositionAndMotion") or ""),
            str(metadata.get("styleFamily") or ""),
        ]
    )
    return re.sub(r"[^a-z0-9 ]+", " ", " ".join(parts).lower())


def cue_hits(text: str, cues: tuple[str, ...]) -> int:
    return sum(1 for cue in cues if cue in text)


def decide(scores: dict[str, float], evidence: int, floor: float = 0.05) -> tuple[str, float]:
    """Argmax with a winner/runner-up margin confidence, damped by evidence."""
    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    winner, best = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0.0
    margin = best / (best + runner_up) if (best + runner_up) > 1e-9 else 0.5
    strength = min(1.0, 0.40 + 0.15 * evidence)
    confidence = max(floor, min(1.0, margin * strength))
    return winner, round(confidence, 3)


STYLE_CUES = {
    "Surrealism": ("surreal", "dream", "uncanny", "impossible", "hybrid", "floating", "melting", "absurd", "illusion"),
    "Baroque": ("ornate", "gilded", "opulent", "dramatic", "chiaroscuro", "gothic", "cathedral", "relic", "icon", "altar", "baroque", "vespers", "pilgrim"),
    "Impressionism": ("painterly", "soft", "haze", "bloom", "luminous", "atmospheric", "pastel", "brush", "impression"),
    "Expressionism": ("bold", "gestural", "distorted", "raw", "chaotic", "expressive", "vivid", "turbulent", "storm"),
    "Abstract": ("abstract", "geometric", "pattern", "gradient", "field", "shape", "grid", "diagram", "graphic"),
    "Minimalism": ("minimal", "quiet", "empty", "blank", "void", "sparse", "still", "single", "plain"),
}

MEDIUM_CUES = {
    "Oil_Painting": ("oil", "impasto", "canvas", "brush", "painterly", "painting"),
    "Digital_Art": ("digital", "graphic", "print", "poster", "vector", "screenprint", "halftone", "riso", "computational", "collage"),
    "Watercolor": ("watercolor", "wash", "gouache", "ink wash", "bleed", "aquarelle"),
    "3D_Render": ("3d", "render", "sculptural", "volumetric", "glossy", "material", "ceramic", "metallic"),
    "Photograph": ("photo", "photographic", "still life", "documentary", "lens"),
    "Pencil_Sketch": ("sketch", "pencil", "graphite", "hatching", "line drawing", "linework"),
}

MOOD_CUES = {
    "Melancholic__Solitary": ("quiet", "lonely", "solitary", "melancholy", "nostalgic", "muted", "still", "empty", "domestic"),
    "Vibrant__Energetic": ("vibrant", "bold", "playful", "energetic", "bright", "pop", "graphic", "saturated"),
    "Serene__Peaceful": ("calm", "serene", "soft", "gentle", "pastel", "peaceful", "tender", "quietly"),
    "Eerie__Dark": ("eerie", "uncanny", "ominous", "sinister", "shadow", "gothic", "haunted", "dark", "noir"),
    "Mysterious__Dreamy": ("dream", "mist", "haze", "mysterious", "ethereal", "liminal", "fog", "veiled", "twilight"),
    "Majestic__Epic": ("monumental", "epic", "vast", "cathedral", "celestial", "cosmic", "majestic", "orbit", "horizon"),
}

CATEGORY_CUES = {
    "Material_Transmutation": ("made of", "woven", "knitted", "stitched", "molten", "marble", "glass", "paper", "fabric", "velvet", "moss", "material", "ceramic", "metal"),
    "Scale__Proportion_Impossibilities": ("giant", "tiny", "miniature", "oversized", "colossal", "scale", "shrunken", "monumental"),
    "Environmental_Bleed_Sky_Sea_Forest_Invading": ("sky", "sea", "ocean", "forest", "cloud", "wave", "garden", "storm", "weather", "rain", "horizon", "dune"),
    "Architectural__Spatial_Paradox": ("staircase", "stairs", "architecture", "corridor", "room", "building", "tower", "door", "window", "block", "passage"),
    "Light__Shadow_Paradox": ("light", "shadow", "glow", "beam", "lamp", "prism", "luminous", "silhouette", "reflection"),
    "Biomechanical__Organic-Mechanical_Hybrids": ("machine", "mechanical", "engine", "gear", "appliance", "wire", "circuit", "organic", "biomechanical"),
    "Temporal_Layering__Simultaneous_Time": ("clock", "time", "hours", "calendar", "temporal", "memory", "vespers", "seasons"),
    "Animate_Objects__Objects_with_Consciousness": ("chair", "cup", "teacup", "sock", "suitcase", "cart", "drawer", "kettle", "object", "still life", "bowl", "camera"),
    "Symbolic__Mythic_Overlay": ("icon", "myth", "ritual", "symbol", "totem", "relic", "pilgrim", "herald", "choir", "sacred"),
    "Duplication_Recursion__Infinite_Repetition": ("repetition", "recursive", "infinite", "rows of", "multiplied", "pattern of", "many", "grid of"),
    "General_Generation": (),
}

WEATHER_CUES = {
    "rainy": ("rain", "downpour", "drizzle", "umbrella", "wet"),
    "cloudy": ("cloud", "overcast", "cumulus"),
    "foggy": ("fog", "mist", "haze", "vapor"),
    "stormy": ("storm", "tempest", "thunder", "lightning", "gale"),
    "snowy": ("snow", "frost", "ice", "winter"),
    "clear": ("clear", "sun", "blue sky", "bright", "daylight"),
}


def label_style(text: str, stats: dict[str, float]) -> tuple[str, float]:
    scores = {name: float(cue_hits(text, cues)) for name, cues in STYLE_CUES.items()}
    scores["Minimalism"] += 1.6 * max(0.0, stats["flat_fraction"] - 0.55) * 4.0
    scores["Minimalism"] += 1.2 * max(0.0, 0.35 - stats["color_count_ratio"])
    scores["Abstract"] += 1.4 * max(0.0, 0.30 - stats["edge_density"]) * 2.0
    scores["Expressionism"] += 2.0 * max(0.0, stats["saturation_mean"] - 0.45)
    scores["Expressionism"] += 1.5 * max(0.0, stats["edge_density"] - 0.25)
    scores["Impressionism"] += 2.0 * max(0.0, 0.12 - stats["edge_density"]) * 3.0
    scores["Baroque"] += 2.0 * max(0.0, stats["dark_fraction"] - 0.45)
    scores["Surrealism"] += 0.8 if "surreal" in text or "hybrid" in text else 0.0
    scores["Surrealism"] += 0.4
    evidence = max(cue_hits(text, cues) for cues in STYLE_CUES.values())
    return decide(scores, evidence)


def label_medium(text: str, stats: dict[str, float]) -> tuple[str, float]:
    scores = {name: float(cue_hits(text, cues)) for name, cues in MEDIUM_CUES.items()}
    scores["Digital_Art"] += 2.2 * max(0.0, stats["flat_fraction"] - 0.45) * 2.0
    scores["Digital_Art"] += 1.2 * max(0.0, stats["saturation_p90"] - 0.55)
    scores["Photograph"] += 2.0 * max(0.0, stats["texture_mean"] - 0.05) * 4.0
    scores["Photograph"] += 1.0 * max(0.0, stats["color_count_ratio"] - 0.60)
    scores["Oil_Painting"] += 1.6 * max(0.0, stats["texture_mean"] - 0.03) * 2.0
    scores["Watercolor"] += 2.0 * max(0.0, stats["light_fraction"] - 0.35)
    scores["Watercolor"] += 1.4 * max(0.0, 0.30 - stats["saturation_mean"])
    scores["3D_Render"] += 1.8 * max(0.0, stats["contrast"] - 0.70)
    scores["3D_Render"] += 1.2 * max(0.0, 0.10 - stats["edge_density"]) * 2.0
    scores["Pencil_Sketch"] += 3.0 * max(0.0, 0.10 - stats["saturation_mean"]) * 3.0
    scores["Pencil_Sketch"] += 1.0 * max(0.0, stats["edge_density"] - 0.30)
    evidence = max(cue_hits(text, cues) for cues in MEDIUM_CUES.values())
    return decide(scores, evidence)


def label_mood(text: str, stats: dict[str, float]) -> tuple[str, float]:
    scores = {name: float(cue_hits(text, cues)) for name, cues in MOOD_CUES.items()}
    scores["Melancholic__Solitary"] += 1.6 * max(0.0, 0.45 - stats["value_mean"])
    scores["Melancholic__Solitary"] += 1.2 * max(0.0, 0.35 - stats["saturation_mean"])
    scores["Vibrant__Energetic"] += 2.4 * max(0.0, stats["saturation_mean"] - 0.40)
    scores["Vibrant__Energetic"] += 1.2 * max(0.0, stats["contrast"] - 0.75)
    scores["Serene__Peaceful"] += 2.0 * max(0.0, stats["light_fraction"] - 0.35)
    scores["Serene__Peaceful"] += 1.4 * max(0.0, 0.35 - stats["contrast"])
    scores["Eerie__Dark"] += 2.6 * max(0.0, stats["dark_fraction"] - 0.55)
    scores["Mysterious__Dreamy"] += 1.8 * max(0.0, 0.10 - stats["edge_density"]) * 2.0
    scores["Majestic__Epic"] += 1.4 * max(0.0, stats["contrast"] - 0.85)
    evidence = max(cue_hits(text, cues) for cues in MOOD_CUES.values())
    return decide(scores, evidence)


def label_category(text: str) -> tuple[str, float]:
    scores = {name: float(cue_hits(text, cues)) for name, cues in CATEGORY_CUES.items()}
    scores["General_Generation"] = 0.35
    evidence = max(int(score) for name, score in scores.items() if name != "General_Generation")
    return decide(scores, evidence)


def label_weather(text: str, stats: dict[str, float]) -> tuple[str, float]:
    hits = {name: cue_hits(text, cues) for name, cues in WEATHER_CUES.items()}
    scores = {name: float(count) for name, count in hits.items()}
    # Compound labels only when both constituent cues are genuinely present.
    scores["foggy_and_rainy"] = 1.6 * min(hits["foggy"], hits["rainy"])
    scores["foggy_and_snowy"] = 1.6 * min(hits["foggy"], hits["snowy"])
    scores["snowy_and_cold"] = 1.4 * hits["snowy"] if hits["snowy"] else 0.0
    scores["partly_cloudy"] = 0.9 * hits["cloudy"] if hits["cloudy"] else 0.0
    scores["clear_and_calm"] = 0.0
    scores["calm_and_clear"] = 0.0
    # No weather cue at all: the honest reading of a studio/flat-field work is
    # "clear", carried at a deliberately low confidence by the evidence damping.
    scores["clear"] += 0.45
    scores["foggy"] += 1.4 * max(0.0, 0.08 - stats["edge_density"]) * 2.0
    scores["cloudy"] += 1.2 * max(0.0, stats["mass_Gray"] - 0.35)
    evidence = max(hits.values())
    return decide(scores, evidence)


def label_colorblend(stats: dict[str, float]) -> tuple[str, float]:
    warm = stats["warm_mass"]
    cool = stats["cool_mass"]
    dark = stats["dark_fraction"]
    saturation = stats["saturation_mean"]
    accents = {
        "Accent_Noir_Red": stats["mass_Red"],
        "Accent_Noir_Blue": stats["mass_Blue"],
        "Accent_Noir_Orange": stats["mass_Orange"],
        "Accent_Noir_Green": stats["mass_Green"],
        "Accent_Noir_Yellow": stats["mass_Yellow"],
    }
    scores = {name: 0.0 for name in (
        "Cool_Oceanic_Winter", "Warm_Autumnal_Sunset", "Earth_Organic", "Accent_Noir_Red",
        "Film_Noir_Shadowy", "Balanced_Neutral", "Teal__Orange_Cinematic", "Accent_Noir_Blue",
        "Accent_Noir_Orange", "Accent_Noir_Green", "Pastel_Whimsical", "Royal_Opulent",
        "Accent_Noir_Yellow",
    )}
    noir = max(0.0, dark - 0.40)
    for name, mass in accents.items():
        scores[name] = 3.0 * noir * min(1.0, mass / 0.08) if mass > 0.02 else 0.0
    scores["Film_Noir_Shadowy"] = 3.0 * noir * max(0.0, 0.22 - saturation) * 4.0
    scores["Warm_Autumnal_Sunset"] = 2.4 * max(0.0, warm - cool) + 1.2 * max(0.0, saturation - 0.30)
    scores["Cool_Oceanic_Winter"] = 2.4 * max(0.0, cool - warm) + 0.8 * max(0.0, saturation - 0.25)
    scores["Teal__Orange_Cinematic"] = 4.0 * min(warm, cool) if min(warm, cool) > 0.12 else 0.0
    scores["Earth_Organic"] = 3.0 * (stats["mass_Orange"] + stats["mass_Yellow"] + stats["mass_Green"]) * max(
        0.0, 0.45 - saturation
    ) * 2.0
    scores["Pastel_Whimsical"] = 3.0 * max(0.0, stats["light_fraction"] - 0.35) * max(0.0, 0.35 - saturation) * 3.0
    scores["Royal_Opulent"] = 4.0 * stats["mass_Purple"] + 2.0 * min(stats["mass_Purple"], stats["mass_Yellow"])
    scores["Balanced_Neutral"] = 1.2 * max(0.0, 0.20 - abs(warm - cool)) + 1.6 * max(0.0, 0.25 - saturation)
    evidence = 3
    return decide(scores, evidence)


def label_domcolor(stats: dict[str, float]) -> tuple[str, float]:
    masses = {
        name: stats[f"mass_{name}"]
        for name in ("Red", "Gray", "Blue", "Black", "Orange", "Green", "Yellow", "White", "Purple")
    }
    winner = max(sorted(masses.items()), key=lambda item: item[1])[0]
    confidence = max(0.05, min(1.0, masses[winner]))
    return winner, round(confidence, 3)


def descriptor_labels(record: dict, enrichment: dict | None, stats: dict[str, float]) -> dict[str, dict]:
    text = evidence_text(record, enrichment)
    style = label_style(text, stats)
    medium = label_medium(text, stats)
    mood = label_mood(text, stats)
    category = label_category(text)
    weather = label_weather(text, stats)
    colorblend = label_colorblend(stats)
    domcolor = label_domcolor(stats)
    pairs = {
        "style": style,
        "medium": medium,
        "mood": mood,
        "category": category,
        "weather": weather,
        "colorblend": colorblend,
        "domcolor": domcolor,
    }
    return {task: {"label": label, "conf": confidence} for task, (label, confidence) in pairs.items()}


# --------------------------------------------------------------------------
# CLIP backend (regeneration path; see module docstring)
# --------------------------------------------------------------------------

CLIP_PROMPTS = {
    "style": "an artwork in {label} style",
    "medium": "an artwork made with {label}",
    "mood": "an artwork with a {label} mood",
    "category": "an artwork depicting {label}",
    "weather": "an artwork showing {label} weather",
    "colorblend": "an artwork with a {label} colour palette",
    "domcolor": "an artwork whose dominant colour is {label}",
}


def humanize(label: str) -> str:
    return re.sub(r"\s+", " ", label.replace("__", " and ").replace("_", " ").replace("-", " ")).strip().lower()


def clip_compute(paths: list[tuple[str, Path]], vocabularies: dict) -> tuple[dict[str, np.ndarray], dict[str, dict]]:
    """CLIP ViT-B/32 image vectors + zero-shot labels.

    Unverified in the container that produced the committed artifact: the model
    weights were unreachable there (ADR-014). Run on a machine with model
    access: `pip install torch transformers` then
    `npm run catalog:visual-index -- --backend clip`.
    """
    import torch  # noqa: PLC0415
    from transformers import CLIPModel, CLIPProcessor  # noqa: PLC0415

    name = "openai/clip-vit-base-patch32"
    model = CLIPModel.from_pretrained(name).eval()
    processor = CLIPProcessor.from_pretrained(name)

    vectors: dict[str, np.ndarray] = {}
    with torch.no_grad():
        for slug, path in paths:
            with Image.open(path) as handle:
                image = handle.convert("RGB")
            inputs = processor(images=image, return_tensors="pt")
            features = model.get_image_features(**inputs)[0]
            features = features / features.norm()
            vectors[slug] = features.numpy().astype(np.float64)

        labels: dict[str, dict] = {slug: {} for slug, _ in paths}
        for task in TASKS:
            vocabulary = vocabularies["tasks"][task]["labels"]
            prompts = [CLIP_PROMPTS[task].format(label=humanize(label)) for label in vocabulary]
            text_inputs = processor(text=prompts, return_tensors="pt", padding=True)
            text_features = model.get_text_features(**text_inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            matrix = text_features.numpy().astype(np.float64)
            for slug, _ in paths:
                similarity = matrix @ vectors[slug]
                exponent = np.exp(100.0 * (similarity - similarity.max()))
                probabilities = exponent / exponent.sum()
                index = int(np.argmax(probabilities))
                labels[slug][task] = {
                    "label": vocabulary[index],
                    "conf": round(max(0.001, float(probabilities[index])), 3),
                }
    return vectors, labels


# --------------------------------------------------------------------------
# ordering
# --------------------------------------------------------------------------

def related_and_diversity(slugs: list[str], matrix: np.ndarray) -> tuple[dict[str, list[dict]], dict[str, int]]:
    similarity = matrix @ matrix.T
    np.fill_diagonal(similarity, -np.inf)

    related: dict[str, list[dict]] = {}
    for index, slug in enumerate(slugs):
        row = similarity[index]
        order = sorted(range(len(slugs)), key=lambda other: (-row[other], slugs[other]))
        related[slug] = [
            {"slug": slugs[other], "score": round(float(row[other]), 4)} for other in order[:RELATED_COUNT]
        ]

    centroid = matrix.mean(axis=0)
    norm = float(np.linalg.norm(centroid))
    centroid = centroid / norm if norm > 1e-12 else centroid
    to_centroid = matrix @ centroid
    start = int(np.lexsort((np.asarray(slugs), -to_centroid))[0])

    placed = [start]
    remaining = [index for index in range(len(slugs)) if index != start]
    # Farthest-point traversal: each next work maximizes its minimum cosine
    # distance to everything already placed, so visually similar works are
    # pushed as far apart in the display order as the catalog allows. Ties
    # break on slug so the traversal is fully deterministic.
    min_distance = 1.0 - (matrix @ matrix[start])
    while remaining:
        # `remaining` stays in ascending-slug order, so max() returns the
        # lowest slug among ties.
        best = max(remaining, key=lambda index: min_distance[index])
        placed.append(best)
        remaining.remove(best)
        min_distance = np.minimum(min_distance, 1.0 - (matrix @ matrix[best]))
    return related, {slugs[index]: rank for rank, index in enumerate(placed)}


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Compute the ARTCOVR visual index payload.")
    parser.add_argument("--root", required=True, help="repository root")
    parser.add_argument("--out", required=True, help="payload destination (JSON)")
    parser.add_argument("--backend", choices=("descriptor", "clip"), default="descriptor")
    args = parser.parse_args()

    root = Path(args.root)
    catalog = json.loads((root / "src/lib/artcovr/curated-public.json").read_text(encoding="utf8"))
    vocabularies = json.loads((root / "scripts/catalog/fasttext-vocabularies.json").read_text(encoding="utf8"))
    enrichment_path = root / "catalog/curated-artworks.json"
    enrichment = {}
    if enrichment_path.exists():
        enrichment = {row["slug"]: row for row in json.loads(enrichment_path.read_text(encoding="utf8"))}

    records = sorted(catalog, key=lambda row: row["slug"])
    paths: list[tuple[str, Path]] = []
    for record in records:
        image = str(record["image"])
        if not image.startswith("/assets/artworks/"):
            raise SystemExit(f"{record['slug']}: unexpected display path {image}")
        path = root / "public" / image.lstrip("/")
        if not path.exists():
            raise SystemExit(f"{record['slug']}: missing display derivative {path}")
        paths.append((record["slug"], path))

    slugs = [slug for slug, _ in paths]
    if args.backend == "clip":
        vectors, labels = clip_compute(paths, vocabularies)
        vector_version, label_version = CLIP_VECTOR_VERSION, CLIP_LABEL_VERSION
    else:
        vectors = {}
        labels = {}
        for slug, path in paths:
            rgb = load_pixels(path)
            vectors[slug] = descriptor_vector(rgb)
            labels[slug] = descriptor_labels(
                next(record for record in records if record["slug"] == slug),
                enrichment.get(slug),
                image_statistics(rgb),
            )
            print(f"  computed {slug}", file=sys.stderr)
        vector_version, label_version = DESCRIPTOR_VECTOR_VERSION, DESCRIPTOR_LABEL_VERSION

    for slug, entry in labels.items():
        for task, value in entry.items():
            normalized = str(value["label"]).lower()
            if any(banned in normalized for banned in BANNED_LABEL_TERMS):
                raise SystemExit(f"{slug}/{task}: label '{value['label']}' matches a governance-banned term")

    matrix = np.vstack([vectors[slug] for slug in slugs])
    related, diversity = related_and_diversity(slugs, matrix)

    payload = {
        "backend": args.backend,
        "vectorVersion": vector_version,
        "labelVersion": label_version,
        "dimensions": VECTOR_DIMENSIONS,
        "works": {
            slug: {
                "vector": [round(float(value), 5) for value in vectors[slug]],
                "related": related[slug],
                "diversityRank": diversity[slug],
                "labels": labels[slug],
            }
            for slug in slugs
        },
    }
    Path(args.out).write_text(json.dumps(payload), encoding="utf8")
    print(f"visual payload: {len(slugs)} works, backend={args.backend}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
