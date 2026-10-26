// Equipment (장비): the original game's chips, OS and sub-equipment with their icons (assets/items).
// `tier` is the gear's star, ★1-★7: two of the same gear and star merge into the next (js/stage.js mergeItems).
// The icon follows the star colour: bronze T1, silver T2, gold T3, rainbow T4. A unit holds up to two. Effects use the battle modifier keys (js/synergy.js) plus range and class bonuses.
//
//   Items.CATALOG[key] -> { name, slot, icon, desc(tier), mod(tier) }
//   Items.mods(list)   -> merged modifiers of a unit's items   ([{ key, tier }])
//   Items.roll(rand, tier) -> { key, tier }    Items.price(tier)
(function (root) {
  const T = (t) => [0, 1, 1.4, 1.9, 2.5, 3.2, 4, 5][t] || 1; // potency by star
  const pct = (x) => Math.round(x * 100);
  const CATALOG = {
    // chips
    chipAtk: { name: '공격 칩', slot: '칩', icon: 'Chip_Atk', mod: (t) => ({ atk: 1 + 0.1 * T(t) }), desc: (t) => `공격력 +${pct(0.1 * T(t))}%` },
    chipDef: { name: '방어 칩', slot: '칩', icon: 'Chip_Def', mod: (t) => ({ def: 1 + 0.2 * T(t) }), desc: (t) => `방어력 +${pct(0.2 * T(t))}%` },
    chipHp: { name: '체력 칩', slot: '칩', icon: 'Chip_Hp', mod: (t) => ({ hp: 1 + 0.12 * T(t) }), desc: (t) => `체력 +${pct(0.12 * T(t))}%` },
    chipCri: { name: '치명 칩', slot: '칩', icon: 'Chip_Cri', mod: (t) => ({ crit: 0.07 * T(t) }), desc: (t) => `치명 +${pct(0.07 * T(t))}%` },
    chipSpd: { name: '행동 칩', slot: '칩', icon: 'Chip_Spd', mod: (t) => ({ spd: 1 + 0.07 * T(t) }), desc: (t) => `행동 속도 +${pct(0.07 * T(t))}%` },
    // OS
    osAssault: { name: '돌격형 OS', slot: 'OS', icon: 'System_Assault', mod: (t) => ({ skill: 1 + 0.15 * T(t) }), desc: (t) => `스킬 피해 +${pct(0.15 * T(t))}%` },
    osDefense: { name: '방어형 OS', slot: 'OS', icon: 'System_Defense', mod: (t) => ({ hp: 1 + 0.08 * T(t), def: 1 + 0.12 * T(t) }), desc: (t) => `체력 +${pct(0.08 * T(t))}%, 방어력 +${pct(0.12 * T(t))}%` },
    osSniper: { name: '저격형 OS', slot: 'OS', icon: 'System_Sniper', mod: (t) => ({ range: 1, crit: 0.03 * T(t) }), desc: (t) => `사거리 +1, 치명 +${pct(0.03 * T(t))}%` },
    osManeuver: { name: '기동형 OS', slot: 'OS', icon: 'System_Maneuver', mod: (t) => ({ eva: 0.06 * T(t) }), desc: (t) => `회피 +${pct(0.06 * T(t))}%` },
    osAntiTrooper: { name: '대경장 OS', slot: 'OS', icon: 'System_AntiTrooper', mod: (t) => ({ vs: { light: 1 + 0.15 * T(t) } }), desc: (t) => `경장에게 주는 피해 +${pct(0.15 * T(t))}%` },
    osAntiAir: { name: '대기동 OS', slot: 'OS', icon: 'System_AntiAir', mod: (t) => ({ vs: { air: 1 + 0.15 * T(t) } }), desc: (t) => `기동에게 주는 피해 +${pct(0.15 * T(t))}%` },
    osAntiArmor: { name: '대중장 OS', slot: 'OS', icon: 'System_AntiArmor', mod: (t) => ({ vs: { heavy: 1 + 0.15 * T(t) } }), desc: (t) => `중장에게 주는 피해 +${pct(0.15 * T(t))}%` },
    // sub equipment
    subEnergy: { name: '에너지 팩', slot: '보조', icon: 'Sub_EnergyPack', mod: (t) => ({ mana: 20 + 10 * t }), desc: (t) => `전투 시작 마나 +${20 + 10 * t}` },
    subBarrier: { name: '방어막 발생기', slot: '보조', icon: 'Sub_Barrier', mod: (t) => ({ shield: 0.1 * T(t) }), desc: (t) => `전투 시작 보호막 ${pct(0.1 * T(t))}%` },
    subPierce: { name: '철갑탄', slot: '보조', icon: 'Sub_ArmorPierce', mod: (t) => ({ pierce: true, atk: 1 + 0.04 * T(t) }), desc: (t) => `공격이 보호 무시, 공격력 +${pct(0.04 * T(t))}%` },
    subStim: { name: '전투 자극제', slot: '보조', icon: 'Sub_Stimulant', mod: (t) => ({ drain: 0.06 * T(t) }), desc: (t) => `준 피해의 ${pct(0.06 * T(t))}% 회복` },
    subSight: { name: '특수 조준경', slot: '보조', icon: 'Sub_SpSight', mod: (t) => ({ crit: 0.05 * T(t), atk: 1 + 0.05 * T(t) }), desc: (t) => `치명 +${pct(0.05 * T(t))}%, 공격력 +${pct(0.05 * T(t))}%` },
  };
  const KEYS = Object.keys(CATALOG);
  const TIER_NAME = { 1: '★1', 2: '★2', 3: '★3', 4: '★4', 5: '★5', 6: '★6', 7: '★7' };
  const ICON_T = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 };

  function merge(into, m) {
    for (const k in m) {
      if (k === 'eva' || k === 'crit' || k === 'shield' || k === 'mana' || k === 'drain' || k === 'range') into[k] = (into[k] || 0) + m[k];
      else if (k === 'pierce') into.pierce = into.pierce || m.pierce;
      else if (k === 'vs') { into.vs = into.vs || {}; for (const c in m.vs) into.vs[c] = (into.vs[c] || 1) * m.vs[c]; }
      else into[k] = (into[k] || 1) * m[k];
    }
    return into;
  }
  function mods(list) {
    const out = {};
    for (const it of list || []) { const c = CATALOG[it.key]; if (c) merge(out, c.mod(it.tier)); }
    return out;
  }
  const roll = (rand, tier) => ({ key: KEYS[Math.floor(rand() * KEYS.length)], tier: Math.max(1, Math.min(7, tier)) });
  const price = (tier) => 3 + 3 * (tier - 1);
  const icon = (it) => `assets/items/${CATALOG[it.key].icon}_T${ICON_T[it.tier] || 1}.webp`;
  const label = (it) => `${CATALOG[it.key].name} ★${it.tier}`;
  const describe = (it) => CATALOG[it.key].desc(it.tier);

  const api = { CATALOG, KEYS, mods, merge, roll, price, icon, label, describe, TIER_NAME };
  if (typeof module !== 'undefined') module.exports = api; else root.Items = api;
})(this);
