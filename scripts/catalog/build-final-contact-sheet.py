from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PROJECT = Path(__file__).resolve().parents[2]
CURATION = Path(r"E:\ART_COLLECTION\.artcovr-curation")
OUTPUT = CURATION / "final-100"
ASSETS = PROJECT / "outputs" / "catalog" / "review-assets"

records = json.loads((PROJECT / "catalog" / "curated-artworks.json").read_text(encoding="utf-8"))
if len(records) != 100:
    raise RuntimeError(f"Expected exactly 100 curated records, received {len(records)}")

OUTPUT.mkdir(parents=True, exist_ok=True)
thumb = 224
label = 52
gap = 10
cols = 10
rows = 10
sheet = Image.new("RGB", (cols * (thumb + gap) + gap, rows * (thumb + label + gap) + gap), "#111111")
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=16)
small = ImageFont.load_default(size=12)

identity_rows = []
for index, record in enumerate(records):
    source = ASSETS / f"{record['slug']}.jpg"
    if not source.exists():
        raise FileNotFoundError(source)
    image = Image.open(source).convert("RGB")
    image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
    x = gap + (index % cols) * (thumb + gap)
    y = gap + (index // cols) * (thumb + label + gap)
    sheet.paste(image, (x, y))
    title = record["title"]
    if len(title) > 27:
        title = title[:26] + "…"
    draw.text((x, y + thumb + 4), f"{index + 1:03} {title}", fill="white", font=font)
    draw.text((x, y + thumb + 25), record["sha256"][:12], fill="#b5b5b5", font=small)
    identity_rows.append(
        {
            "position": index + 1,
            "id": record["id"],
            "slug": record["slug"],
            "title": record["title"],
            "sourcePool": record["sourcePool"],
            "sourceOrdinal": record.get("sourceOrdinal"),
            "sha256": record["sha256"],
            "category": record["category"],
            "moodTags": record["moodTags"],
            "rightsApproved": record["rightsApproved"],
        }
    )

sheet_path = OUTPUT / "ARTCOVR_final_100_contact_sheet.jpg"
map_path = OUTPUT / "ARTCOVR_final_100_id_title_map.json"
sheet.save(sheet_path, "JPEG", quality=92, optimize=True)
map_path.write_text(json.dumps(identity_rows, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"records": len(records), "sheet": str(sheet_path), "map": str(map_path)}, indent=2))
