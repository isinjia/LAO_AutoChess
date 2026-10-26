"""Each rig's _fire<n>: its parent bone and local position (prefab), for tools/fxbuild/fxsync.html.
The web rigs prune the empty fire transforms; the sync check rebuilds them from the parent bone."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "sdbuild"))
sys.path.insert(0, os.path.join(HERE, "..", "sdbuild", "unity"))
import build_sd as B  # noqa: E402
import fx_setup as F  # noqa: E402

out = {}
for rig, (prefab, clips) in F.rig_sources().items():
    docs = B.load_docs(prefab)
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    name = lambda tid: go.get(str(tr[tid]["m_GameObject"]["fileID"]), {}).get("m_Name", "?")
    for k, (c, d) in docs.items():
        if c != 114:
            continue
        for n in range(1, 5):
            ref = d.get("_fire%d" % n)
            if not isinstance(ref, dict) or str(ref.get("fileID", "0")) == "0":
                continue
            fid = str(ref["fileID"])
            tid = fid if fid in tr else next((t for t, td in tr.items() if str(td["m_GameObject"]["fileID"]) == fid), None)
            if not tid:
                continue
            t = tr[tid]
            parent = str(t["m_Father"]["fileID"])
            p = t["m_LocalPosition"]
            out.setdefault(rig, {})[n] = [name(parent) if parent in tr else "", [B.num(p["x"]), B.num(p["y"]), B.num(p["z"])]]
json.dump(out, open(os.path.join(HERE, "fire_local.json"), "w"), separators=(",", ":"))
print(len(out), "rigs")
