"""Слой «энергии» для приветствия: зелёные разряды со свечением за атлетом (прозрачный PNG).
python3 tools/anim/energy.py <out.png> [W H seed] — разряды строятся смещением середин (фрактальная молния),
свечение — несколько размытий одного рисунка. Собственная генерация, без сторонних изображений."""
import sys, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

out = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
rnd = random.Random(int(sys.argv[4]) if len(sys.argv) > 4 else 7)
LIME = (178, 255, 60)


def bolt(a, b, disp, depth):
    """Ломаная от a к b: середина каждого отрезка смещается поперёк на случайную величину"""
    if depth == 0:
        return [a, b]
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = (dx * dx + dy * dy) ** 0.5 or 1
    off = rnd.uniform(-disp, disp)
    m = (mx - dy / n * off, my + dx / n * off)
    return bolt(a, m, disp / 1.9, depth - 1)[:-1] + bolt(m, b, disp / 1.9, depth - 1)


def layer():
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    # главные разряды: из-за плеч к краям кадра, чуть вверх — как вспышка за спиной
    cy = H * 0.36
    mains = [((W * 0.5, cy), (-W * 0.05, cy - H * 0.13)), ((W * 0.5, cy), (W * 1.05, cy - H * 0.17)), ((W * 0.5, cy + H * 0.03), (-W * 0.05, cy + H * 0.1)), ((W * 0.5, cy + H * 0.02), (W * 1.05, cy + H * 0.12))]
    for a, b in mains:
        pts = bolt(a, b, W * 0.09, 7)
        d.line(pts, fill=255, width=max(2, W // 300))
        # ответвления
        for _ in range(4):
            i = rnd.randrange(len(pts) // 4, len(pts) - 2)
            s = pts[i]
            e = (s[0] + rnd.uniform(-W * 0.18, W * 0.18), s[1] + rnd.uniform(-H * 0.09, H * 0.09))
            d.line(bolt(s, e, W * 0.04, 5), fill=150, width=max(1, W // 600))
    return img


core = layer()
glow = Image.new('L', (W, H), 0)
for r, k in [(3, 1.0), (10, 0.9), (28, 0.8), (70, 0.7)]:
    g = core.filter(ImageFilter.GaussianBlur(r)).point(lambda v, k=k: min(255, int(v * k * 3.2)))
    glow = ImageChops.lighter(glow, g)
alpha = ImageChops.lighter(glow, core)
rgba = Image.new('RGBA', (W, H), LIME + (0,))
# сердцевина разряда — почти белая
white = Image.new('RGBA', (W, H), (240, 255, 210, 0))
rgba.putalpha(alpha)
white.putalpha(core.filter(ImageFilter.GaussianBlur(1)))
rgba.alpha_composite(white)
rgba.save(out, optimize=True)
print(out, W, H)
