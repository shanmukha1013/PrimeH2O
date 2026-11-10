import os
import base64
from PIL import Image

def generate_favicons():
    src_path = 'public/assets/bottle_500ml.png'
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source image not found: {src_path}")

    im = Image.open(src_path).convert('RGBA')
    bbox = im.getbbox()
    print(f"Original image size: {im.size}")
    print(f"Original bounding box: {bbox}")

    bottle = im.crop(bbox)
    bw, bh = bottle.size
    aspect_ratio = bw / bh
    print(f"Cropped bottle dimensions: {bw}x{bh} (aspect ratio: {aspect_ratio:.4f})")

    def create_canvas(canvas_size, padding_pct=0.06):
        # Create a 100% transparent square canvas
        canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        
        # Calculate target height with proportional padding
        target_h = int(round(canvas_size * (1 - 2 * padding_pct)))
        # Ensure at least 1px padding for small sizes
        if canvas_size <= 16:
            target_h = 14
        elif canvas_size <= 32:
            target_h = 28
        elif canvas_size <= 48:
            target_h = 42

        # Calculate target width strictly preserving the original aspect ratio
        target_w = max(1, int(round(target_h * aspect_ratio)))

        # High-quality Lanczos resampling
        resized_bottle = bottle.resize((target_w, target_h), Image.Resampling.LANCZOS)

        # Center inside square canvas
        x = (canvas_size - target_w) // 2
        y = (canvas_size - target_h) // 2

        canvas.paste(resized_bottle, (x, y), resized_bottle)
        return canvas

    # Generate assets
    sizes = {
        16: 'public/favicon-16x16.png',
        32: 'public/favicon-32x32.png',
        48: 'public/favicon-48x48.png',
        180: 'public/apple-touch-icon.png',
        192: 'public/favicon-192x192.png',
        512: 'public/favicon-512x512.png',
    }

    generated_images = {}
    for size, out_path in sizes.items():
        img = create_canvas(size)
        img.save(out_path, 'PNG', optimize=True)
        generated_images[size] = img
        print(f"Saved: {out_path} ({size}x{size})")

    # Generate multi-resolution ICO file containing 16x16, 32x32, 48x48
    ico_path = 'public/favicon.ico'
    generated_images[48].save(
        ico_path,
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f"Saved: {ico_path} (multi-size 16x16, 32x32, 48x48)")

    # Generate SVG favicon for vector scaling in modern browsers
    with open('public/favicon-512x512.png', 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <!-- PRIME H2O Bottle Favicon - Aspect Ratio Preserved -->
  <image href="data:image/png;base64,{b64}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet" />
</svg>'''

    svg_path = 'public/favicon.svg'
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f"Saved: {svg_path} (SVG container with preserveAspectRatio)")

if __name__ == '__main__':
    generate_favicons()
