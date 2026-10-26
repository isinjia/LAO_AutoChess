"""Convert the Unity-baked original effects (tools/sdbuild/unity/proj/fx/*.json, tools/fxbuild/run_fx.cmd) into
js/fx/<name>.m.js + .bin + .webp for the web runtime (js/fxbake.js), and js/fx/_meta.js: projectile meta, the effect timeline of
every rig's attack / skill clip and where its fire points are at each shot.
(Converter copied from the Defence project.)

Each frame becomes two triangle lists (normal / additive blend) with positions in
projectile-local units, uvs remapped into one packed atlas and premixed vertex colours.
"""
import base64
import io
import json
import math
import os
import re
import struct
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "sdbuild", "unity", "proj", "fx")
sys.path.insert(0, os.path.join(HERE, "..", "sdbuild"))
ASSETS = r"E:/LAO/Google_QA/Assets"
OUT = os.path.join(HERE, "..", "..", "js", "fx")
MAX_TEX = 1024
MAX_REP = 4  # repeats of a tiled texture kept in the atlas
FAR = 400.0  # rig units from an effect's origin past which particles are dropped (stray far-away bakes)
BIG = 1_500_000      # packed bytes above which an effect is baked at half its frame rate
GROUPS = ("rn", "n", "ra", "a")


import fxpack  # noqa: E402  (tools/fxbuild/fxpack.py: packed side files, format 2)
FORMAT = fxpack.FORMAT  # baked effect data format: keep equal to FXB.FORMAT in js/fxbake.js

_SHADER_BLEND = None


def shader_blends():
    """shader name -> its first Blend line's destination factor ('One' = additive), from the .shader sources."""
    global _SHADER_BLEND
    if _SHADER_BLEND is None:
        _SHADER_BLEND = {}
        import glob
        for f in glob.glob(ASSETS + "/**/*.shader", recursive=True):
            t = open(f, encoding="utf-8", errors="ignore").read()
            t = re.sub(r"//[^\n]*", "", t)
            m = re.search(r'Shader\s+"([^"]+)"', t)
            b = re.search(r"Blend\s+(\w+)\s+(\w+)", t)
            if m and b:
                _SHADER_BLEND[m.group(1)] = b.group(2)
    return _SHADER_BLEND


_SHADER_CULL = None


def cull_of(shader):
    """0 off, 1 front, 2 back: the material's _Cull (appended by the baker as |cN), else the shader source's Cull."""
    global _SHADER_CULL
    shader = shader or ""
    m = re.search(r"\|c(\d)", shader)
    if m:
        return int(m.group(1))
    name = shader.split("#")[0]
    if _SHADER_CULL is None:
        _SHADER_CULL = {}
        import glob
        for f in glob.glob(ASSETS + "/**/*.shader", recursive=True):
            t = re.sub(r"//[^\n]*", "", open(f, encoding="utf-8", errors="ignore").read())
            mm = re.search(r'Shader\s+"([^"]+)"', t)
            c = re.search(r"Cull\s+(Back|Front|Off)", t)
            if mm and c:
                _SHADER_CULL[mm.group(1)] = {"Off": 0, "Front": 1, "Back": 2}[c.group(1)]
    return _SHADER_CULL.get(name, 0)


def blend_of(shader):
    shader = re.sub(r"\|c\d", "", shader or "")
    if "#" in shader:  # material blend factors (UnityEngine.Rendering.BlendMode: 1 One, 10 OneMinusSrcAlpha)
        name, f = shader.split("#", 1)
        src, dst = (int(x) for x in f.split(","))
        return "a" if dst == 1 else "n"
    if re.search(r"Additive|Clipping_ColorChange", shader):
        return "a"
    d = shader_blends().get(shader)
    return "a" if d == "One" else "n"


def load_tex(path):
    if not path.startswith("Assets/Ref/"):
        return None
    src = ASSETS + "/" + path[len("Assets/Ref/"):]
    if not os.path.exists(src):
        return None
    im = Image.open(src).convert("RGBA")
    # honour the Unity importer's alpha source (0 none, 1 from input, 2 from grayscale)
    meta = open(src + ".meta", encoding="utf-8", errors="ignore").read() if os.path.exists(src + ".meta") else ""
    m = re.search(r"alphaSource: (\d)", meta) or re.search(r"alphaUsage: (\d)", meta)
    mode = int(m.group(1)) if m else 1
    if mode == 2:
        r, g, b, _ = im.split()
        im.putalpha(Image.merge("RGB", (r, g, b)).convert("L"))
    elif mode == 0:
        im.putalpha(255)
    if max(im.size) > MAX_TEX:
        k = MAX_TEX / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    return im


