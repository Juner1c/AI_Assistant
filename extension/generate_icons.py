import os
from PIL import Image, ImageDraw

def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), color=(0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer circle with gradient glow background
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size - margin, size - margin], fill=(99, 102, 241, 255))
    
    # Inner lens circle
    inner_m = int(size * 0.22)
    draw.ellipse([inner_m, inner_m, size - inner_m, size - inner_m], fill=(15, 23, 42, 255))
    
    # Magnifying handle / accent spark
    handle_w = max(2, int(size * 0.08))
    draw.line([int(size * 0.6), int(size * 0.6), int(size * 0.85), int(size * 0.85)], fill=(168, 85, 247, 255), width=handle_w)
    draw.ellipse([int(size * 0.35), int(size * 0.35), int(size * 0.6), int(size * 0.6)], outline=(56, 189, 248, 255), width=max(1, int(size * 0.06)))

    os.makedirs(os.path.dirname(filename), exist_ok=True)
    img.save(filename, 'PNG')
    print(f"Saved {filename}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(base_dir, "icons")
    create_icon(16, os.path.join(icons_dir, "icon16.png"))
    create_icon(48, os.path.join(icons_dir, "icon48.png"))
    create_icon(128, os.path.join(icons_dir, "icon128.png"))
