"""Deterministic responsive photo exports; keep the supplied source files intact."""
from pathlib import Path
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/images/optimized"
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "people": ("inspiration", "people.png"),
    "music-base": ("inspiration", "music-base.png"),
    "music-overlay": ("inspiration", "music-overlay.png"),
    "detail": ("inspiration", "detail.png"),
    "work-amonra": ("works", "01-amonra.png"),
    "work-hermes": ("works", "02-hermes.png"),
    "work-suborbia": ("works", "03-suborbia.png"),
    "work-skynews": ("works", "04-skynews.png"),
    "work-youtube-music": ("works", "05-youtube-music.png"),
    "work-itsme": ("works", "06-itsme.png"),
}
report = {}
for key, (folder, name) in SOURCES.items():
    source = ROOT / "assets/images" / folder / name
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        sizes = (1024, 2048) if folder == "works" else (768, 1280)
        variants = []
        for width in sizes:
            target_width = min(width, image.width)
            height = round(image.height * target_width / image.width)
            resized = image.resize((target_width, height), Image.Resampling.LANCZOS)
            target = OUT / f"{key}-{width}.webp"
            save_options = {"lossless": True, "method": 6, "exact": True}
            if opened.info.get("icc_profile"):
                save_options["icc_profile"] = opened.info["icc_profile"]
            resized.save(target, "WEBP", **save_options)
            with Image.open(target) as roundtrip:
                assert roundtrip.convert(image.mode).tobytes() == resized.tobytes(), target
            variants.append({"url": f"./assets/images/optimized/{target.name}",
                             "width": target_width, "height": height,
                             "bytes": target.stat().st_size})
        report[key] = {"fallback": f"./assets/images/{folder}/{name}",
                       "originalWidth": image.width, "originalHeight": image.height,
                       "originalBytes": source.stat().st_size, "variants": variants}
print(json.dumps(report, indent=2))
(ROOT / "reference/chapter-webp-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
