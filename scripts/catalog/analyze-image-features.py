"""Build deterministic, SHA-bound visual search features for ARTCOVR sources.

The script never edits source images. It verifies every source against the
private source map, samples decoded pixels, and writes one derived record per
catalog artwork. Human-authored subjects and moods remain separate fields.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
from pathlib import Path
from statistics import fmean, pstdev

from PIL import Image, ImageChops, ImageFilter, ImageStat


DEFAULT_CATALOG = Path(r"C:\Users\serge\Desktop\ARTCOVR\catalog\curated-artworks.json")
DEFAULT_SOURCE_MAP = Path(r"E:\ART_COLLECTION\.artcovr-private\direct-source-map.local.json")
DEFAULT_OUTPUT = Path(r"E:\ART_COLLECTION\.artcovr-curation\image-color-features.json")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def srgb_luminance(rgb: tuple[int, int, int]) -> float:
    channels = []
    for component in rgb:
        value = component / 255
        channels.append(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def color_family(rgb: tuple[int, int, int]) -> str:
    red, green, blue = (component / 255 for component in rgb)
    hue, saturation, value = colorsys.rgb_to_hsv(red, green, blue)
    degrees = hue * 360
    if saturation < 0.10:
        if value < 0.16:
            return "black"
        if value > 0.91:
            return "white"
        if value > 0.74 and red > blue * 1.03:
            return "cream"
        return "gray"
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


def dominant_palette(image: Image.Image) -> tuple[list[str], list[str]]:
    sampled = image.resize((128, 128), Image.Resampling.LANCZOS)
    quantized = sampled.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    total = sum(count for count, _ in counts) or 1
    hexes: list[str] = []
    families: list[str] = []
    for count, index in counts:
        if count / total < 0.025 and len(hexes) >= 5:
            continue
        offset = index * 3
        rgb = tuple(palette[offset : offset + 3])
        if len(rgb) != 3:
            continue
        hexes.append("#" + "".join(f"{component:02x}" for component in rgb))
        family = color_family(rgb)  # type: ignore[arg-type]
        if family not in families:
            families.append(family)
        if len(hexes) == 5:
            break
    return hexes, families[:4]


def difference_hash(image: Image.Image, size: int = 16) -> str:
    """Return a deterministic perceptual fingerprint used only for clustering."""
    gray = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(gray.get_flattened_data())
    bits = []
    for row in range(size):
        offset = row * (size + 1)
        for column in range(size):
            bits.append(pixels[offset + column] > pixels[offset + column + 1])
    return f"{int(''.join('1' if bit else '0' for bit in bits), 2):0{size * size // 4}x}"


def classify_temperature(pixels: list[tuple[int, int, int]]) -> str:
    warm = 0.0
    cool = 0.0
    for red, green, blue in pixels:
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        weight = saturation * (0.35 + value)
        degrees = hue * 360
        if degrees < 75 or degrees >= 330:
            warm += weight
        elif 155 <= degrees < 300:
            cool += weight
    if warm > cool * 1.25:
        return "warm"
    if cool > warm * 1.25:
        return "cool"
    return "balanced"


def analyze(path: Path) -> dict[str, object]:
    with Image.open(path) as opened:
        opened.load()
        image = opened.convert("RGB")
    width, height = image.size
    sample = image.resize((96, 96), Image.Resampling.LANCZOS)
    pixels = list(sample.get_flattened_data())
    luminances = [srgb_luminance(pixel) for pixel in pixels]
    saturations = [colorsys.rgb_to_hsv(*(component / 255 for component in pixel))[1] for pixel in pixels]
    average_luminance = fmean(luminances)
    average_saturation = fmean(saturations)
    contrast = pstdev(luminances)
    palette, families = dominant_palette(image)

    gray = sample.convert("L")
    entropy = gray.entropy() / 8
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_density = fmean(value / 255 for value in edges.get_flattened_data())
    horizontal_delta = ImageStat.Stat(ImageChops.difference(gray, gray.transform(gray.size, Image.Transform.AFFINE, (1, 0, 1, 0, 1, 0)))).mean[0] / 255
    vertical_delta = ImageStat.Stat(ImageChops.difference(gray, gray.transform(gray.size, Image.Transform.AFFINE, (1, 0, 0, 0, 1, 1)))).mean[0] / 255
    center = gray.crop((24, 24, 72, 72))
    outer_activity = max(0.001, ImageStat.Stat(gray).stddev[0])
    center_ratio = ImageStat.Stat(center).stddev[0] / outer_activity

    brightness = "dark" if average_luminance < 0.22 else "light" if average_luminance > 0.58 else "balanced"
    saturation = "muted" if average_saturation < 0.24 else "vivid" if average_saturation > 0.55 else "balanced"
    temperature = classify_temperature(pixels)
    lighting = (
        "low-key, high-contrast illumination"
        if average_luminance < 0.24 and contrast > 0.22
        else "soft high-key illumination"
        if average_luminance > 0.58 and contrast < 0.22
        else "luminous high-contrast illumination"
        if contrast > 0.28
        else "balanced diffuse illumination"
    )
    texture = (
        "smooth minimal digital surfaces"
        if edge_density < 0.10 and entropy < 0.72
        else "dense illustrative texture"
        if edge_density > 0.20 or entropy > 0.88
        else "crisp graphic digital texture"
    )
    weighting = "center-weighted" if center_ratio > 1.12 else "open-field" if center_ratio < 0.78 else "distributed"
    orientation = (
        "vertical emphasis"
        if horizontal_delta > vertical_delta * 1.16
        else "horizontal emphasis"
        if vertical_delta > horizontal_delta * 1.16
        else "balanced directional energy"
    )
    composition = f"{weighting} square composition with {orientation}"

    return {
        "width": width,
        "height": height,
        "dominantHex": palette,
        "colorFamilies": families,
        "averageLuminance": round(average_luminance, 6),
        "averageSaturation": round(average_saturation, 6),
        "contrast": round(contrast, 6),
        "edgeDensity": round(edge_density, 6),
        "entropy": round(entropy, 6),
        "brightness": brightness,
        "saturation": saturation,
        "temperature": temperature,
        "lighting": lighting,
        "mediumAndTexture": texture,
        "compositionAndMotion": composition,
        "perceptualHash": {
            "algorithm": "dhash-16x16-luma",
            "value": difference_hash(image),
        },
        "provenance": {
            "method": "deterministic decoded-pixel analysis",
            "identityJoin": "catalog id plus recomputed source SHA-256",
            "humanAuthored": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--source-map", type=Path, default=DEFAULT_SOURCE_MAP)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    catalog = json.loads(arguments.catalog.read_text(encoding="utf-8"))
    source_map = json.loads(arguments.source_map.read_text(encoding="utf-8"))
    if len(catalog) != 100 or len(source_map) != len(catalog):
        raise SystemExit("Expected one private source mapping for each of the exact 100 catalog records.")
    sources = {entry["id"]: entry for entry in source_map}
    records = []
    identities = []
    for artwork in catalog:
        source = sources.get(artwork["id"])
        if source is None or source["sha256"] != artwork["sha256"]:
            raise SystemExit(f"Source-map identity mismatch for {artwork['id']}.")
        source_path = Path(source["sourceAbsolutePath"])
        if not source_path.is_file():
            raise SystemExit(f"Missing source for {artwork['id']}: {source_path}")
        actual_sha = sha256_file(source_path)
        if actual_sha != artwork["sha256"]:
            raise SystemExit(f"Source SHA mismatch for {artwork['id']}.")
        features = analyze(source_path)
        if features["width"] != artwork["width"] or features["height"] != artwork["height"]:
            raise SystemExit(f"Decoded dimensions mismatch for {artwork['id']}.")
        records.append({"id": artwork["id"], "sha256": actual_sha, **features})
        identities.append({"id": artwork["id"], "sha256": actual_sha})

    payload = {
        "schemaVersion": 1,
        "catalogIdentitySha256": canonical_sha256(identities),
        "recordCount": len(records),
        "records": records,
    }
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(arguments.output), "records": len(records), "catalogIdentitySha256": payload["catalogIdentitySha256"]}))


if __name__ == "__main__":
    main()
