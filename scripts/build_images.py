# -*- coding: utf-8 -*-
"""Cezar Gym photo pipeline.

Step 1 - strip the CEZAR GYM watermark by cropping it out. The logo always sits
in the top-right corner, so each photo is cropped either from the top or from
the right, whichever loses less real content (chosen per photo below).

Step 2 - from each clean master, render the derivatives the site needs at the
exact aspect ratios used in the layout, as webp, plus a tiny blurred LQIP that
is inlined in the HTML as the placeholder.
"""
import base64
import io
import json
import os

from PIL import Image, ImageFilter

RAW = r"..\..\cezar-site-raw"
MASTERS = os.path.join(RAW, "masters")
OUT = r"..\assets\img"

# source order == the order the photos were sent
SOURCES = [
    "image-1785373266794.webp", "image-1785373334518.webp", "image-1785373338375.webp",
    "image-1785373341814.webp", "image-1785373345103.webp", "image-1785373348380.webp",
    "image-1785373351608.webp", "image-1785373354557.webp", "image-1785373357684.webp",
    "image-1785373360365.webp", "image-1785373364897.webp", "image-1785373368228.webp",
    "image-1785373371506.webp", "image-1785373374768.webp", "image-1785373377617.webp",
]

# name, watermark crop side, fraction to remove
#   "top"   -> ceiling is dead space, safe to lose
#   "right" -> the top of the frame carries content, cut the right edge instead
CROPS = [
    ("hero-main",        "top",   0.17),
    ("smith",            "top",   0.13),
    ("plates-detail",    "top",   0.17),
    ("bench-olympic",    "top",   0.17),
    ("machine-new",      "top",   0.15),
    ("perfect-body",     "right", 0.14),   # "PERFECT BODY" wall text sits high
    ("floor-wide",       "top",   0.17),
    ("cardio",           "top",   0.17),
    ("benches-room",     "top",   0.18),
    ("dumbbell-zone",    "top",   0.15),
    ("technogym",        "right", 0.14),   # top dumbbell shelf must stay
    ("benches-portrait", "top",   0.13),
    ("chest-press",      "top",   0.17),
    ("plate-racks",      "top",   0.17),
    ("lockers",          "right", 0.15),   # keeps the lockers + GO HARD wall
]

# master -> list of (output name, width, height, focus)
# focus is the crop anchor as (fx, fy) in 0..1 of the master
DERIVATIVES = {
    "hero-main":        [("hero-desktop", 1920, 1080, (0.50, 0.55)),
                         ("hero-tablet",  1280,  900, (0.50, 0.55))],
    "dumbbell-zone":    [("hero-mobile",  1080, 1440, (0.42, 0.60)),
                         ("card-dumbbell", 900, 1125, (0.40, 0.55))],
    "floor-wide":       [("band-floor",   1800,  760, (0.50, 0.55)),
                         ("join-bg",      1600,  900, (0.50, 0.55))],
    "cardio":           [("card-cardio",   900, 1125, (0.55, 0.55)),
                         ("gal-cardio",   1400,  933, (0.50, 0.50))],
    "smith":            [("card-free",     900, 1125, (0.50, 0.50))],
    "bench-olympic":    [("card-body",     900, 1125, (0.45, 0.55))],
    "machine-new":      [("card-machines", 900, 1125, (0.50, 0.55))],
    # wide, so the lockers AND the "GO HARD or go home" wall both stay in frame
    "lockers":          [("card-lockers", 1400,  875, (0.50, 0.50)),
                         ("gal-lockers",  1400,  933, (0.45, 0.50))],
    "technogym":        [("proof-techno", 1500, 1000, (0.45, 0.55)),
                         ("gal-techno",   1400,  933, (0.45, 0.55))],
    "plates-detail":    [("tex-plates",   1600, 1200, (0.50, 0.55))],
    "perfect-body":     [("gal-perfect",  1400,  933, (0.45, 0.50))],
    "benches-room":     [("gal-benches",  1400,  933, (0.50, 0.50))],
    "benches-portrait": [("gal-copper",   1400,  933, (0.50, 0.50))],
    "chest-press":      [("gal-chest",    1400,  933, (0.50, 0.55))],
    "plate-racks":      [("gal-racks",    1400,  933, (0.50, 0.55))],
}


def strip_watermark(im, side, frac):
    w, h = im.size
    if side == "top":
        return im.crop((0, int(h * frac), w, h))
    return im.crop((0, 0, int(w * (1 - frac)), h))


def cover(im, tw, th, focus):
    """Resize+crop to exactly tw x th, keeping the focus point in frame."""
    w, h = im.size
    scale = max(tw / w, th / h)
    nw, nh = max(tw, int(round(w * scale))), max(th, int(round(h * scale)))
    im = im.resize((nw, nh), Image.LANCZOS)
    fx, fy = focus
    left = int(round((nw - tw) * fx))
    top = int(round((nh - th) * fy))
    left = max(0, min(left, nw - tw))
    top = max(0, min(top, nh - th))
    return im.crop((left, top, left + tw, top + th))


def lqip(im):
    small = im.resize((20, max(1, int(20 * im.height / im.width))), Image.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(1))
    buf = io.BytesIO()
    small.save(buf, "webp", quality=45)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    os.makedirs(MASTERS, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    total = 0

    for src, (name, side, frac) in zip(SOURCES, CROPS):
        im = Image.open(os.path.join(RAW, src)).convert("RGB")
        before = im.size
        im = strip_watermark(im, side, frac)
        im.save(os.path.join(MASTERS, name + ".png"))
        print("%-18s %sx%s -> %sx%s  (cut %s %d%%)"
              % (name, before[0], before[1], im.size[0], im.size[1], side, frac * 100))

        for out_name, tw, th, focus in DERIVATIVES.get(name, []):
            d = cover(im, tw, th, focus)
            path = os.path.join(OUT, out_name + ".webp")
            d.save(path, "webp", quality=84, method=6)
            # half-width variant for phones
            hw, hh = tw // 2, th // 2
            d2 = d.resize((hw, hh), Image.LANCZOS)
            d2.save(os.path.join(OUT, out_name + "@half.webp"), "webp", quality=80, method=6)
            # المقاسات الحقيقية لازم تروح للـ srcset، وإلا المتصفح يختار غلط
            manifest[out_name] = {"w": tw, "h": th, "hw": hw, "hh": hh, "lqip": lqip(d)}
            kb = os.path.getsize(path) / 1024
            total += kb
            print("    %-15s %4dx%-4d %6.0f KB" % (out_name, tw, th, kb))

    js = ("/* بيانات الصور: المقاسات الحقيقية + نسخة مصغّرة ضبابية base64.\n"
          "   متولّد آليًا — متعدّلوش بإيدك. */\n"
          "window.CEZAR_IMG = " + json.dumps(manifest, ensure_ascii=False, indent=1) + ";\n")
    with open(r"..\data\img.js", "w", encoding="utf-8") as f:
        f.write(js)
    print("\ndata/img.js written (%d entries, %.0f KB)" % (len(manifest), len(js) / 1024))
    print("full-size derivatives total: %.0f KB" % total)


if __name__ == "__main__":
    main()