def pack(images):
    """Shelf-pack images; returns atlas image and per-image (u0, v0, su, sv) in GL uv space."""
    white = Image.new("RGBA", (8, 8), (255, 255, 255, 255))
    imgs = [im or white for im in images] + [white]
    order = sorted(range(len(imgs)), key=lambda i: -imgs[i].height)
    W = max(256, max(im.width for im in imgs) + 4)
    if sum(im.width * im.height for im in imgs) > W * W:
        W = min(2048, max(W, int((sum(im.width * im.height for im in imgs)) ** 0.5) + 64))
    GAP = 2  # texels between packed textures (uvs map exactly, no inset)
    pos, x, y, rowh = {}, 0, 0, 0
    for i in order:
        im = imgs[i]
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + GAP, 0
        pos[i] = (x, y)
        x += im.width + GAP
        rowh = max(rowh, im.height)
    H = y + rowh
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rects = []
    for i, im in enumerate(imgs):
        px, py = pos[i]
        atlas.paste(im, (px, py))
        # same texel centres as sampling the texture on its own
        rects.append((px / W, (H - py - im.height) / H, im.width / W, im.height / H))
    return atlas, rects


# effects whose BakeMesh geometry disagrees with what Unity draws (mesh particles with Local render alignment,
# world-coordinate alpha masks, far-scattered systems) and that are additive: played as a flipbook of Unity's own
# render of the original effect (the reference frames, over black, added on top). Scores under 70 in fxcompare.
FLIPBOOK = {"C__tiamat__atk", "C__zero__skill", "C__zero_s1__skill", "C__zero_s2__skill", "C__e_Fortress_N__skill",
            "C__labiata_s1__atk", "C__blindprincess__skill", "C__tiamat__skill", "C__daphne__atk", "C__daphne_s1__atk",
            "C__khan__skill", "C__khan_s1__skill", "Legion_skill1_hit", "Gigantes_hit",
            "Lemonade_skill1_error_fx", "Lemonade_skill1_Enemy_digital_panel"}

# alpha-blended effects the mesh bake cannot match: flipbooks with alpha recovered from renders over black and white
# (Fx.cs writes <name>_<f>_w.png for names in tools/sdbuild/unity/proj/fx_dual.txt)
FLIPBOOK_ALPHA = {"Harpy_NS1_skill1_Hit", "vfx_vfx_Banshee_ns2_skill1_hit", "FX_hit_bori", "FX_hit_bori_NS2"}
FLIPBOOK_ALPHA |= set(['C__andvari__skill', 'C__andvari_s1__skill', 'C__andvari_s2__skill', 'C__banshee_s2__skill', 'C__harpy_s1__skill', 'C__impet_s1__skill', 'C__thetis__atk', 'C__thetis_s2__atk', 'C__tiamat_s1__skill', 'IronPrince_skill1_debuff', 'Legion_skill2_hit', 'Empris_skill2_Ice_Hit', 'vfx_fafnir_ns1_hit_01', 'vfx_fafnir_ns1_hit_02', 'vfx_fafnir_ns1_hit_03', 'vfx_fafnir_ns1_hit_04', 'Sleipnir_NS2_skill2_Hit', 'Thetis_NS1_skill2_Ground_Aura', 'Tiamat_skill2_front_UP_Hit', 'Tiamat_NS1_skill2_UP_Hit', 'Harpy_NS2_skill2_First_hit', 'Hraesvelgr_NS1_skill1_hit', 'Raven_skill1_Hit', 'Thetis_NS1_skill1_Hit', 'KunoicheZero_skill1_bullet_hit', 'KunoichiZero_NS2_skill1_bullet_hit'])  # scored under 85 as mesh bakes once framed properly (2026-10-26)
FLIPBOOK |= set(['C__brunhild__skill', 'C__brunhild_s1__skill', 'C__khan__atk', 'C__khan_s1__atk', 'Andvari_skill2_Ground_buff', 'Harpy_skill2_Last_Lazer_HIt', 'hela_beam_hit_main', 'Labiata_NS1_skill2_Basic_Hit', 'Leona_NS2_skill2_buff_machine_event', 'Saraqael_skill2_enemy_head_Ring', 'Saraqael_skill2_enemy_Last_head_Ring', 'Saraqael_skill2_Last_Hit', 'Saraqael_skill2_Last_Big_Hit', 'Saraqael_skill2_Last_Hit_after', 'DoomEater_skill2_Hit_F', 'Harpy_NS2_skill1_hit', 'Hraesvelgr_skill1_Lazer_Hit'])
FLIPBOOK_ALPHA |= set(['C__blindprincess_s1__skill', 'C__sleipnir__skill', 'C__sleipnir_s1__skill', 'C__thetis_s1__atk', 'Harvest_skill2_hit', 'Ironprince_skill1_Headsymbol_fx', 'MP_PuPphead_skill2_hit', 'Empress_skill2_ice_first_Hit', 'Khan_skill1_hit', 'Khan_NS2_skill1_Loop_hit', 'Khan_NS2_skill2_Last_Swordhit', 'Labiata_NS1_skill1_Bag_Hit', 'hnadgun_hit', 'sniper_hit', 'Tiamat_NS1_skill1_Duke_Hit'])  # second pass
FLIPBOOK |= set(['C__e_IronPrince_N__atk', 'C__lemonadealpha__atk', 'C__lemonadealpha_s1__atk', 'C__lemonadealpha_s2__atk', 'fafnir_skill1_elec_hit', 'Labiata_skill1_bag_hit', 'Labiata_skill1_hit_first', 'Labiata_skill1_hit', 'Lemonade_skill1_Hit', 'Leona_skill2_buff_machine_event', 'Andvari_skill2_buff_fx'])
FLIPBOOK |= FLIPBOOK_ALPHA


