"""Иллюстрации для приложения: PNG рендера (tools/anim/out/art) → WebP с прозрачностью в assets/art.
python3 tools/anim/art.py — размеры под экраны iPhone @3x; энергия: python3 tools/anim/energy.py tools/anim/out/art/energy.png"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'out', 'art')
DST = os.path.join(ROOT, '..', '..', 'assets', 'art')
os.makedirs(DST, exist_ok=True)
# имя: (рамка обрезки в долях кадра или None, итоговая ширина)
JOBS = {
    'welcome': (None, 1080),
    'energy': (None, 1080),
    'home_hero': (None, 900),
    # торсы: грудь — пресс, без шеи и шорт
    'goal_bulk': ((0.08, 0.04, 0.92, 0.86), 420),
    'goal_cut': ((0.08, 0.04, 0.92, 0.86), 420),
    'goal_recomp': ((0.08, 0.04, 0.92, 0.86), 420),
    'goal_maintain': ((0.12, 0.22, 0.88, 0.78), 420),
    'tip_plate': (None, 480),
}
for name, (box, width) in JOBS.items():
    src = os.path.join(SRC, f'{name}.png')
    if not os.path.exists(src):
        print('нет', src)
        continue
    im = Image.open(src).convert('RGBA')
    if box:
        w, h = im.size
        im = im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = os.path.join(DST, f'{name}.webp')
    im.save(out, 'WEBP', quality=84, method=6)
    print(name, im.size, round(os.path.getsize(out) / 1024), 'KB')
