"""Кадры PNG (прозрачный фон) → белый фон с мягким свечением подсветки → зацикленный WebP + постер JPEG (пик движения).
python encode_clip.py <frames_dir> <out.webp> [width]   (формат как у tools/anim/encode.py: 640 px, 25 к/с, постер 360 px)"""
import glob, os, sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 640
GLOW = float(os.environ.get('GLOW', '0.45'))
COLOR = np.array([1.0, 0.42, 0.16])

def on_white(im):
    a = np.asarray(im).astype(np.float32) / 255
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    base = np.asarray(bg.convert('RGB')).astype(np.float32) / 255
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    warm = (a[..., 0] > a[..., 1]) & (a[..., 1] >= a[..., 2] * 0.6)
    m = np.clip((sat - 0.25) / 0.35, 0, 1) * warm * a[..., 3]
    L = np.asarray(Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(im.width / 70))).astype(np.float32) / 255
    L = (L * GLOW)[..., None]
    base = np.clip(base * (1 - L) + L * COLOR * np.maximum(base, 0.85), 0, 1)
    return Image.fromarray((base * 255).astype(np.uint8))

files = sorted(glob.glob(os.path.join(src, '[0-9]*.png')))
frames = []
for f in files:
    im = on_white(Image.open(f).convert('RGBA'))
    frames.append(im.resize((width, round(im.height * width / im.width)), Image.LANCZOS) if im.width != width else im)
os.makedirs(os.path.dirname(out), exist_ok=True)
fps = float(os.environ.get('FPS', '25'))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, quality=int(os.environ.get('Q', '78')), method=6)
poster_dir = os.path.join(os.path.dirname(out), 'posters'); os.makedirs(poster_dir, exist_ok=True)
pk = frames[int(len(frames) * float(os.environ.get('POSTER_T', '0.5')))]          # пик/пауза в сокращении
pk.resize((360, round(pk.height * 360 / pk.width)), Image.LANCZOS).save(os.path.join(poster_dir, os.path.basename(out).replace('.webp', '.jpg')), quality=82, optimize=True, progressive=True)
print(out, len(frames), 'frames', round(os.path.getsize(out) / 1024), 'KB')
