"""Fetch original Last Origin unit data for every SD rig and write js/lao_units.js.

Source: the game's decoded tables as published by lo.swaytwig.com (Korean server):
  https://lo-swaytwig.b-cdn.net/yaml/korea/unit/<uid>.yml   class, role, stats, skills (rate / range / AP / 3x3 grid)
  https://lo-swaytwig.b-cdn.net/yaml/locale/KR.*.yml         Korean unit and skill names
The Unity project (E:/LAO_Google_QA) has no unit tables: they are downloaded from the game server at run time.

Usage: python tools/fetch_lao_data.py      (cache: tools/.lao_cache, delete it to refetch)
"""
import json
import os
import re
import sys
import urllib.request

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".lao_cache")
CDN = "https://lo-swaytwig.b-cdn.net/yaml"
Loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


class _Loader(Loader):
    pass


# a bare "=" scalar resolves to YAML's "value" tag, which the safe loader does not know
_Loader.add_constructor("tag:yaml.org,2002:value", lambda loader, node: loader.construct_scalar(node))
Loader = _Loader

# SD rig id (js/sd/<id>.js) -> original unit uid (same table as the defence project's tools/build_sd.py)
SD_UNITS = {
    "brownie": "BR_Brownie", "gnome": "BR_Gnome", "leprechaun": "BR_Leprechaun", "impet": "BR_Impet",
    "banshee": "BR_Banshee", "nymph": "BR_Nymph", "raven": "BR_Raven", "harpy": "BR_Harpy",
    "sylphid": "BR_Sylphid", "valkyrie": "BR_Valkyrie", "phoenix": "BR_Phoenix", "zero": "DS_KunoichiZero",
    "thetis": "BR_Thetis", "leona": "BR_Leona", "undine": "BR_Undine", "azazel": "DS_Azazel",
    "hela": "BR_Hela", "tiamat": "ST_Tiamat", "labiata": "3P_Labiata", "sleipnir": "BR_Sleipnir",
    "constantia": "3P_ConstantiaS2", "titania": "3P_Titania", "mercury": "ST_Mercury",
    "empress": "PECS_Empress", "fafnir": "BR_Fafnir", "ramiel": "DS_Ramiel",
    "blacklilith": "3P_BlackLilith", "brunhild": "BR_Brunhild", "khan": "BR_Khan", "daphne": "3P_Daphne",
    "andvari": "BR_Andvari", "hraesvelgr": "BR_Hraesvelgr", "lemonadealpha": "PECS_LemonadeAlpha",
    "eternity": "3P_Eternity", "ullr": "ST_Ullr", "saraqael": "DS_Saraqael", "lrl": "PECS_LRL",
    "amy": "BR_Amy", "cyclopsprincess": "PECS_CyclopsePrincess", "blindprincess": "PECS_BlindPrincess",
    "alvis": "BR_Alvis", "sandman": "BR_SandMan",
}
LOCALES = ["UNIT", "SKILL_00", "SKILL_01", "SKILL_02", "SKILL_03"]

# buff "type" values (lo.swaytwig enum, same as the game's BUFF_EFFECT_TYPE) used to classify team skills
HEAL_T = {4, 5}  # STAT_HP_VALUE / STAT_HP_RATIO on allies = repair
SHIELD_T = {33, 34, 35, 36, 37, 38}  # STAGE_SHIELD_* / immune shields
TAUNT_T = {56, 74, 128}  # STAGE_AGRO_VALUE / STAGE_PROVOKE / PROVOKE_ATTACKER
PROTECT_T = {50, 51, 75, 76}  # STAGE_BLOCK_COLUMN / GRID / ROW / CHARACTER: covers allies (보호)
DEBUFF_T = {87, 78, 3, 1, 13, 11, 79}  # marking, snare, stat downs (on enemies), seal