def recover_alpha(black, white):
    """over black B = a*C, over white W = a*C + (1 - a): a = 1 - (W - B), C = B / a (straight colour)."""
    import numpy as np
    B = np.asarray(black, dtype=np.float32) / 255.0
    W = np.asarray(white, dtype=np.float32) / 255.0
    a = np.clip(1.0 - (W - B).mean(axis=2), 0.0, 1.0)
    C = np.where(a[..., None] > 1e-3, B / np.maximum(a[..., None], 1e-3), 0.0)
    out = np.dstack([np.clip(C, 0, 1) * 255, a * 255]).astype("uint8")
    return Image.fromarray(out, "RGBA")


def build_flipbook(name, d):
    pngs = {}
    for f in range(d_nf(d)):
        k = f - (f % 2)
        while k >= 0 and not os.path.exists(os.path.join(SRC, "%s_%d.png" % (name, k))):
            k -= 2
        pngs[f] = k
    keys = sorted({k for k in pngs.values() if k >= 0})
    alpha = name in FLIPBOOK_ALPHA
    raw = {}
    box = None
    for k in keys:
        B = Image.open(os.path.join(SRC, "%s_%d.png" % (name, k))).convert("RGB")
        wp = os.path.join(SRC, "%s_%d_w.png" % (name, k))
        im = recover_alpha(B, Image.open(wp).convert("RGB")) if alpha and os.path.exists(wp) else None
        if im is None:
            im = B.copy()
            im.putalpha(255)  # additive: the frame's light is added as rendered over black
            bb = B.point(lambda v: 255 if v > 3 else 0).getbbox()
        else:
            bb = im.getchannel("A").point(lambda v: 255 if v > 3 else 0).getbbox()
        raw[k] = im
        if bb:
            box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    S = raw[keys[0]].width if keys else 384
    if box is None:
        box = (0, 0, S, S)
    p2 = 3
    box = (max(0, box[0] - p2), max(0, box[1] - p2), min(S, box[2] + p2), min(S, box[3] + p2))
    # only the part of the frame the effect ever lights, at the best resolution the atlas allows
    bw, bh = box[2] - box[0], box[3] - box[1]
    side = math.ceil(math.sqrt(max(1, len(keys))))
    k_ = min(1.0, 2048 / (side * max(bw, bh)))
    tw, th = max(4, int(bw * k_)), max(4, int(bh * k_))
    imgs = [raw[k].crop(box).resize((tw, th), Image.LANCZOS) for k in keys]
    atlas, rects = pack(imgs)
    cx, cy, h = d["cx"], d["cy"], d["half"]
    wx = lambda px: cx - h + px / S * 2 * h
    wy = lambda py: cy + h - py / S * 2 * h
    X0, X1, Y0, Y1 = wx(box[0]), wx(box[2]), wy(box[3]), wy(box[1])
    frames = []
    for f in range(d_nf(d)):
        out = {g: [[], [], [], []] for g in ("n", "a", "rn", "ra")}
        k = pngs[f]
        if k >= 0:
            r = rects[keys.index(k)]
            tgt = out["n" if alpha else "a"]
            tgt[0] += [X0, Y0, X1, Y0, X1, Y1, X0, Y1]
            tgt[1] += [r[0], r[1], r[0] + r[2], r[1], r[0] + r[2], r[1] + r[3], r[0], r[1] + r[3]]
            tgt[2] += [128] * 16
            tgt[3] += [0, 1, 2, 0, 2, 3]
        frames.append(out)
    return atlas, frames

