"""Prepare responsive, lossless Services delivery assets without changing source art."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT.parent / "Сервисы" / "assets"
OUTPUT = ROOT / "assets/images/optimized"
OUTPUT.mkdir(parents=True, exist_ok=True)

report = {"photos": {}, "shared": {}, "icons": {}}
ALIASES = {"web": "music-overlay", "motion": "music-base"}
for kind in ("web", "app", "motion"):
    source = SOURCE / "images" / f"service-{kind}.png"
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        # The supplied RGBA Web image is entirely opaque; retain exact RGB.
        if "A" in image.getbands():
            assert image.getchannel("A").getextrema() == (255, 255)
        image = image.convert("RGB")
        variants = []
        for width in (768, 1280):
            height = round(image.height * width / image.width)
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            delivery_key = ALIASES.get(kind, f"services-{kind}")
            target = OUTPUT / f"{delivery_key}-{width}.webp"
            options = {"lossless": True, "method": 6, "exact": True}
            if opened.info.get("icc_profile"):
                options["icc_profile"] = opened.info["icc_profile"]
            if kind not in ALIASES:
                resized.save(target, "WEBP", **options)
            else:
                # Earlier Inspiration uses these exact supplied photographs.
                # Verify and reuse its existing optimized URL and decoded image.
                assert target.is_file(), target
            with Image.open(target) as decoded:
                assert decoded.convert("RGB").tobytes() == resized.tobytes(), target
            variants.append({"url": f"./assets/images/optimized/{target.name}",
                             "width": width, "height": height,
                             "bytes": target.stat().st_size})
        report["photos"][f"services-{kind}"] = {
            "originalWidth": image.width, "originalHeight": image.height,
            "originalBytes": source.stat().st_size,
            "deliveryKey": ALIASES.get(kind, f"services-{kind}"),
            "reusedFromInspiration": kind in ALIASES,
            "fallback": variants[-1]["url"], "variants": variants,
        }

background = ROOT / "assets/images/backgrounds/dark.webp"
with Image.open(SOURCE / "images/services-background.png") as source, Image.open(background) as shared:
    assert source.size == shared.size
    assert ImageChops.difference(source.convert("RGB"), shared.convert("RGB")).getbbox() is None
report["shared"]["background"] = {"url": "./assets/images/backgrounds/dark.webp",
                                   "bytes": background.stat().st_size, "exactPixels": True}

for name in ("InterTight-Variable.ttf", "RobotoMono-Regular.ttf"):
    original = SOURCE / "fonts" / name
    shared = ROOT / "assets/fonts" / name
    assert hashlib.sha256(original.read_bytes()).digest() == hashlib.sha256(shared.read_bytes()).digest()
    report["shared"][name] = {"url": f"./assets/fonts/{name}", "identicalBytes": True}

original = SOURCE / "icons/plus.svg"
shared = ROOT / "assets/icons/plus.svg"
assert original.read_bytes() == shared.read_bytes()
report["shared"]["plus"] = {"url": "./assets/icons/plus.svg", "identicalBytes": True}

for name in ("approach.svg", "approach-mobile.svg"):
    target = ROOT / "assets/icons" / f"services-{name}"
    shutil.copyfile(SOURCE / "icons" / name, target)
    report["icons"][name] = {"url": f"./assets/icons/{target.name}", "bytes": target.stat().st_size}

report["totalPhotoBytes"] = sum(v["bytes"] for p in report["photos"].values() for v in p["variants"])
report["largestViewportPhotoBytes"] = sum(p["variants"][-1]["bytes"] for p in report["photos"].values())
report["newPhotoBytes"] = sum(v["bytes"] for p in report["photos"].values() if not p["reusedFromInspiration"] for v in p["variants"])
report["newPhoneDownloadBytes"] = report["photos"]["services-app"]["variants"][0]["bytes"]
report["newDesktopDownloadBytes"] = report["photos"]["services-app"]["variants"][1]["bytes"]
text = json.dumps(report, indent=2)
(ROOT / "reference/services-webp-report.json").write_text(text + "\n", encoding="utf-8")
print(text)
