"""Convert the original Spine 4.2 lobby models (AssetBundleResourceSub/SpineCharacter2D) for the web lobby.

  python tools/build_l2d.py            -> assets/l2d/<unit id>/{model.json, model.atlas, page*.webp}
Textures are scaled so the long side is <= MAX (mobile GPUs); the atlas keeps its original "size:" line,
the runtime computes UVs from it, so a smaller page image maps the same.
"""
import glob
import json
import os
import re

from PIL import Image

SRC = "E:/LAO_Google_QA/Assets/AssetBundleResourceSub/SpineCharacter2D"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "l2d")
MAX = 2048
# unit id (js/roster.js) -> model folder
MODELS = {  # full-body poses with a censored body variant and a face set (the rest are pillow / bed poses)
    "harpy": "BR_Harpy_NS3",
    "banshee": "BR_Banshee_NS2",
    "khan": "BR_Khan_NS5",
}


def build(uid, folder):
    d = os.path.join(SRC, "2DModel_" + folder)
    js = glob.glob(d + "/*.json")[0]
    atlas = glob.glob(d + "/*.atlas.txt")[0]
    out = os.path.join(OUT, uid)
    os.makedirs(out, exist_ok=True)
    data = json.load(open(js, encoding="utf-8"))
    json.dump(data, open(os.path.join(out, "model.json"), "w", encoding="utf-8"), separators=(",", ":"))
    text = open(atlas, encoding="utf-8").read()
    pages = [l.strip() for l in text.splitlines() if l.strip().lower().endswith(".png")]
    total = 0
    for i, p in enumerate(pages):
        im = Image.open(os.path.join(d, p))
        k = min(1, MAX / max(im.size))
        if k < 1:
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        name = "page%d.webp" % i
        im.save(os.path.join(out, name), "WEBP", quality=88, method=6)
        total += os.path.getsize(os.path.join(out, name))
        text = re.sub(r"^" + re.escape(p) + r"\s*$", name, text, flags=re.M)
    open(os.path.join(out, "model.atlas"), "w", encoding="utf-8").write(text)
    anims = list(data.get("animations", {}).keys())
    print(uid, folder, "pages", len(pages), "%.1f MB" % (total / 1e6), anims)
    return anims


if __name__ == "__main__":
    meta = {uid: build(uid, f) for uid, f in MODELS.items()}
    open(os.path.join(OUT, "index.json"), "w").write(json.dumps(meta))
