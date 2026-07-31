# -*- coding: utf-8 -*-
"""Derive the site's logo assets from the real emblem.

emblem-dark   charcoal helmet + lime plates  -> for light backgrounds
emblem-light  off-white helmet + lime plates -> for dark backgrounds
emblem-ghost  single flat tone, low contrast -> section watermark
favicon       32/180 px squares
"""
import os

import numpy as np
from PIL import Image

SRC = r"..\..\Desktop\cezar-emblem-dark.png"
OUT = r"..\assets\img"

INK = (23, 24, 28)
OFFWHITE = (243, 241, 235)
LIME = (168, 220, 66)


def load():
    im = Image.open(SRC).convert("RGBA")
    # trim fully transparent margins
    bbox = im.split()[3].getbbox()
    return im.crop(bbox)


def recolour(im, helmet_rgb, lime_rgb):
    a = np.asarray(im).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    lime_mask = (g - r > 20) & (g - b > 40)
    out = a.copy()
    for i, v in enumerate(helmet_rgb):
        ch = out[..., i]
        ch[~lime_mask] = v
    for i, v in enumerate(lime_rgb):
        ch = out[..., i]
        ch[lime_mask] = v
    out[..., 3] = al
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def save(im, name, width):
    h = max(1, round(im.height * width / im.width))
    im.resize((width, h), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
    print("%-22s %dx%d  %5.0f KB" % (name, width, h, os.path.getsize(os.path.join(OUT, name)) / 1024))


def main():
    src = load()
    print("emblem source trimmed to %dx%d" % src.size)

    save(recolour(src, INK, LIME), "emblem-dark.png", 660)
    save(recolour(src, OFFWHITE, LIME), "emblem-light.png", 660)
    save(recolour(src, (255, 255, 255), (255, 255, 255)), "emblem-ghost.png", 900)

    # favicon: emblem on ink, square, padded
    fav_src = recolour(src, OFFWHITE, LIME)
    for size, name in ((180, "icon-180.png"), (32, "icon-32.png")):
        canvas = Image.new("RGBA", (size, size), INK + (255,))
        inner = round(size * 0.78)
        e = fav_src.resize((inner, max(1, round(fav_src.height * inner / fav_src.width))), Image.LANCZOS)
        canvas.alpha_composite(e, ((size - e.width) // 2, (size - e.height) // 2))
        canvas.save(os.path.join(OUT, name), optimize=True)
        print("%-22s %dx%d" % (name, size, size))


if __name__ == "__main__":
    main()
