"""Story dialogue art from the original client (E:/LAO/1_Onestre_QA): full-body standing pictures of every roster
unit and the scene backgrounds the chapters use (js/story.js "bg" keys), for the novel-style dialogue (js/talk.js).

    python tools/build_story_art.py            # stands + backgrounds that are missing
    python tools/build_story_art.py --force    # rebuild everything
    python tools/build_story_art.py --sheet    # also write tools/.story_art_sheet.jpg (a contact sheet to check them)

Stands: FullbodyImg/FullbodyIMG_<uid>_N.png (base skin), else the N_part1 / N_part2 layers composited
(part2 behind part1), cropped to the drawn area and scaled to STAND_H px tall -> assets/story/stand/<id>.webp
Backgrounds: BGImg/<name>.png. Square 1024 textures are the game's stretched 16:9 pictures (stretched back);
3840x1644 ones are cropped to 16:9 around the centre -> assets/story/bg/<name>.webp (1600x900)
"""
import os
import re
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = r"E:/LAO/1_Onestre_QA/Assets"
FULL = os.path.join(SRC, "AssetBundleResourceSub", "Texture", "FullbodyImg")
BGS = os.path.join(SRC, "AssetBundleResource", "Texture", "BGImg")
OUT_STAND = os.path.join(ROOT, "assets", "story", "stand")
OUT_BG = os.path.join(ROOT, "assets", "story", "bg")
STAND_H = 1100
BG_W, BG_H = 1600, 900
FORCE = "--force" in sys.argv


def roster():
    txt = open(os.path.join(ROOT, "js", "lao_units.js"), encoding="utf-8").read()
    return re.findall(r'"([a-z0-9]+)":\{"uid":"([^"]+)"', txt)


def story_bgs():
    txt = open(os.path.join(ROOT, "js", "story.js"), encoding="utf-8").read()
    return sorted(set(re.findall(r"\b(?:bg|introBg|outroBg|stageBg)\s*:\s*'(BG_[A-Za-z0-9_]+)'", txt)))


def stand_source(uid):
    files = {f.lower(): f for f in os.listdir(FULL) if f.endswith(".png")}
    base = "fullbodyimg_%s_n" % uid.lower()
    if base + ".png" in files:
        return [files[base + ".png"]]
    parts = sorted((f for k, f in files.items() if re.fullmatch(re.escape(base) + r"_parts?(\d)\.png", k)),
                   key=lambda f: int(re.search(r"(\d)\.png$", f, re.I).group(1)))
    return parts


def build_stand(uid_id, uid):
    out = os.path.join(OUT_STAND, uid_id + ".webp")
    if os.path.exists(out) and not FORCE:
        return "kept"
    srcs = stand_source(uid)
    if not srcs:
        return "MISSING"
    layers = [Image.open(os.path.join(FULL, f)).convert("RGBA") for f in srcs]
    im = Image.new("RGBA", layers[0].size, (0, 0, 0, 0))
    for layer in reversed(layers):  # part2 (props, back layers) behind part1 (the body)
        if layer.size != im.size:
            layer = layer.resize(im.size, Image.LANCZOS)
        im.alpha_composite(layer)
    bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb)
    k = STAND_H / im.height
    if k < 1:
        im = im.resize((max(1, round(im.width * k)), STAND_H), Image.LANCZOS)
    im.save(out, "WEBP", quality=86, method=6)
    return "%s %dx%d" % ("+".join(srcs), im.width, im.height)


def build_bg(name):
    out = os.path.join(OUT_BG, name + ".webp")
    if os.path.exists(out) and not FORCE:
        return "kept"
    p = os.path.join(BGS, name + ".png")
    if not os.path.exists(p):
        return "MISSING"
    im = Image.open(p).convert("RGB")
    w, h = im.size
    if abs(w - h) < 4:  # stretched 16:9 texture
        im = im.resize((BG_W, BG_H), Image.LANCZOS)
    else:
        cw = min(w, round(h * 16 / 9))
        ch = min(h, round(cw * 9 / 16))
        x0, y0 = (w - cw) // 2, (h - ch) // 2
        im = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((BG_W, BG_H), Image.LANCZOS)
    im.save(out, "WEBP", quality=82, method=6)
    return "%dx%d" % (w, h)


def sheet(ids):
    from PIL import ImageDraw
    fs = [os.path.join(OUT_STAND, i + ".webp") for i in ids if os.path.exists(os.path.join(OUT_STAND, i + ".webp"))]
    W, H, cols = 180, 260, 10
    rows = (len(fs) + cols - 1) // cols
    sh = Image.new("RGB", (cols * W, rows * (H + 16)), (40, 44, 52))
    d = ImageDraw.Draw(sh)
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGBA")
        im.thumbnail((W, H))
        x, y = (i % cols) * W, (i // cols) * (H + 16)
        sh.paste(im, (x + (W - im.width) // 2, y + H - im.height), im)
        d.text((x + 4, y + H + 2), os.path.basename(f)[:-5], fill="yellow")
    p = os.path.join(HERE, ".story_art_sheet.jpg")
    sh.save(p, quality=80)
    print("sheet:", p)


if __name__ == "__main__":
    os.makedirs(OUT_STAND, exist_ok=True)
    os.makedirs(OUT_BG, exist_ok=True)
    ids = []
    for uid_id, uid in roster():
        ids.append(uid_id)
        print("stand", uid_id, build_stand(uid_id, uid))
    for name in story_bgs():
        print("bg", name, build_bg(name))
    if "--sheet" in sys.argv:
        sheet(ids)
