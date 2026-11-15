"""Generates the official PRIME H2O site icons and favicons for browser tabs,
Google Search results, Apple Touch devices, and PWA web app manifests.

Google Search Favicon Guidelines:
- Square image, multiple of 48px (48x48, 96x96, 192x192, 512x512).
- Google rescales to 16x16 in search results next to the site name.
- Safe zone: Google displays the icon inside a circular crop in mobile and desktop search,
  so all essential elements (PRIME H2O typography and bronze circular frame) must stay
  within r <= 0.46 * size.

Run from project root: python generate_favicons.py
Writes:
  public/favicon.ico (16, 32, 48)
  public/favicon-16x16.png
  public/favicon-32x32.png
  public/favicon-48x48.png   (Primary Google Search Favicon)
  public/favicon-96x96.png
  public/apple-touch-icon.png (180x180)
  public/favicon-192x192.png
  public/favicon-512x512.png
  public/logo-512.png        (Schema.org Organization logo)
"""
from PIL import Image, ImageDraw
import numpy as np

SOURCE_HEADER = 'public/assets/logo_header.png'
MAROON_TOP = (84, 13, 24)
MAROON_BOTTOM = (56, 8, 16)
BRONZE = (198, 154, 112)
CREAM = (251, 247, 242)


def build_master_icon(size=1024):
    header = Image.open(SOURCE_HEADER).convert('RGBA')

    # Extract PRIME text
    prime_crop = header.crop((36, 28, 564, 142))

    # Extract H2O text
    arr = np.array(header)
    bg = arr[0, 0]
    diff = np.abs(arr[:, :, :3].astype(int) - bg[:3].astype(int)).sum(axis=2)
    h2o_mask = (diff > 40)
    h2o_mask[:200, :] = False
    h2o_rows = np.where(h2o_mask.any(axis=1))[0]
    h2o_cols = np.where(h2o_mask.any(axis=0))[0]
    h2o_crop = header.crop((h2o_cols[0], h2o_rows[0], h2o_cols[-1] + 1, h2o_rows[-1] + 1))

    # Clean transparency for crisp compositing
    def clean_alpha(crop_img):
        c_arr = np.array(crop_img).astype(float)
        bg_col = np.array([83.0, 11.0, 22.0])
        dist = np.sqrt(np.sum((c_arr[:, :, :3] - bg_col) ** 2, axis=2))
        alpha = np.clip((dist - 8.0) / 18.0 * 255.0, 0, 255).astype(np.uint8)
        res = np.zeros((crop_img.height, crop_img.width, 4), dtype=np.uint8)
        res[:, :, :3] = crop_img.convert('RGB')
        res[:, :, 3] = alpha
        return Image.fromarray(res)

    prime_clean = clean_alpha(prime_crop)
    h2o_clean = clean_alpha(h2o_crop)

    # Create master canvas with rich luxury maroon gradient
    master = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad = Image.new('RGBA', (size, size))
    for y in range(size):
        t = y / (size - 1)
        r = int(MAROON_TOP[0] * (1 - t) + MAROON_BOTTOM[0] * t)
        g = int(MAROON_TOP[1] * (1 - t) + MAROON_BOTTOM[1] * t)
        b = int(MAROON_TOP[2] * (1 - t) + MAROON_BOTTOM[2] * t)
        for x in range(size):
            grad.putpixel((x, y), (r, g, b, 255))
    master.paste(grad)

    # Draw refined bronze circular accent ring (safe zone for circular search display)
    d = ImageDraw.Draw(master)
    c = size / 2.0
    r_circle = size * 0.465
    ring_w = max(2, int(size * 0.022))
    d.ellipse(
        [c - r_circle, c - r_circle, c + r_circle, c + r_circle],
        outline=BRONZE + (255,),
        width=ring_w,
    )

    # Scale and center PRIME
    prime_w = int(size * 0.72)
    prime_h = int(prime_w * prime_clean.height / prime_clean.width)
    p_resized = prime_clean.resize((prime_w, prime_h), Image.Resampling.LANCZOS)

    # Scale and center H2O
    h2o_w = int(size * 0.28)
    h2o_h = int(h2o_w * h2o_clean.height / h2o_clean.width)
    h_resized = h2o_clean.resize((h2o_w, h2o_h), Image.Resampling.LANCZOS)

    # Vertical stack placement inside the ring
    gap = int(size * 0.05)
    total_h = prime_h + gap + h2o_h

    p_x = int((size - prime_w) / 2)
    p_y = int((size - total_h) / 2)
    h_x = int((size - h2o_w) / 2)
    h_y = p_y + prime_h + gap

    master.alpha_composite(p_resized, (p_x, p_y))
    master.alpha_composite(h_resized, (h_x, h_y))

    return master


def main():
    master = build_master_icon(1024)
    rgb_master = master.convert('RGB')

    outputs = {
        16: 'public/favicon-16x16.png',
        32: 'public/favicon-32x32.png',
        48: 'public/favicon-48x48.png',
        96: 'public/favicon-96x96.png',
        180: 'public/apple-touch-icon.png',
        192: 'public/favicon-192x192.png',
        512: 'public/favicon-512x512.png',
    }

    for size, path in outputs.items():
        rgb_master.resize((size, size), Image.Resampling.LANCZOS).save(path, 'PNG', optimize=True)
        print(f'wrote {path} ({size}x{size})')

    # Schema.org Organization logo
    rgb_master.resize((512, 512), Image.Resampling.LANCZOS).save('public/logo-512.png', 'PNG', optimize=True)
    print('wrote public/logo-512.png (512x512)')

    # Multi-resolution favicon.ico containing 16x16, 32x32, 48x48
    rgb_master.save(
        'public/favicon.ico',
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print('wrote public/favicon.ico (16, 32, 48)')


if __name__ == '__main__':
    main()
