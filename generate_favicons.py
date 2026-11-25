"""Generates the PRIME H2O site icon in every size browsers, Google Search,
Apple devices and the web app manifest ask for.

Design: the real PRIME / H2O lettering from public/assets/logo_header.png,
cream PRIME over bronze H2O, on a solid PRIME burgundy (#500D18) square.
The lettering is as large as it can be while every corner of it stays inside
the inscribed circle (Google and Android may show the icon round-cropped).

Google Search favicon rules: square, a multiple of 48px (48, 96, 192...),
publicly crawlable, and stable at its URL.

Run from project root: python generate_favicons.py
Writes into public/:
  favicon.ico (16, 32, 48)          favicon-16x16.png  favicon-32x32.png
  favicon-48x48.png (Google)        favicon-96x96.png  favicon-192x192.png
  favicon-512x512.png               favicon.png (192)  apple-touch-icon.png (180)
  logo-512.png (Organization logo)  favicon.svg (same icon, for old links)
"""
import base64
import io

import numpy as np
from PIL import Image, ImageFilter

SOURCE = 'public/assets/logo_header.png'
SOURCE_BG = np.array([0x6D, 0x28, 0xD9])        # Medium PRIME purple behind the lettering
PRIME_BOX = (38, 28, 565, 142)            # PRIME lettering in the source (l, t, r, b)
H2O_BOX = (236, 239, 366, 290)            # H2O lettering in the source

DEEP_PURPLE = (0x6D, 0x28, 0xD9)          # #6D28D9 (Bright medium purple)
PURE_WHITE = (255, 255, 255)              # #FFFFFF (Pure White)
SOFT_LAVENDER = (221, 214, 254)           # #DDD6FE (Light lavender/lilac)
MOUNTAIN_PURPLE = (139, 92, 246)          # #8B5CF6 (Vibrant purple)

PRIME_WIDTH = 0.80                        # share of the icon width
H2O_WIDTH = 0.42
GAP = 0.055


def lettering_mask(box, width_px):
    """Alpha mask of one lettering block, scaled to width_px with crisp edges."""
    crop = np.array(Image.open(SOURCE).convert('RGB').crop(box)).astype(float)
    distance = np.sqrt(((crop - SOURCE_BG) ** 2).sum(axis=2))
    coverage = np.clip(distance / distance.max(), 0, 1)
    mask = Image.fromarray((coverage * 255).astype(np.uint8), 'L')
    height_px = round(width_px * mask.height / mask.width)
    mask = mask.resize((width_px, height_px), Image.Resampling.LANCZOS)
    # Re-sharpen the edges that upscaling softened: steep ramp around 50% coverage.
    a = np.asarray(mask, dtype=float) / 255.0
    a = np.clip((a - 0.5) * 3.0 + 0.5, 0, 1)
    a = a * a * (3 - 2 * a)
    return Image.fromarray((a * 255).astype(np.uint8), 'L')


def build_master(size=1024):
    icon = Image.new('RGB', (size, size), DEEP_PURPLE)
    prime = lettering_mask(PRIME_BOX, round(size * PRIME_WIDTH))
    h2o = lettering_mask(H2O_BOX, round(size * H2O_WIDTH))
    gap = round(size * GAP)

    top = (size - (prime.height + gap + h2o.height)) // 2
    icon.paste(Image.new('RGB', prime.size, PURE_WHITE), ((size - prime.width) // 2, top), prime)
    icon.paste(Image.new('RGB', h2o.size, SOFT_LAVENDER), ((size - h2o.width) // 2, top + prime.height + gap), h2o)

    # Every lettering corner must sit inside the inscribed circle.
    half = size / 2
    corners = [
        (prime.width / 2, half - top),
        (h2o.width / 2, top + prime.height + gap + h2o.height - half),
    ]
    reach = max(np.hypot(x, y) for x, y in corners) / half
    assert reach <= 0.92, f'lettering reaches {reach:.2f} of the radius'
    return icon


def scaled(master, size):
    out = master.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 48:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=0))
    return out


def main():
    master = build_master(1024)

    pngs = {
        16: ['favicon-16x16.png'],
        32: ['favicon-32x32.png'],
        48: ['favicon-48x48.png'],
        96: ['favicon-96x96.png'],
        180: ['apple-touch-icon.png'],
        192: ['favicon-192x192.png', 'favicon.png'],
        512: ['favicon-512x512.png', 'logo-512.png'],
    }
    for size, names in pngs.items():
        img = scaled(master, size)
        for name in names:
            img.save(f'public/{name}', 'PNG', optimize=True)
            print(f'wrote public/{name} ({size}x{size})')

    ico_frames = [scaled(master, s) for s in (48, 32, 16)]
    ico_frames[0].save('public/favicon.ico', format='ICO', sizes=[(48, 48), (32, 32), (16, 16)],
                       append_images=ico_frames[1:])
    print('wrote public/favicon.ico (16, 32, 48)')

    # SVG wrapper around the 192px icon: the page Google indexed first linked
    # /favicon.svg, so that URL must keep returning this icon, not a web page.
    buf = io.BytesIO()
    scaled(master, 192).save(buf, 'PNG', optimize=True)
    data = base64.b64encode(buf.getvalue()).decode('ascii')
    with open('public/favicon.svg', 'w', encoding='utf-8', newline='\n') as f:
        f.write(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="192" height="192" viewBox="0 0 192 192">'
            '<title>PRIME H2O</title>'
            f'<image width="192" height="192" xlink:href="data:image/png;base64,{data}"/></svg>\n'
        )
    print('wrote public/favicon.svg (192x192 icon)')


if __name__ == '__main__':
    main()