# moving alpha-blended projectiles the mesh bake cannot match: each Unity frame (over black + white) cropped around the
# projectile, played as a quad that travels with it
FLIPBOOK_PROJ = {"eff_Impet_ns2_bullet_1", "eff_Impet_ns2_bullet_2"}
FLIPBOOK_PROJ |= set(['Harpy_NS1_Bullet', 'Harpy_NS1_Bullet_skill2_first', 'Harpy_NS1_Bullet_skill2', 'Harpy_NS2_Bullet', 'Thetis_skill2_Small_Missile', 'Thetis_NS1_Missile', 'Tiamat_Duke_skill1_bullet', 'KunoichiZero_skill1_Bullet'])  # under 90 as mesh bakes (2026-10-26, second pass)
FLIPBOOK |= FLIPBOOK_PROJ


def build_flipbook_proj(name, d):
    xs = [v for fr in d["frames"] for it in fr for v in it["v"][0::2]]
    ys = [v for fr in d["frames"] for it in fr for v in it["v"][1::2]]
    pad = 0.15
    x0, x1, y0, y1 = min(xs) - pad, max(xs) + pad, min(ys) - pad, max(ys) + pad  # extent around the projectile
    cx, cy, h, org = d["cx"], d["cy"], d["half"], d.get("org") or []
    S = None
    crops, keys = [], []
    for f in range(d_nf(d)):
        k = f - (f % 2)
        bp, wp = os.path.join(SRC, "%s_%d.png" % (name, k)), os.path.join(SRC, "%s_%d_w.png" % (name, k))
        if not os.path.exists(bp):
            keys.append(-1)
            continue
        if k not in [kk for kk, _ in crops]:
            B = Image.open(bp).convert("RGB")
            S = B.width
            ox = org[k] if k < len(org) else 0
            tox = lambda X: (X - (cx - h)) / (2 * h) * S
            toy = lambda Y: ((cy + h) - Y) / (2 * h) * S
            box = (int(tox(ox + x0)), int(toy(y1)), int(math.ceil(tox(ox + x1))), int(math.ceil(toy(y0))))
            im = B.crop(box)
            if os.path.exists(wp):
                im = recover_alpha(im, Image.open(wp).convert("RGB").crop(box))
            else:
                im.putalpha(255)
            crops.append((k, im))
        keys.append(k)
    order = [kk for kk, _ in crops]
    atlas, rects = pack([im for _, im in crops])
    frames = []
    for f in range(d_nf(d)):
        out = {g: [[], [], [], []] for g in ("n", "a", "rn", "ra")}
        k = keys[f]
        if k >= 0:
            r = rects[order.index(k)]
            tgt = out["n"]
            tgt[0] += [x0, y0, x1, y0, x1, y1, x0, y1]
            tgt[1] += [r[0], r[1], r[0] + r[2], r[1], r[0] + r[2], r[1] + r[3], r[0], r[1] + r[3]]
            tgt[2] += [128] * 16
            tgt[3] += [0, 1, 2, 0, 2, 3]
        frames.append(out)
    return atlas, frames


def d_nf(d):
    return len(d["frames"])


