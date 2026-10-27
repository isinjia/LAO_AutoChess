"""Card portraits for the deck / member screens: the original inventory icons (Texture/PCInvenIcon, 126x126 bust).

  python tools/build_cards.py    -> assets/cards/<id>.webp, <id>_s1.webp (NS1), <id>_s2.webp (NS2)
The battle shop keeps the wide face strips in assets/icons; these show the whole face and hair.
"""
import json
import os
import re
import subprocess

from PIL import Image

SRC = "E:/LAO_Google_QA/Assets/AssetBundleResource/Texture/PCInvenIcon"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "cards")

ids = json.loads(subprocess.check_output(["node", "-e", "const R=require('./js/roster.js');console.log(JSON.stringify(R.ROSTER.map(d=>[d.id,d.uid])))"], cwd=ROOT))
os.makedirs(OUT, exist_ok=True)
have = {f.lower(): f for f in os.listdir(SRC)}
missing = []
for uid_id, uid in ids:
    for suf, out in (("N", ""), ("NS1", "_s1"), ("NS2", "_s2")):
        f = have.get(("InvenIcon_%s_%s.png" % (uid, suf)).lower())
        if not f:
            if suf == "N":
                missing.append(uid)
            continue
        Image.open(os.path.join(SRC, f)).convert("RGBA").save(os.path.join(OUT, uid_id + out + ".webp"), "WEBP", quality=90)
print(len(os.listdir(OUT)), "cards; missing base:", missing)
