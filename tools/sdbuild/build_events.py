"""Attack timing and muzzle points from the original characters.

- When each attack fires or hits: Unity animation events EventThrowProjectileFire<n> / EventThrowEffect* / EventHit*
  of the attack clip (the game plays the whole clip per attack and fires on these, not on a free-running timer).
- Where a projectile leaves: the character script's _fire1.._fire4 Transforms (EventThrowProjectileFire<n> fires
  from _fire<n>). Those are usually empty transforms that the rig build prunes, so each is stored as its chain up
  to the root: [name, local position, local rotation, local scale] per level; the page anchors it on the nearest
  bone that the rig kept.
Output: js/anim_events.js (merged: only the ids given are rebuilt) -> window.ANIM_EV = { uid: { atk: { d, t: [s...], f: [fire#...] }, skill: {...}, fire: { n: chain } } }
  python tools/sdbuild/build_events.py <id> [<id> ...]   (copied from 5_LAO_Defence)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_sd as B  # noqa: E402

FIRE = re.compile(r"^Event(ThrowProjectileFire(\d*)|ThrowEffect\w*|Hit|HitGround)$")


def clip_events(path):
    s = open(path, encoding="utf-8", errors="ignore").read()
    start = float((re.search(r"m_StartTime: ([\d.e-]+)", s) or [0, 0])[1])
    stop = float((re.search(r"m_StopTime: ([\d.e-]+)", s) or [0, 1])[1])
    ev = {}
    for t, fn in re.findall(r"- time: ([\d.e-]+)\n    functionName: (\w+)", s):
        m = FIRE.match(fn)
        if not m:
            continue
        k = round(float(t) - start, 3)
        n = int(m.group(2) or 1) if m.group(1).startswith("ThrowProjectileFire") else 0
        ev[k] = max(ev.get(k, 0), n)  # several events on one frame: keep the projectile one
    ts = sorted(ev)
    out = {"d": round(stop - start, 3), "t": ts, "f": [ev[k] for k in ts]}
    # script-driven moves to the target and back (melee): [start, arrive, leave, home] in clip seconds
    mv = {fn: round(float(t) - start, 3) for t, fn in re.findall(r"- time: ([\d.e-]+)\n    functionName: (\w+)", s)
          if fn in ("EventMoveMotionStart", "EventMoveMotionEnd", "EventMoveMotionBackStart", "EventMoveMotionBackEnd")}
    if len(mv) == 4:
        out["mv"] = [mv["EventMoveMotionStart"], mv["EventMoveMotionEnd"], mv["EventMoveMotionBackStart"], mv["EventMoveMotionBackEnd"]]
    return out


def fire_points(prefab):
    docs = B.load_docs(prefab)
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    out = {}
    for k, (c, d) in docs.items():
        if c != 114:
            continue
        for n in range(1, 5):
            ref = d.get("_fire%d" % n)
            tid = str((ref or {}).get("fileID", 0))
            if tid == "0" or tid not in tr:
                continue
            chain = []
            while tid in tr:
                t = tr[tid]
                name = go.get(str(t["m_GameObject"]["fileID"]), {}).get("m_Name", "?")
                p, q, s = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
                chain.append([name, [round(B.num(p[a]), 5) for a in "xyz"], [round(B.num(q[a]), 6) for a in "xyzw"],
                              [round(B.num(s[a]), 5) for a in "xyz"]])
                tid = str(t["m_Father"]["fileID"])
            out[n] = chain
    return out


def main(ids):
    path = os.path.join(HERE, "..", "..", "js", "anim_events.js")
    txt = open(path, encoding="utf-8").read()
    out = json.loads(txt[txt.index("=") + 1:txt.rindex(";")])
    for uid in ids:
        model = B.UNITS[uid]
        cd, pf = B.find_char(model)
        an = B.find_anims(cd, model)
        if "move" not in an or "idle" not in an or "atk" not in an:  # same fallback as build_sd: the Animator's clips
            an = dict(B.pick_clips(B.controller_anims(pf)), **an)
        ev = {}
        for k in ("atk", "skill"):
            if k in an:
                c = clip_events(an[k])
                if c["t"]:
                    ev[k] = c
        fp = fire_points(pf)
        if fp:
            ev["fire"] = fp
        out[uid] = ev
        print(uid, {k: (len(v["t"]) if isinstance(v, dict) and "t" in v else len(v)) for k, v in ev.items()})
    head_line = txt[:txt.index("window.ANIM_EV")]
    with open(path, "w", encoding="utf-8") as f:
        f.write(head_line + "window.ANIM_EV=%s;" % json.dumps(out, separators=(",", ":")) + chr(10))
    print("anim events:", len(out), "units")


if __name__ == "__main__":
    main(sys.argv[1:])
