"""Cut sprites out of the original NGUI atlases (prefab mSprites: name, x, y, width, height, borders).

Usage:
  python tools/extract_ui.py list <Atlas>            print sprite names (and sizes)
  python tools/extract_ui.py cut <Atlas> name ...    write assets/ui/<name>.png (a prefix* cuts every match)
<Atlas>: masterAtlas_V2_NewUi, BattleAtlas, Common_Atlas, ... (the prefab under AssetBundleResource/Atlas)
Border values (9-slice) are printed so CSS border-image can use them.
"""
import os
import re
import sys

from PIL import Image

ATLAS_DIR = "E:/LAO/Google_QA/Assets/AssetBundleResource/Atlas"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "ui")


def load(atlas):
    pf = os.path.join(ATLAS_DIR, atlas + ".prefab")
    if not os.path.exists(pf):
        pf = os.path.join(ATLAS_DIR, atlas + "Atlas.prefab")
    text = open(pf, encoding="utf-8", errors="ignore").read()
    mat = re.search(r"material: \{fileID: \d+, guid: ([0-9a-f]+)", text)
    sprites = {}
    for m in re.finditer(r"- name: (\S+)\n(.*?)(?=\n  - name: |\n  m[A-Z]|\Z)", text, re.S):
        body = m.group(2)
        g = lambda k: int(re.search(r"\b" + k + r": (-?\d+)", body).group(1)) if re.search(r"\b" + k + r": (-?\d+)", body) else 0
        sprites[m.group(1)] = {k: g(k) for k in ("x", "y", "width", "height", "borderLeft", "borderRight", "borderTop", "borderBottom")}
    # the texture: the material's main texture, else <atlas>.png next to the prefab
    png = os.path.join(ATLAS_DIR, atlas.replace("Atlas", "") + ".png")
    for cand in (atlas + ".png", atlas.replace("Atlas", "") + ".png", atlas.replace("Atlas_", "_") + ".png"):
        if os.path.exists(os.path.join(ATLAS_DIR, cand)):
            png = os.path.join(ATLAS_DIR, cand)
            break
    return sprites, png


def main():
    cmd, atlas, *names = sys.argv[1:]
    sprites, png = load(atlas)
    if cmd == "list":
        for n, s in sorted(sprites.items()):
            b = (s["borderLeft"], s["borderTop"], s["borderRight"], s["borderBottom"])
            print("%-40s %4dx%-4d %s" % (n, s["width"], s["height"], "border %s" % (b,) if any(b) else ""))
        print(len(sprites), "sprites in", png)
        return
    im = Image.open(png).convert("RGBA")
    os.makedirs(OUT, exist_ok=True)
    want = []
    for n in names:
        want += [k for k in sprites if k.startswith(n[:-1])] if n.endswith("*") else [n]
    for n in want:
        s = sprites[n]
        im.crop((s["x"], s["y"], s["x"] + s["width"], s["y"] + s["height"])).save(os.path.join(OUT, n + ".png"))
        print("cut", n, s["width"], s["height"], (s["borderLeft"], s["borderTop"], s["borderRight"], s["borderBottom"]))


if __name__ == "__main__":
    main()
