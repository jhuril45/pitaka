"""
Generate Pitaka's app icon, Android adaptive icon layers, splash image and favicon
from one drawing: a teal rounded tile with an amber top band and a white peso sign
(the same mark as src/components/logo.tsx).

    python scripts/generate-icons.py

Needs Pillow. The peso sign is drawn from shapes (not a font) so it is identical
on every machine and crisp at every size. Each image is drawn 4x larger and
downscaled for smooth edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"

TEAL = (15, 118, 110, 255)  # theme primary #0F766E
AMBER = (245, 158, 11, 255)  # theme accent  #F59E0B
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
SS = 4  # supersampling factor


def peso_layer(size: int, cx: float, cy: float, h: float, color) -> Image.Image:
    """Draw the peso sign on its own transparent layer (so the bowl's hole stays see-through)."""
    layer = Image.new("RGBA", (size, size), CLEAR)
    # Drawn as a mask so the bowl's hole stays transparent without erasing other shapes.
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    draw_peso_mask(md, cx, cy, h)
    layer.paste(Image.new("RGBA", (size, size), color), (0, 0), mask)
    return layer


def draw_peso_mask(md: ImageDraw.ImageDraw, cx: float, cy: float, h: float) -> None:
    """Peso sign of cap height h centred on (cx, cy): a 'P' crossed by two bars."""
    stem = h * 0.17  # stroke width
    bowl_h = h * 0.60
    bowl_w = h * 0.66  # stem left edge to bowl's right edge
    left = cx - bowl_w * 0.42
    top = cy - h / 2
    right = left + bowl_w
    r = bowl_h / 2

    # Bowl: flat left side on the stem, half-circle on the right.
    md.rectangle([left, top, right - r, top + bowl_h], fill=255)
    md.ellipse([right - 2 * r, top, right, top + bowl_h], fill=255)
    # Counter (the hole), same shape inset by the stroke width.
    ri = r - stem
    md.rectangle([left + stem, top + stem, right - r, top + bowl_h - stem], fill=0)
    md.ellipse([right - r - ri, top + stem, right - stem, top + bowl_h - stem], fill=0)
    # Stem
    md.rectangle([left, top, left + stem, top + h], fill=255)
    # Two bars crossing the bowl, sticking out on both sides.
    bar_h = stem * 0.6
    bar_left = left - h * 0.16
    bar_right = right + h * 0.12
    for y in (top + bowl_h * 0.32, top + bowl_h * 0.64):
        md.rectangle([bar_left, y - bar_h / 2, bar_right, y + bar_h / 2], fill=255)


def tile(size: int, *, rounded: bool, band_ratio: float = 0.18, glyph_ratio: float = 0.40) -> Image.Image:
    """The full mark: teal tile, amber band on top, white peso sign (shifted down past the band)."""
    s = size * SS
    img = Image.new("RGBA", (s, s), CLEAR)
    shape = Image.new("L", (s, s), 0)
    sd = ImageDraw.Draw(shape)
    if rounded:
        sd.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.28, fill=255)
    else:
        sd.rectangle([0, 0, s, s], fill=255)

    body = Image.new("RGBA", (s, s), TEAL)
    ImageDraw.Draw(body).rectangle([0, 0, s, s * band_ratio], fill=AMBER)
    img.paste(body, (0, 0), shape)

    glyph = peso_layer(s, s * 0.5, s * (0.5 + band_ratio / 2), s * glyph_ratio, WHITE)
    img.alpha_composite(glyph)
    return img.resize((size, size), Image.LANCZOS)


def adaptive_background(size: int) -> Image.Image:
    """Adaptive icon background: teal with the amber band (masks show the middle ~66%)."""
    img = Image.new("RGBA", (size, size), TEAL)
    # Band reaches into the visible area of circle/squircle masks.
    ImageDraw.Draw(img).rectangle([0, 0, size, size * 0.30], fill=AMBER)
    return img


def adaptive_glyph(size: int, color) -> Image.Image:
    """Adaptive foreground / monochrome: just the peso sign inside the 66% safe zone."""
    s = size * SS
    layer = peso_layer(s, s * 0.5, s * 0.565, s * 0.30, color)
    return layer.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # iOS / generic icon: full bleed, the OS applies its own rounded mask.
    tile(1024, rounded=False).save(OUT / "icon.png")
    # Android adaptive icon layers.
    adaptive_background(1024).save(OUT / "android-icon-background.png")
    adaptive_glyph(1024, WHITE).save(OUT / "android-icon-foreground.png")
    adaptive_glyph(1024, WHITE).save(OUT / "android-icon-monochrome.png")
    # Splash image and favicon: the rounded tile as it appears in the app.
    tile(512, rounded=True).save(OUT / "splash-icon.png")
    tile(48, rounded=True).save(OUT / "favicon.png")
    tile(256, rounded=True).save(OUT / "logo.png")
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
