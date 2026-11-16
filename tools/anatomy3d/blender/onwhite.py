"""PNG с прозрачным фоном → на белый фон с мягким свечением подсвеченных мышц; несколько кадров — в один лист.
python onwhite.py out.png a.png b.png ...   (GLOW=0 — без свечения)"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

out, files = sys.argv[1], sys.argv[2:]
GLOW = float(os.environ.get('GLOW', '0.45'))
GLOW_COLOR = np.array([1.0, 0.42, 0.16])

def glow_mask(im):
    """Маска свечения: насыщенные тёплые пиксели (подсветка мышц), размытая в ореол."""
    a = np.asarray(im).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    warm = (r > g) & (g >= b * 0.6)
    m = np.clip((sat - 0.25) / 0.35, 0, 1) * warm * a[..., 3]
    mi = Image.fromarray((m * 255).astype(np.uint8), 'L')
    return np.asarray(mi.filter(ImageFilter.GaussianBlur(im.width / 70))).astype(np.float32) / 255

ims = []
for f in files:
    im = Image.open(f).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    base = np.asarray(bg.convert('RGB')).astype(np.float32) / 255
    if GLOW > 0:
        L = (glow_mask(im) * GLOW)[..., None]
        base = np.clip(base * (1 - L) + L * GLOW_COLOR * np.maximum(base, 0.85), 0, 1)
    ims.append(Image.fromarray((base * 255).astype(np.uint8)))
w = sum(i.width for i in ims) + 10 * (len(ims) - 1)
sheet = Image.new('RGB', (w, max(i.height for i in ims)), (235, 235, 235))
x = 0
for i in ims:
    sheet.paste(i, (x, 0)); x += i.width + 10
sheet.save(out)
