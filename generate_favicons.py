"""Generates the PRIME H2O site icons (browser tab, Google Search result, home-screen icons).

Design: the real 500 mL PRIME H2O bottle photo on a cream disc with a bronze ring, framed by PRIME
maroon. Google shows the favicon inside a small circle, so everything important sits inside the disc.

Run from the project root:  python generate_favicons.py
Writes public/favicon.ico (16/32/48), favicon-16x16/32x32/48x48/192x192/512x512.png,
apple-touch-icon.png (180) and logo-512.png (structured-data logo).
"""
from PIL import Image, ImageDraw

SOURCE = 'public/assets/bottle_500ml.png'
MAROON, MAROON_DEEP = (80, 13, 24), (62, 9, 18)
CREAM, BRONZE = (251, 247, 242), (198, 154, 112)


def master_icon(size=1024):
    s = size
    # soft vertical maroon gradient background
    grad = Image.new('RGBA', (1, s))
    for y in range(s):
        t = y / (s - 1)
        grad.putpixel((0, y), tuple(int(MAROON[i] * (1 - t) + MAROON_DEEP[i] * t) for i in range(3)) + (255,))
    img = grad.resize((s, s))

    # bronze ring + cream disc
    d = ImageDraw.Draw(img)
    c = s / 2
    r_outer = s * 0.455
    r_inner = r_outer - s * 0.022
    d.ellipse([c - r_outer, c - r_outer, c + r_outer, c + r_outer], fill=BRONZE + (255,))
    d.ellipse([c - r_inner, c - r_inner, c + r_inner, c + r_inner], fill=CREAM + (255,))

    # the bottle photo, cropped to its outline, as large as the disc allows
    bottle = Image.open(SOURCE).convert('RGBA')
    bottle = bottle.crop(bottle.getbbox())
    bh = int(s * 0.84)
    bw = int(bh * bottle.width / bottle.height)
    bottle = bottle.resize((bw, bh), Image.Resampling.LANCZOS)
    img.alpha_composite(bottle, (int(c - bw / 2), int(c - bh / 2 + s * 0.005)))
    return img


def main():
    master = master_icon(1024)
    outputs = {
        16: 'public/favicon-16x16.png',
        32: 'public/favicon-32x32.png',
        48: 'public/favicon-48x48.png',
        180: 'public/apple-touch-icon.png',
        192: 'public/favicon-192x192.png',
        512: 'public/favicon-512x512.png',
    }
    for size, path in outputs.items():
        master.resize((size, size), Image.Resampling.LANCZOS).convert('RGB').save(path, 'PNG', optimize=True)
        print(f'wrote {path}')
    master.resize((512, 512), Image.Resampling.LANCZOS).convert('RGB').save('public/logo-512.png', 'PNG', optimize=True)
    print('wrote public/logo-512.png')
    master.convert('RGB').save('public/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
    print('wrote public/favicon.ico')


if __name__ == '__main__':
    main()
