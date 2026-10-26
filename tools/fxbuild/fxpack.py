"""Packed side files of the baked effects, served over http(s) next to the metadata scripts (format 2).

js/fx/<name>.m.js   metadata (no payload); "bo" = byte offsets into the DECODED frame buffer; "src" = another effect
                    whose .bin / .webp this one shares (identical bake: skins reuse the base rig's particles)
js/fx/<name>.bin    gzip of the frame buffer with every 16-bit stream (positions, uvs, indices) stored as deltas
                    between consecutive values, low bytes first then high bytes (byte planes); colours raw.
                    Lossless; about 5-6x smaller than the raw buffer where plain gzip gives 2.5x.
js/fx/<name>.webp   atlas at upload size (desktop, capped at GPU_MAX); <name>.h.webp = half size (phones)

The web runtime (js/fxbake.js, FXB.FORMAT 2) gunzips with DecompressionStream and undoes the planes / deltas.
"""
import gzip
import hashlib
import io
import json
import os

import numpy as np
from PIL import Image

GPU_MAX = 4096  # the page never uploads a larger texture
ORDER = ("p", "u", "i", "c")  # 2-byte types first: every view starts on an even offset
ATLAS_QUALITY = 90
FORMAT = 2


def enc16(raw):
    """int16/uint16 little-endian stream -> deltas (mod 2^16), byte planes (all low bytes, then all high bytes)."""
    if not raw:
        return b""
    a = np.frombuffer(raw, dtype="<u2").astype(np.int32)
    d = (np.diff(a, prepend=0) & 0xFFFF).astype("<u2")
    u = d.view(np.uint8).reshape(-1, 2)
    return u[:, 0].tobytes() + u[:, 1].tobytes()


def dec16(enc):
    """Inverse of enc16 (used by the self-test / repack verification)."""
    if not enc:
        return b""
    n = len(enc) // 2
    u = np.empty((n, 2), dtype=np.uint8)
    u[:, 0] = np.frombuffer(enc[:n], dtype=np.uint8)
    u[:, 1] = np.frombuffer(enc[n:], dtype=np.uint8)
    d = u.view("<u2").reshape(-1).astype(np.int64)
    return (np.cumsum(d) & 0xFFFF).astype("<u2").tobytes()


def encode_bins(bins):
    """bins: {"p","u","c","i"} raw bytes -> (gzip payload, bo)."""
    bo, off, parts = {}, 0, []
    for k in ORDER:
        bo[k] = [off, len(bins[k])]
        off += len(bins[k])
        parts.append(enc16(bins[k]) if k != "c" else bins[k])
    return gzip.compress(b"".join(parts), compresslevel=9, mtime=0), bo


def decode_bins(payload, bo):
    """gzip payload + bo -> {"p","u","c","i"} raw bytes (verification)."""
    buf = gzip.decompress(payload)
    out = {}
    for k in ORDER:
        o, n = bo[k]
        out[k] = dec16(buf[o:o + n]) if k != "c" else buf[o:o + n]
    return out


def atlas_variants(raw_webp, quality=ATLAS_QUALITY):
    """Atlas files at upload size: <name>.webp (desktop, capped at GPU_MAX) and <name>.h.webp (phones, half)."""
    im = Image.open(io.BytesIO(raw_webp))
    out = []
    for suffix, k in ((".webp", 1.0), (".h.webp", 0.5)):
        k = min(k, GPU_MAX / max(im.size))
        if k >= 0.999:
            out.append((suffix, raw_webp))
            continue
        small = im.convert("RGBA").resize((max(4, round(im.width * k)), max(4, round(im.height * k))), Image.LANCZOS)
        buf = io.BytesIO()
        small.save(buf, "WEBP", quality=quality, method=6)
        out.append((suffix, buf.getvalue()))
    return out


def write_meta(out_dir, name, meta):
    js = "window.FX_DATA=window.FX_DATA||{};FX_DATA[%s]=%s;\n" % (json.dumps(name), json.dumps(meta, separators=(",", ":")))
    with open(os.path.join(out_dir, name + ".m.js"), "w", encoding="utf-8") as f:
        f.write(js)
    return len(js)


def write_fx(out_dir, name, data, raw_atlas, bins, quality=ATLAS_QUALITY):
    """data: the effect's metadata dict (format 2); bins: {"p","u","c","i"} raw bytes. Returns the bytes written."""
    payload, bo = encode_bins(bins)
    meta = {k: v for k, v in data.items() if k not in ("atlas", "bin", "src")}
    meta["fmt"] = FORMAT
    meta["bo"] = bo
    n = write_meta(out_dir, name, meta)
    for suffix, data_ in atlas_variants(raw_atlas, quality):
        with open(os.path.join(out_dir, name + suffix), "wb") as f:
            f.write(data_)
        n += len(data_)
    with open(os.path.join(out_dir, name + ".bin"), "wb") as f:
        f.write(payload)
    return n + len(payload)


def read_meta(path):
    s = open(path, encoding="utf-8").read()
    return json.loads(s[s.index("={") + 1:s.rindex("}") + 1])


def dedupe(out_dir, verbose=True):
    """Effects whose .bin and .webp are byte-identical share one copy: the duplicates keep their .m.js with
    "src" naming the kept effect and lose their side files. Returns the bytes removed."""
    groups = {}
    for f in sorted(os.listdir(out_dir)):
        if not f.endswith(".m.js") or f.startswith("_"):
            continue
        name = f[:-len(".m.js")]
        meta = read_meta(os.path.join(out_dir, f))
        if meta.get("src") or not os.path.exists(os.path.join(out_dir, name + ".bin")):
            continue
        h = hashlib.sha1()
        for ext in (".bin", ".webp"):
            h.update(open(os.path.join(out_dir, name + ext), "rb").read())
        groups.setdefault(h.hexdigest(), []).append(name)
    removed = 0
    for names in groups.values():
        if len(names) < 2:
            continue
        # keep the base rig's bake (shortest name: C__khan__skill over C__khan_s1__skill)
        names.sort(key=lambda n: (len(n), n))
        keep = names[0]
        for dup in names[1:]:
            meta = read_meta(os.path.join(out_dir, dup + ".m.js"))
            meta["src"] = keep
            write_meta(out_dir, dup, meta)
            for ext in (".bin", ".webp", ".h.webp"):
                p = os.path.join(out_dir, dup + ext)
                if os.path.exists(p):
                    removed += os.path.getsize(p)
                    os.remove(p)
            if verbose:
                print("  dup", dup, "->", keep)
    return removed


def side_size(out_dir, name):
    meta = read_meta(os.path.join(out_dir, name + ".m.js"))
    base = meta.get("src") or name
    return sum(os.path.getsize(os.path.join(out_dir, base + x)) for x in (".bin", ".webp") if os.path.exists(os.path.join(out_dir, base + x)))


if __name__ == "__main__":  # self-test of the stream coding
    rng = np.random.default_rng(1)
    raw = rng.integers(0, 65536, 1000, dtype=np.uint16).astype("<u2").tobytes()
    assert dec16(enc16(raw)) == raw
    bins = {"p": raw, "u": raw[:400], "i": raw[:600], "c": bytes(rng.integers(0, 256, 800, dtype=np.uint8))}
    payload, bo = encode_bins(bins)
    assert decode_bins(payload, bo) == bins
    print("ok")