def get(path, name):
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, name)
    if not os.path.exists(local):
        req = urllib.request.Request(CDN + "/" + path, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
        if data[:15].lower().startswith(b"<html"):
            raise RuntimeError("not found: " + path)
        with open(local, "wb") as f:
            f.write(data)
    with open(local, encoding="utf-8") as f:
        return yaml.load(f, Loader=Loader)


def buff_types(node, out):
    """Collect effect type ids (each effect stores its type under value.type) and a few keywords."""
    if isinstance(node, dict):
        v = node.get("value")
        if "attr" in node and isinstance(v, dict) and isinstance(v.get("type"), int):
            out.add(v["type"])
            if "heal" in json.dumps(v) or "recover" in json.dumps(v):
                out.add("heal")
        for x in node.values():
            buff_types(x, out)
    elif isinstance(node, list):
        for x in node:
            buff_types(x, out)
    return out


def skill(u, key, names, uid):
    s = (u.get("skills") or {}).get(key)
    if not s:
        return None
    data = s["buffs"]["data"]
    top = data[-1]  # max skill level
    # 3x3 area, index = row * 3 + col (col 0 = front). "F>..." = fixed cells of the enemy grid (not centred on the
    # target); "4>..." = centred on the target like a plain pattern
    raw = str(top.get("grid") or "0,0,0,0,1,0,0,0,0")
    fixed = raw.startswith("F>")
    raw = re.sub(r"^[^>]*>", "", raw)
    grid = [1 if x.strip() not in ("0", "") else 0 for x in raw.split(",")]
    types = buff_types(top.get("buffs"), set())
    out = {
        "name": names.get("UNIT_SKILL_%s_%s" % (uid, key), ""),
        "target": s.get("target"),  # enemy / team
        "rate": round(float(top.get("rate") or 0), 3),
        "range": int(top.get("range") or 0),
        "ap": int(top.get("ap") or 0),
        "grid": grid,
        "fixed": fixed,
        "pierce": bool(top.get("dismiss_guard")),
    }
    if out["target"] != "enemy":
        out["effect"] = ("taunt" if types & TAUNT_T else "protect" if types & PROTECT_T else
                         "heal" if (types & HEAL_T or "heal" in types) else "shield" if types & SHIELD_T else "buff")
    out["types"] = sorted(t for t in types if isinstance(t, int))
    return out


def main():
    names = {}
    for loc in LOCALES:
        names.update(get("locale/KR.%s.yml" % loc, "KR.%s.yml" % loc) or {})
    units = {}
    for sid, uid in SD_UNITS.items():
        u = get("korea/unit/%s.yml" % uid, uid + ".yml")
        st = u["stat"][0] if isinstance(u.get("stat"), list) else None
        if st is None:  # some files keep stats under another key
            st = next((v[0] for k, v in u.items() if k.lower().startswith("stat") and isinstance(v, list)), None)
        units[sid] = {
            "uid": uid,
            "name": names.get("UNIT_SHORT_" + uid) or names.get("UNIT_" + uid) or uid,
            "fullName": names.get("UNIT_" + uid, ""),
            "rarity": u["rarity"],  # 2 B / 3 A / 4 S / 5 SS
            "type": u["type"],  # 0 light / 1 heavy / 2 air (mobility)
            "role": u["role"],  # 0 defender / 1 attacker / 2 supporter
            "body": u.get("body", 0),  # 0 bioroid / 1 AGS
            "group": u.get("group", ""),
            "groupName": names.get("UNIT_GROUP_" + u.get("group", ""), ""),
            "hp": st["HP"][1], "atk": st["ATK"][1], "def": st["DEF"][1],  # level 100 at base rarity
            "spd": st["SPD"], "cri": st["CRI"], "eva": st["EVA"], "acc": st.get("ACC", 0),
            "s1": skill(u, "1", names, uid),
            "s2": skill(u, "2", names, uid),
        }
        print("%-15s %-14s %s %s r%d  s1 %s  s2 %s" % (sid, uid, "LHA"[u["type"]], "DAS"[u["role"]], u["rarity"],
              units[sid]["s1"] and units[sid]["s1"]["name"], units[sid]["s2"] and units[sid]["s2"]["name"]))
    body = ("// generated by tools/fetch_lao_data.py from the original game data (lo.swaytwig.com, Korean server)\n"
            "(function (r) { const D = " + json.dumps(units, ensure_ascii=False, separators=(",", ":")) +
            ";\n  if (typeof module !== 'undefined') module.exports = D; else r.LAO_UNITS = D; })(this);\n")
    with open(os.path.join(ROOT, "js", "lao_units.js"), "w", encoding="utf-8") as f:
        f.write(body)
    print(len(units), "units -> js/lao_units.js")


if __name__ == "__main__":
    sys.exit(main())
