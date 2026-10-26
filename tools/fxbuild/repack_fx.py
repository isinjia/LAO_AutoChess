"""Repack the baked effects already in js/fx from format 1 (raw .bin) to format 2 (tools/fxbuild/fxpack.py:
gzip of delta / byte-plane streams, identical bakes shared) without re-baking from Unity.

    python tools/fxbuild/repack_fx.py            # convert format 1 files in place, dedupe, refresh _meta.js sizes
    python tools/fxbuild/repack_fx.py --verify   # also decode every converted file and compare with the original

The atlases (.webp / .h.webp) are kept as they are (no second lossy encode).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fxpack  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "js", "fx")
VERIFY = "--verify" in sys.argv


def main():
    names = sorted(f[:-len(".m.js")] for f in os.listdir(OUT) if f.endswith(".m.js") and not f.startswith("_"))
    before = after = 0
    done = 0
    for n in names:
        meta = fxpack.read_meta(os.path.join(OUT, n + ".m.js"))
        binp = os.path.join(OUT, n + ".bin")
        if meta.get("fmt", 1) != 1 or meta.get("src") or not os.path.exists(binp):
            continue
        raw = open(binp, "rb").read()
        bins = {k: raw[o:o + l] for k, (o, l) in meta["bo"].items()}
        payload, bo = fxpack.encode_bins(bins)
        if VERIFY:
            assert fxpack.decode_bins(payload, bo) == bins, n
        before += len(raw)
        after += len(payload)
        meta["fmt"] = fxpack.FORMAT
        meta["bo"] = bo
        fxpack.write_meta(OUT, n, meta)
        with open(binp, "wb") as f:
            f.write(payload)
        done += 1
    print("repacked %d effects: .bin %.1f MB -> %.1f MB" % (done, before / 1e6, after / 1e6))
    removed = fxpack.dedupe(OUT)
    print("dedupe: %.1f MB removed" % (removed / 1e6))
    # _meta.js: the per-effect download sizes
    mp = os.path.join(OUT, "_meta.js")
    s = open(mp, encoding="utf-8").read()
    out = json.loads(s[s.index("=") + 1:s.rindex("}") + 1])
    out["size"] = {n: fxpack.side_size(OUT, n) for n in names}
    open(mp, "w", encoding="utf-8").write("window.FX_META=" + json.dumps(out, separators=(",", ":")) + ";" + chr(10))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print("js/fx now %.1f MB" % (total / 1e6))


if __name__ == "__main__":
    main()
