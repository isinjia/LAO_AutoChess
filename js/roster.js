// Card roster for the autobattler, built from the original game data in js/lao_units.js
// (tools/fetch_lao_data.py: class, role, rarity, level-100 stats, active skill 1 / 2 with rate, range, 3x3 area).
//
// Mapping to this game:
//   basic attack = active skill 1, mana skill = active skill 2 (the SD rig's Skill1 / Skill2 clips)
//   cls  : light (경장) / heavy (중장) / air (기동)     light > heavy > air > light
//   role : tank (보호기) / attacker (공격기) / support (지원기)
//   tier : 1..4 from the original rarity B / A / S / SS (the shop cost later)
//   hp / atk / def / crit / eva come from the original stats; aspd from SPD
//   range: original skill range; distance = attacker column + target column + 1 (front 0, back 1)
//   grid : the original 3x3 area (row * 3 + col, col 0 = the side facing us); fixed = whole-grid cells
//   pierce: the original "보호 무시" (dismiss_guard): ignores the tank guard rule
//   skill.kind: damage | mark (debuff: target takes more damage) | buff | shield | protect | taunt
(function (root) {
  const D = typeof module !== 'undefined' ? require('./lao_units.js') : root.LAO_UNITS;

  const BAL = {
    hp: 7.5, // one knob for battle length (tools/sim_test.js prints the average)
    defK: 300, // damage x defK / (defK + def)
    spdRef: 4.1, aspdRef: 2.1, // aspd = aspdRef * spdRef / SPD
    evaK: 0.6, evaMax: 0.35, // dodge chance = EVA% x evaK, capped
  };
  const CLS = ['light', 'heavy', 'air'];
  const ROLE = ['tank', 'attacker', 'support'];
  const TIER = { 2: 1, 3: 2, 4: 3, 5: 4 };
  const TIER_NAME = { 1: 'B', 2: 'A', 3: 'S', 4: 'SS' };

  function kindOf(s) {
    if (s.target !== 'enemy') return s.effect || 'buff';
    return s.rate < 1 ? 'mark' : 'damage';
  }
  function area(s) {
    return { rate: s.rate, range: Math.max(1, s.range || 1), grid: s.grid, fixed: !!s.fixed, pierce: !!s.pierce, name: s.name };
  }

  const ROSTER = [];
  for (const [id, u] of Object.entries(D)) {
    if (!u.s1 || !u.s2) continue;
    ROSTER.push({
      id, uid: u.uid, name: u.name, fullName: u.fullName,
      cls: CLS[u.type], role: ROLE[u.role], tier: TIER[u.rarity] || 1, body: u.body,
      // original squad: SteelLine_1 / SteelLine_2 are one squad for synergies ("II" marks a later sub-unit)
      squad: (u.group || '').replace(/_\d+$/, ''), squadName: (u.groupName || '').replace(/\s+(II|III|IV)$/, ''),
      hp: Math.round(u.hp * BAL.hp / 10) * 10,
      atk: Math.round(u.atk), def: Math.round(u.def),
      aspd: +(BAL.aspdRef * BAL.spdRef / u.spd).toFixed(2),
      crit: Math.max(0, u.cri) / 100,
      eva: Math.min(BAL.evaMax, Math.max(0, u.eva) * BAL.evaK / 100),
      basic: area(u.s1),
      skill: Object.assign(area(u.s2), { kind: kindOf(u.s2) }),
    });
  }
  ROSTER.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'ko'));
  const BY_ID = {};
  for (const r of ROSTER) BY_ID[r.id] = r;

  // default line-ups: [id, col, row]   col 0 = front, 1 = back; row 0 = top (far), 2 = bottom (near)
  const PRESETS = {
    left: { name: '오르카 1소대', units: [['labiata', 0, 0], ['blacklilith', 0, 1], ['empress', 0, 2], ['valkyrie', 1, 0], ['hela', 1, 1], ['brunhild', 1, 2]] },
    right: { name: '철충 토벌대', units: [['eternity', 0, 0], ['zero', 0, 1], ['khan', 0, 2], ['ullr', 1, 0], ['tiamat', 1, 1], ['mercury', 1, 2]] },
  };

  const CLASS_NAME = { light: '경장', air: '기동', heavy: '중장' };
  const ROLE_NAME = { tank: '보호기', attacker: '공격기', support: '지원기' };
  const api = { ROSTER, BY_ID, PRESETS, CLASS_NAME, ROLE_NAME, TIER_NAME, BAL };
  if (typeof module !== 'undefined') module.exports = api; else root.ROSTER = api;
})(this);
