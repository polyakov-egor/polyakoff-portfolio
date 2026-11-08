"""Build responsive hero textures from the approved portrait/depth exports."""
from pathlib import Path
import base64
import json
import shutil
import sys
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
out = root / 'assets/images/hero'
out.mkdir(parents=True, exist_ok=True)
sources = {'portrait': Path(sys.argv[1]), 'depth': Path(sys.argv[2])}
report = {}
for name, source in sources.items():
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
        full = out / f'{name}-2456.webp'
        shutil.copyfile(source, full)
        small = image.resize((1280, round(image.height * 1280 / image.width)), Image.Resampling.LANCZOS)
        small.save(out / f'{name}-1280.webp', lossless=name == 'depth', quality=95, method=6, exact=True)
        report[name] = {'source': str(source), 'size': list(image.size), 'fullBytes': full.stat().st_size,
                        'smallBytes': (out / f'{name}-1280.webp').stat().st_size}

bundle = {}
for key, filename in {'color': 'portrait-2456.webp', 'depth': 'depth-2456.webp',
                      'colorSmall': 'portrait-1280.webp', 'depthSmall': 'depth-1280.webp'}.items():
    bundle[key] = 'data:image/webp;base64,' + base64.b64encode((out / filename).read_bytes()).decode('ascii')
(root / 'assets/images/hero-textures.js').write_text(
    '/* Responsive WebP textures for file:// preview; HTTP uses individual assets. */\n'
    + 'window.HERO_TEXTURES = ' + json.dumps(bundle, separators=(',', ':')) + ';\n', encoding='utf-8')
(root / 'reference/hero-webp-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
