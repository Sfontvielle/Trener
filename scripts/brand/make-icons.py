"""Иконка и заставка RYNJI: кольцо прогресса + три растущих столбика (прогрессия). Запуск: python3 scripts/brand/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets')
BG = (10, 11, 13)
LIME = (200, 245, 60)
LIME_DIM = (200, 245, 60, 46)
SS = 4  # суперсэмплинг для гладких краёв


def mark(size, bg=True, mono=None, scale=1.0):
    S = size * SS
    img = Image.new('RGBA', (S, S), BG + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        # мягкое свечение в центре
        glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        r0 = int(S * 0.42 * scale)
        g.ellipse([S / 2 - r0, S / 2 - r0, S / 2 + r0, S / 2 + r0], fill=(200, 245, 60, 38))
        glow = glow.filter(ImageFilter.GaussianBlur(S * 0.09))
        img = Image.alpha_composite(img, glow)
        d = ImageDraw.Draw(img)
    col = mono or LIME
    c = S / 2
    R = S * 0.33 * scale
    w = S * 0.075 * scale
    # фоновое кольцо — отдельным слоем (полупрозрачное поверх фона)
    track = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(track).ellipse([c - R, c - R, c + R, c + R], outline=col[:3] + (60,), width=int(w))
    img = Image.alpha_composite(img, track)
    d = ImageDraw.Draw(img)
    # дуга прогресса 270° с круглыми концами
    start, end = -90, 180
    d.arc([c - R, c - R, c + R, c + R], start=start, end=end, fill=col, width=int(w))
    for ang in (start, end):
        a = math.radians(ang)
        x, y = c + (R - w / 2) * math.cos(a), c + (R - w / 2) * math.sin(a)
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)
    # три растущих столбика внутри
    bw = S * 0.072 * scale
    gap = S * 0.04 * scale
    base = c + S * 0.12 * scale
    heights = [0.13, 0.2, 0.28]
    x0 = c - (3 * bw + 2 * gap) / 2
    for i, h in enumerate(heights):
        x = x0 + i * (bw + gap)
        d.rounded_rectangle([x, base - S * h * scale, x + bw, base], radius=bw / 2, fill=col)
    return img.resize((size, size), Image.LANCZOS)


def save(img, name, rgb=False):
    p = os.path.join(ROOT, name)
    (img.convert('RGB') if rgb else img).save(p)
    print('written', name, img.size)


save(mark(1024), 'icon.png', rgb=True)  # iOS: без прозрачности
save(mark(1024, bg=False, scale=1.0), 'splash-icon.png')
save(mark(1024, bg=False, scale=0.62), 'android-icon-foreground.png')
save(Image.new('RGB', (1024, 1024), BG), 'android-icon-background.png', rgb=True)
save(mark(1024, bg=False, mono=(255, 255, 255), scale=0.62), 'android-icon-monochrome.png')
save(mark(48), 'favicon.png', rgb=True)
