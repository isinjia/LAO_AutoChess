"""Original effects for the card game: which effect each attack / skill clip plays, and Unity bake jobs for them.

  python tools/fxbuild/fx_setup.py      -> tools/sdbuild/unity/proj/fx_jobs.txt (+ assets copied into the proj)
                                           tools/fxbuild/fx_meta.json   (projectile meta, clip timelines)
then  tools/fxbuild/run_fx.cmd (Unity batch: RefFx.Run)  and  python tools/fxbuild/build_fx.py

Sources (the original game's own wiring):
- the attack clip (atk = Skill_1) and the skill clip (skill = Skill_2) of every rig, its animation events:
    EventThrowProjectile[NoDamage]Fire<n>  data = projectile prefab, fired from the character script's _fire<n>
    EventHit / EventHitGround              data = hit effect played on the target (at its body / its feet)
    EventThrowEffect / EventThrowEffectGround   data = effect played on the target (body / feet)
    EventBuffeffect                        data = effect played on the caster
- a projectile prefab: _projectileEndTime (flight time), _eProJectileType (0 line, 1 curve, 2 howitzer, 3 cannon),
  _hitEffectName (+ _scaleHitEffect) played where it lands, the flight curve.
- particle systems inside the character prefab (muzzle flashes, auras) switched on by the clip: one "clip" job per
  rig and clip bakes them along the clip; the same job records where each _fire<n> is at every event.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "sdbuild"))
sys.path.insert(0, os.path.join(HERE, "..", "sdbuild", "unity"))
import build_sd as B  # noqa: E402
import setup as S  # noqa: E402

DIST = 8.0
EV = re.compile(r"- time: ([\d.e-]+)\n\s+functionName: (\w+)\n\s+data: ?(.*)")
# event effects missing from the source assets -> the nearest original (same prefab family)
ALIAS = {"Azazel_NS1_skill2_buff": "Azazel_NS1_skill2_buff_F", "Hit_x5": "Hit_x2"}
KIND = [  # event function -> timeline code
    (re.compile(r"^EventThrowProjectile(NoDamage)?Fire(\d)$"), "p"),
    (re.compile(r"^EventHitGround$"), "hg"),
    (re.compile(r"^EventHit$"), "h"),
    (re.compile(r"^EventThrowEffectGround$"), "eg"),
    (re.compile(r"^EventThrowEffect$"), "e"),
    (re.compile(r"^EventBuffeffect$"), "b"),
]


def prefab_index():
    idx = {}
    for d in ["AssetBundleResource/Bullet_Effect", "AssetBundleResource/FX", "AssetBundleResourceSub/FX", "AssetBundleResourceSub", "AssetBundleResource"]:
        for p in glob.glob(B.ROOT + "/" + d + "/**/*.prefab", recursive=True):
            idx.setdefault(os.path.splitext(os.path.basename(p))[0].lower(), p.replace("\\", "/"))
    return idx


def curve_keys(text):
    m = re.search(r"animationCurve:\n(?:.*\n)*?    m_Curve:\n((?:    - .*\n(?:      .*\n)*)*)", text)
    if not m:
        return ""
    keys = re.findall(r"time: ([\d.e-]+)\n\s+value: ([\d.e-]+)", m.group(1))
    return ",".join("%s:%s" % (t, v) for t, v in keys)


def fire_paths(prefab):
    """_fire1.._fire4 of the character script -> transform path from the prefab root ('a/b/c')."""
    docs = B.load_docs(prefab)
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    go = {k: d for k, (c, d) in docs.items() if c == 1}

    def path(tid):
        names = []
        while tid and tid in tr:
            t = tr[tid]
            names.append(go.get(str(t["m_GameObject"]["fileID"]), {}).get("m_Name", "?"))
            tid = str(t["m_Father"]["fileID"])
            if tid == "0":
                break
        return "/".join(reversed(names[:-1]))  # without the root's own name
    out = {}
    for k, (c, d) in docs.items():
        if c != 114:
            continue
        for n in range(1, 5):
            ref = d.get("_fire%d" % n)
            if isinstance(ref, dict) and str(ref.get("fileID", "0")) != "0":
                fid = str(ref["fileID"])
                if fid in tr:
                    out[n] = path(fid)
                elif fid in go:  # a GameObject reference: its transform
                    t = next((tk for tk, td in tr.items() if str(td["m_GameObject"]["fileID"]) == fid), None)
                    if t:
                        out[n] = path(t)
    return out


def rig_sources():
    """rig id -> (prefab, {clip: anim path}) for every unit / skin / enemy rig the game ships."""
    rigs = sorted(f[:-3] for f in os.listdir(os.path.join(ROOT, "js", "sd")) if f.endswith(".js") and ".a" not in f)
    out = {}
    for r in rigs:
        try:
            if r.startswith("e_"):
                model = B.ENEMIES.get(r[2:])
                if not model:
                    continue
                prefab = B.MONSTER_DIR + "/" + model + ".prefab"
                anims = B.pick_clips(B.controller_anims(prefab))
            else:
                if r not in B.UNITS:
                    continue
                cd, prefab = B.find_char(B.UNITS[r])
                anims = B.find_anims(cd, B.UNITS[r])
                if r.startswith("sandman") and ("atk" not in anims or "skill" not in anims):  # 샌드걸: clips named by the controller only
                    anims = dict(B.pick_clips(B.controller_anims(prefab)), **anims)
        except Exception as e:  # noqa: BLE001
            print("skip", r, e)
            continue
        out[r] = (prefab.replace("\\", "/"), {k: anims[k] for k in ("atk", "skill") if k in anims})
    return out


def clip_length(path):
    text = open(path, encoding="utf-8", errors="ignore").read()
    m = re.search(r"m_StopTime: ([\d.e-]+)", text)
    return float(m.group(1)) if m else 3.0


def main():
    idx = prefab_index()
    copied = set()
    timelines, fires, need = {}, {}, []
    jobs = []
    for rig, (prefab, clips) in rig_sources().items():
        has_ps = "ParticleSystem:" in open(prefab, encoding="utf-8", errors="ignore").read()
        fp = fire_paths(prefab)
        if fp:
            fires[rig] = fp
        for clip, path in clips.items():
            text = open(path, encoding="utf-8", errors="ignore").read()
            tl = []
            for m in EV.finditer(text):
                fn, data = m.group(2), m.group(3).strip()
                for rx, code in KIND:
                    mm = rx.match(fn)
                    if not mm:
                        continue
                    name = data.split(",")[0].strip()
                    name = ALIAS.get(name, name)
                    n = int(mm.group(2)) if code == "p" else 0
                    tl.append([round(float(m.group(1)), 4), code, n, name, 1 if (code == "p" and mm.group(1)) else 0])
                    if name:
                        need.append(name)
                    break
            tl.sort(key=lambda e: e[0])
            if tl:
                timelines.setdefault(rig, {})[clip] = {"d": round(clip_length(path), 4), "ev": tl}
            # the clip job: in-prefab particles along the clip + fire point positions at the events
            if has_ps or (fp and any(e[1] == "p" for e in tl)):
                times = sorted({e[0] for e in tl if e[1] == "p"})
                jobs.append("|".join(["C__%s__%s" % (rig, clip), S.copy_asset(prefab, copied), "clip", S.copy_asset(path, copied),
                                      ";".join("%d=%s" % (n, p) for n, p in sorted(fp.items())), str(min(clip_length(path), 12.0)),
                                      ",".join(str(t) for t in times), "1" if has_ps else "0"]))
    # effect prefabs (projectiles bring their hit effects)
    meta, seen = {}, set()
    queue = list(dict.fromkeys(need))
    missing = []
    while queue:
        name = queue.pop(0)
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        src = idx.get(name.lower())
        if not src:
            missing.append(name)
            continue
        rel = S.copy_asset(src, copied)
        text = open(src, encoding="utf-8", errors="ignore").read()
        et = re.search(r"_projectileEndTime: ([\d.e-]+)", text)
        hit = re.search(r"_hitEffectName: (.*)", text)
        if et:
            T = float(et.group(1))
            jobs.append("|".join([name, rel, "proj", str(T), str(DIST), str(T + 0.1), curve_keys(text)]))
            h = hit.group(1).strip() if hit else ""
            if h:
                queue.append(h)
            ty = re.search(r"_eProJectileType: (\d)", text)
            meta[name] = {"type": int(ty.group(1)) if ty else 0, "T": T, "hit": h,
                          "hitScale": float((re.search(r"_scaleHitEffect: ([\d.e-]+)", text) or [0, 1])[1])}
        else:
            jobs.append("|".join([name, rel, "static", "0", "0", "-1", ""]))
            meta[name] = {"type": -1}
    with open(os.path.join(S.PROJ, "fx_jobs.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(jobs) + "\n")
    json.dump({"meta": meta, "timelines": timelines, "fires": fires, "missing": missing},
              open(os.path.join(HERE, "fx_meta.json"), "w"), indent=1)
    print("jobs:", len(jobs), "effects:", len(meta), "timelines:", len(timelines), "copied:", len(copied), "missing:", missing)


if __name__ == "__main__":
    main()
