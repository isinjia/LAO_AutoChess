import os, re, sys, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sdbuild"))
import build_sd as B
rigs = sorted(f[:-3] for f in os.listdir("js/sd") if f.endswith(".js") and ".a" not in f and not f.startswith("e_"))
fn = collections.Counter(); ex = {}
EV = re.compile(r"- time: ([\d.e-]+)\n\s+functionName: (\w+)\n\s+data: ?(.*)")
for r in rigs:
    if r not in B.UNITS: continue
    try:
        cd, pf = B.find_char(B.UNITS[r]); an = B.find_anims(cd, B.UNITS[r])
    except Exception as e:
        print("miss", r, e); continue
    for k in ("atk", "skill"):
        if k not in an: continue
        for m in EV.finditer(open(an[k], encoding="utf-8", errors="ignore").read()):
            f = m.group(2)
            if re.search(r"Sound|Dynamic|Camera|Move|Jump|TimeScale", f): continue
            fn[f] += 1; ex.setdefault(f, set()).add(m.group(3).strip())
print(len(rigs), "rigs")
for f, n in fn.most_common(): print(n, f, sorted(ex[f])[:8])
