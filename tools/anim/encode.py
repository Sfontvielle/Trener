"""Кадры PNG → зацикленный анимированный WebP + постер JPEG (кадр нижней точки) для списков.
python3 encode.py <dir> <out.webp> [width]  — кадры уменьшаются (сглаживание)."""
import sys, glob, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 640
files = sorted(glob.glob(os.path.join(src, '*.png')))
frames = []
for f in files:
    im = Image.open(f).convert('RGB')
    h = round(im.height * width / im.width)
    frames.append(im.resize((width, h), Image.LANCZOS))
os.makedirs(os.path.dirname(out), exist_ok=True)
fps = float(os.environ.get('FPS', '25'))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, quality=int(os.environ.get('Q', '78')), method=6)
# постер: середина цикла (крайняя точка амплитуды), 360 px
poster_dir = os.path.join(os.path.dirname(out), 'posters')
os.makedirs(poster_dir, exist_ok=True)
mid = frames[len(frames) // 2]
p = mid.resize((360, round(mid.height * 360 / mid.width)), Image.LANCZOS)
poster = os.path.join(poster_dir, os.path.basename(out).replace('.webp', '.jpg'))
p.save(poster, quality=82, optimize=True, progressive=True)
print(out, len(frames), 'frames', round(os.path.getsize(out) / 1024), 'KB; poster', round(os.path.getsize(poster) / 1024), 'KB')
