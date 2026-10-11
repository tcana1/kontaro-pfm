#!/usr/bin/env python3
"""
Prepare README/gallery screenshots in place.

  *-mobile*.png   raw (opaque) phone captures: scaled to the height of the macOS desktop
                  captures' window, then given rounded corners and a macOS-style drop
                  shadow so they sit next to the desktop shots at the same scale.
                  Files that already have transparency are treated as done and skipped.
  everything else lossless re-encode (keeps the alpha channel / macOS window shadow);
                  captures wider than 1600 px are halved to 1552 px

Shadow and corner values were measured from a native macOS window capture (1552x981 PNG,
1440x869 window). Requires Pillow (pip install pillow).

Usage:
  python3 scripts/compress_screenshots.py              # process docs/*.png
  python3 scripts/compress_screenshots.py path/a.png   # process specific files
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

DESKTOP_MAX_WIDTH = 1600
WINDOW_HEIGHT = 869  # window height of the desktop captures
RADIUS, SIGMA, DY, OPACITY = 39, 18, 18, 0.40
MARGIN_L, MARGIN_T, MARGIN_R, MARGIN_B = 56, 38, 56, 74


def rounded_mask(size, radius, supersample=4):
    w, h = size
    mask = Image.new('L', (w * supersample, h * supersample), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, w * supersample - 1, h * supersample - 1), radius=radius * supersample, fill=255)
    return mask.resize((w, h), Image.LANCZOS)


def add_mac_shadow(window):
    w, h = window.size
    width, height = w + MARGIN_L + MARGIN_R, h + MARGIN_T + MARGIN_B
    mask = rounded_mask((w, h), RADIUS)

    shadow = Image.new('L', (width, height), 0)
    shadow.paste(mask, (MARGIN_L, MARGIN_T + DY))
    shadow = shadow.filter(ImageFilter.GaussianBlur(SIGMA)).point(lambda v: round(v * OPACITY))
    out = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    out.putalpha(shadow)

    layer = window.convert('RGBA')
    layer.putalpha(mask)
    out.alpha_composite(layer, (MARGIN_L, MARGIN_T))
    return out


def has_transparency(im):
    return im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 255


def process_mobile(im):
    im = im.convert('RGB')
    w = round(im.width * WINDOW_HEIGHT / im.height)
    im = im.resize((w, WINDOW_HEIGHT), Image.LANCZOS)
    flat = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    return add_mac_shadow(flat)


def process(path: Path) -> None:
    before = path.stat().st_size
    im = Image.open(path)

    if '-mobile' in path.name:
        if has_transparency(im):
            print(f"{path.name:36} already framed, skipped")
            return
        im = process_mobile(im)
    elif im.width > DESKTOP_MAX_WIDTH:
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)

    im.save(path, optimize=True)
    after = path.stat().st_size
    print(f"{path.name:36} {before // 1024:5} KB -> {after // 1024:5} KB")


def main() -> None:
    args = sys.argv[1:]
    files = [Path(a) for a in args] if args else sorted((Path(__file__).parent.parent / 'docs').glob('*.png'))
    for f in files:
        process(f)


if __name__ == '__main__':
    main()
