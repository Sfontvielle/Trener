"""Скриншоты App Store 1290×2796 (iPhone 6,7″): подпись «тренер, а не трекер» + экран в рамке.
Вход: store/raw/*.png (scripts/brand/appstore-shots.cjs). Выход: store/appstore/*.png"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'store')
RAW = os.path.join(ROOT, 'raw')
OUT = os.path.join(ROOT, 'appstore')
os.makedirs(OUT, exist_ok=True)
W, H = 1290, 2796
BG = (10, 11, 13)
LIME = (200, 245, 60)
FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

CAPTIONS = {
    '1-today': ('Тренер, а не трекер', 'Каждое утро — готовый план дня:\nтренировка, КБЖУ, шаги и главный фокус'),
    '2-why': ('Каждое решение объяснено', 'Что делать, почему, на каких данных\nи насколько тренер уверен'),
    '3-workout': ('Прогрессия по твоим подходам', 'Вес и повторы — из истории и запаса RIR.\nТаймер отдыха — сам'),
    '4-weekly': ('Разбор недели как у тренера', 'Вес, талия, сила, сон —\nи решения на следующую неделю'),
    '5-labs': ('Анализы: что изменилось', 'PDF или фото бланка, история показателей.\nБез диагнозов — с подсказкой, когда к врачу'),
    '6-nutrition': ('Питание подстраивается под тебя', 'Формула — только старт.\nДальше — твой фактический расход'),
    '7-progress': ('Видно, как ты меняешься', 'Тренды веса и силы, замеры\nи фото «месяц назад / сейчас»'),
}


def compose(name, title, sub):
    shot = Image.open(os.path.join(RAW, f'{name}.png')).convert('RGB')
    img = Image.new('RGB', (W, H), BG)
    # свечение
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W * 0.1, -300, W * 0.9, 700], fill=LIME + (40,))
    img.paste(Image.alpha_composite(img.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(160))).convert('RGB'))
    d = ImageDraw.Draw(img)
    d.text((W / 2, 150), 'RYNJI', font=ImageFont.truetype(FONT_B, 44), fill=LIME, anchor='mm')
    size = 82
    while ImageFont.truetype(FONT_B, size).getlength(title) > W - 120 and size > 40:
        size -= 2
    d.text((W / 2, 285), title, font=ImageFont.truetype(FONT_B, size), fill=(245, 246, 240), anchor='mm')
    d.multiline_text((W / 2, 440), sub, font=ImageFont.truetype(FONT, 46), fill=(170, 174, 165), anchor='mm', align='center', spacing=16)
    # экран в рамке со скруглением
    sw = 1050
    sh = int(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    top = 620
    maxh = H - top - 80
    if sh > maxh:
        shot = shot.crop((0, 0, sw, maxh))
        sh = maxh
    mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=70, fill=255)
    x = (W - sw) // 2
    frame = Image.new('RGB', (sw + 24, sh + 24), (40, 42, 38))
    fmask = Image.new('L', frame.size, 0)
    ImageDraw.Draw(fmask).rounded_rectangle([0, 0, frame.width, frame.height], radius=82, fill=255)
    img.paste(frame, (x - 12, top - 12), fmask)
    img.paste(shot, (x, top), mask)
    img.save(os.path.join(OUT, f'{name}.png'))
    print('written', name)


for n, (t, s) in CAPTIONS.items():
    if os.path.exists(os.path.join(RAW, f'{n}.png')):
        compose(n, t, s)