def build(name):
    src = os.path.join(SRC, name + ".json")
    done = os.path.join(OUT, name + ".m.js")
    if not FORCE and os.path.exists(done) and os.path.getmtime(done) >= os.path.getmtime(src):
        return 0  # already converted
    d = json.load(open(os.path.join(SRC, name + ".json"), encoding="utf-8"))
    if name in FLIPBOOK_PROJ:
        atlas, frames = build_flipbook_proj(name, d)
        return finish(name, d, atlas, frames)
    if name in FLIPBOOK:
        atlas, frames = build_flipbook(name, d)
        return finish(name, d, atlas, frames)
    images = [load_tex(t) for t in d["textures"]]
    # material tiling / offset (TRANSFORM_TEX): uvs leave 0..1 when they repeat, so a texture used that way is
    # stored repeated (up to MAX_REP x MAX_REP) and each item's uvs are moved into that range
    def st_of(it):
        st = it.get("st") or [1, 1, 0, 0]
        return [1, 1, 0, 0] if d["shaders"][it["s"]] == "Sprites/Default" else st  # sprite shaders ignore _MainTex_ST
    reps = [[1, 1] for _ in images]
    for fr in d["frames"]:
        for it in fr:
            sx, sy, ox, oy = st_of(it)
            if (sx, sy, ox, oy) == (1, 1, 0, 0) or images[it["t"]] is None:
                continue
            u = it["u"]
            us = [u[j * 2] * sx + ox for j in range(len(u) // 2)]
            vs = [u[j * 2 + 1] * sy + oy for j in range(len(u) // 2)]
            if not us:
                continue
            for a, vals in ((0, us), (1, vs)):
                lo = math.floor(min(vals) + 1e-6)
                reps[it["t"]][a] = max(reps[it["t"]][a], min(MAX_REP, math.ceil(max(vals) - lo - 1e-6)))
    for i, (nx, ny) in enumerate(reps):
        if images[i] is not None and (nx > 1 or ny > 1):
            im = images[i]
            big = Image.new("RGBA", (im.width * nx, im.height * ny))
            for x in range(nx):
                for y in range(ny):
                    big.paste(im, (x * im.width, y * im.height))
            if max(big.size) > MAX_TEX * 2:
                k = MAX_TEX * 2 / max(big.size)
                big = big.resize((max(1, int(big.width * k)), max(1, int(big.height * k))), Image.LANCZOS)
            images[i] = big
    atlas, rects = pack(images)
    white = rects[-1]
    frames = []
    for fr in d["frames"]:
        out = {g: [[], [], [], []] for g in ("n", "a", "rn", "ra")}  # pos, uv, col, idx; r* = trails
        for it in fr:
            b = blend_of(d["shaders"][it["s"]])
            if "Distortion" in d["shaders"][it["s"]] or not d["shaders"][it["s"]]:
                continue  # screen distortion, or a renderer without a material (drawn by nothing in the game)
            tgt = out[("r" + b) if it.get("tr") else b]
            base = len(tgt[0]) // 2
            r = rects[it["t"]] if images[it["t"]] is not None else white
            k = list(it["k"])
            v, u, c = it["v"], it["u"], it["c"]
            sx, sy, ox, oy = st_of(it)
            nx, ny = reps[it["t"]]
            if ((sx, sy, ox, oy) != (1, 1, 0, 0) or nx > 1 or ny > 1) and len(u) >= 2 and images[it["t"]] is not None:
                uu0 = [u[j * 2] * sx + ox for j in range(len(u) // 2)]
                vv0 = [u[j * 2 + 1] * sy + oy for j in range(len(u) // 2)]
                lu, lv = math.floor(min(uu0) + 1e-6), math.floor(min(vv0) + 1e-6)
                u = []
                for a, b2 in zip(uu0, vv0):
                    u += [min(1, max(0, (a - lu) / nx)), min(1, max(0, (b2 - lv) / ny))]
            for j in range(len(v) // 2):
                tgt[0] += [round(v[j * 2], 4), round(v[j * 2 + 1], 4)]
                uu, vv = u[j * 2], u[j * 2 + 1]
                if images[it["t"]] is None:
                    uu, vv = 0.5, 0.5
                tgt[1] += [round(r[0] + uu * r[2], 5), round(r[1] + vv * r[3], 5)]
                # colour and alpha are stored at half scale (material colour/opacity = 2) so 2x tints survive
                # and the product is clamped by the GPU after multiplying, as in Unity
                tgt[2] += [min(255, int(c[j * 4] * k[0] / 2)), min(255, int(c[j * 4 + 1] * k[1] / 2)),
                           min(255, int(c[j * 4 + 2] * k[2] / 2)), min(255, int(c[j * 4 + 3] * k[3] / 2))]
            cm = cull_of(d["shaders"][it["s"]])
            tri = it["i"]
            if cm:  # Unity draws clockwise (on screen, y up) triangles as front faces
                kept = []
                for t in range(0, len(tri) - 2, 3):
                    a0, a1, a2 = tri[t], tri[t + 1], tri[t + 2]
                    area = (v[a1 * 2] - v[a0 * 2]) * (v[a2 * 2 + 1] - v[a0 * 2 + 1]) - (v[a2 * 2] - v[a0 * 2]) * (v[a1 * 2 + 1] - v[a0 * 2 + 1])
                    front = area < 0
                    if (cm == 2 and front) or (cm == 1 and not front):
                        kept += [a0, a1, a2]
                tri = kept
            tgt[3] += [base + i for i in tri]
        frames.append(out)
    return finish(name, d, atlas, frames)


def finish(name, d, atlas, frames):
    buf = io.BytesIO()
    atlas.save(buf, "WEBP", quality=fxpack.ATLAS_QUALITY, method=6)
    fps, org = d["fps"], d.get("org", [])
    far = 1e9 if name in FLIPBOOK else None  # a flipbook quad spans Unity's framing
    packed = pack_frames(frames, abs(d['cx']) + abs(d['cy']) + d['half'], far)
    step = 1
    if sum(len(v) for v in packed[0].values()) > BIG:
        # heavy smoke / debris: every other frame (playback indexes frames by time * fps)
        frames, fps, org, step = frames[::2], fps / 2, org[::2], 2
        packed = pack_frames(frames, abs(d['cx']) + abs(d['cy']) + d['half'], far)
    bins, table, scale = packed
    data = {"fmt": FORMAT, "name": name, "mode": d["mode"], "T": d["T"], "dist": d["dist"], "fps": fps,
            "cx": d["cx"], "cy": d["cy"], "half": d["half"], "org": org, "scale": scale, "step": step,
            "nf": len(frames), "tab": table}
    os.makedirs(OUT, exist_ok=True)
    # http(s) only (the game is served): .m.js + .webp / .h.webp + gzip .bin (tools/fxbuild/fxpack.py)
    return fxpack.write_fx(OUT, name, data, buf.getvalue(), bins)


def pack_frames(frames, extent=None, far=None):
    """Binary frames for the GPU as-is: positions int16 (normalised by `scale`), uvs uint16, colours uint8,
    indices uint16; per frame and group a table row [vertexOffset, vertexCount, indexOffset, indexCount]."""
    import math
    fin = lambda v: v if math.isfinite(v) else 0.0  # a few Unity bakes contain NaN vertices: collapse them
    # positions are int16 normalised by the extent: a stray particle far away (a few bakes have one at 1e4..1e17)
    # would take every other vertex's precision. The extent comes from the 99.9th percentile; triangles reaching
    # past 1.5x of it are dropped and their vertices clamped
    # (the battle field is ~75 rig units wide: nothing past FAR is ever on screen)
    lim = FAR if far is None else far
    for f in frames:
        for g in GROUPS:
            pos, uv, col, idx = f[g]
            far = {j for j in range(len(pos) // 2) if not (abs(fin(pos[j * 2])) <= lim and abs(fin(pos[j * 2 + 1])) <= lim)}
            if not far:
                continue
            if idx:
                keep = []
                for t in range(0, len(idx), 3):
                    tri = idx[t:t + 3]
                    if not any(v in far for v in tri):
                        keep += tri
                f[g][3] = keep
            for j in far:
                pos[j * 2] = max(-lim, min(lim, fin(pos[j * 2])))
                pos[j * 2 + 1] = max(-lim, min(lim, fin(pos[j * 2 + 1])))
    scale = max([abs(fin(v)) for f in frames for g in GROUPS for v in f[g][0]] + [1e-6])
    P, U, C, I = bytearray(), bytearray(), bytearray(), bytearray()
    table, nv, ni = [], 0, 0
    for f in frames:
        row = []
        for g in GROUPS:
            pos, uv, col, idx = f[g]
            n = len(pos) // 2
            if not idx:
                row.append(0)
                continue
            assert n < 65536
            P += struct.pack("<%dh" % len(pos), *[max(-32767, min(32767, int(round(fin(v) / scale * 32767)))) for v in pos])
            U += struct.pack("<%dH" % len(uv), *[max(0, min(65535, int(round(fin(v) * 65535)))) for v in uv])
            C += bytes(max(0, min(255, int(v))) for v in col)
            I += struct.pack("<%dH" % len(idx), *idx)
            row.append([nv, n, ni, len(idx)])
            nv += n
            ni += len(idx)
        table.append(row)
    return {"p": bytes(P), "u": bytes(U), "c": bytes(C), "i": bytes(I)}, table, round(scale, 5)


FORCE = "--force" in sys.argv
if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a != "--force"]
    names = names or sorted(os.path.splitext(f)[0] for f in os.listdir(SRC) if f.endswith(".json") and not f.endswith((".fire.json", ".anc.json")))
    total = 0
    for n in names:
        try:
            total += build(n)
        except Exception as e:  # noqa: BLE001
            print("FAIL", n, e)
    # identical bakes (skin rigs sharing the base rig's particles) keep one copy of the side files
    print("dedupe: %.1f MB removed" % (fxpack.dedupe(OUT) / 1e6))
    meta = json.load(open(os.path.join(HERE, "fx_meta.json")))
    built = {f[:-len(".m.js")] for f in os.listdir(OUT) if f.endswith(".m.js") and not f.startswith("_")}
    # fire point positions per rig / clip / event time (clip jobs), and which clips have baked in-prefab particles
    fires = {}
    sd_paths = {}
    sd_anim = {}

    def web_paths(rig):  # node paths of the web rig (js/sd/<rig>.js), relative like the Unity chains below
        if rig not in sd_paths:
            p = os.path.join(HERE, "..", "..", "js", "sd", rig + ".js")
            txt = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
            sd_paths[rig] = set(re.findall(r'"path":"([^"]*)"', txt))
            m = re.search(r'"n":"([^"]*)","p":-?\d+,"t":\[[^\]]*\],"q":\[[^\]]*\],"s":\[[^\]]*\],"a":\d,"path":""', txt)
            sd_anim[rig] = m.group(1) if m else None
        return sd_paths[rig]
    for f in os.listdir(SRC):
        if f.startswith("C__") and f.endswith(".fire.json"):
            _, rig, clip = f[:-len(".fire.json")].split("__")
            d = json.load(open(os.path.join(SRC, f)))
            if not d:
                continue
            # each shot as an offset from the nearest ancestor bone the web rig keeps (Unity's own positions at that
            # moment): the battle adds it to that bone as the web rig draws it, so the shot leaves the drawn weapon
            ap = os.path.join(SRC, f[:-len(".fire.json")] + ".anc.json")
            anc = json.load(open(ap)) if os.path.exists(ap) else {}
            paths = web_paths(rig)
            anim = sd_anim.get(rig)
            for t, row in d.items():
                ar = anc.get(t) or {}
                for n, pos in list(row.items()):
                    chain = ar.get(n) or []
                    # web paths are relative to the Animator's object (path ""): ancestors up to it
                    ai = next((i for i, x in enumerate(chain) if x[0] == anim), len(chain) - 1)
                    for a in range(ai + 1):
                        path = "/".join(x[0] for x in reversed(chain[a:ai]))
                        if path in paths:
                            row[n] = [round(pos[0] - chain[a][1], 4), round(pos[1] - chain[a][2], 4), path]
                            break
            fires.setdefault(rig, {})[clip] = d
    out = {"meta": {k: v for k, v in meta["meta"].items() if k in built}, "timelines": meta["timelines"], "fires": fires,
           "clips": sorted(n for n in built if n.startswith("C__")),
           "size": {n: fxpack.side_size(OUT, n) for n in built}}
    open(os.path.join(OUT, "_meta.js"), "w", encoding="utf-8").write("window.FX_META=" + json.dumps(out, separators=(",", ":")) + ";" + chr(10))
    print("fx:", len(names), "%.1f MB" % (total / 1e6), "| meta:", len(out["meta"]), "effects,", len(out["clips"]), "clip particle sets,", len(fires), "rigs with fire points")
