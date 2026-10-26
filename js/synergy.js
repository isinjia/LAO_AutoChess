// Synergies: class (경장 / 기동 / 중장) and original squad (부대). Pure, node-compatible.
//
//   Synergy.compute(lineup, roster) -> [{ key, kind, name, count, steps, level, active, desc, members }]
//   Synergy.mods(lineup, roster)    -> { [index in lineup]: mods }  (what each unit gets)
//
// Counting is by distinct units (two copies of the same unit count once), like most autobattlers.
// mods: atk / def / hp / spd (action speed) multipliers, eva / crit additive chances,
//       shield (share of max hp at battle start), mana (start), pierce (ignore guard), drain (heal share of damage),
//       skill (skill damage multiplier)
(function (root) {
  const CLASS = {
    light: { name: '경장', steps: [2, 4, 6], desc: ['경장 행동 속도 +10%', '경장 행동 속도 +22%', '경장 행동 속도 +35%'], mod: [{ spd: 1.1 }, { spd: 1.22 }, { spd: 1.35 }] },
    heavy: { name: '중장', steps: [2, 4, 6], desc: ['중장 방어력 +30%', '중장 방어력 +70%', '중장 방어력 +120%'], mod: [{ def: 1.3 }, { def: 1.7 }, { def: 2.2 }] },
    air: { name: '기동', steps: [2, 4, 6], desc: ['기동 회피 +8%', '기동 회피 +15%, 치명 +10%', '기동 회피 +22%, 치명 +20%'], mod: [{ eva: 0.08 }, { eva: 0.15, crit: 0.1 }, { eva: 0.22, crit: 0.2 }] },
  };

  // original squads with at least two units that have SD rigs. Effects follow each squad's setting.
  // team: true = every ally gets it (a leading squad), otherwise only that squad's members
  const SQUAD = {
    SteelLine: { steps: [2, 3], desc: ['부대원 방어력 +40% (방어전의 스틸 라인)', '부대원 방어력 +80%, 전투 시작 보호막 15%'], mod: [{ def: 1.4 }, { def: 1.8, shield: 0.15 }] },
    Walhalla: { steps: [2, 3], desc: ['부대원 공격력 +15%', '부대원 공격력 +30%'], mod: [{ atk: 1.15 }, { atk: 1.3 }] },
    SkyKnight: { steps: [2, 3], desc: ['부대원 행동 속도 +15%', '부대원 행동 속도 +30%'], mod: [{ spd: 1.15 }, { spd: 1.3 }] },
    Kouhei: { steps: [2, 3], desc: ['부대원 전투 시작 보호막 20%', '부대원 전투 시작 보호막 35%'], mod: [{ shield: 0.2 }, { shield: 0.35 }] },
    Strikers: { steps: [2, 3], desc: ['부대원 치명 +10%', '부대원 치명 +18%, 스킬 피해 +10%'], mod: [{ crit: 0.1 }, { crit: 0.18, skill: 1.1 }] },
    DoomBringer: { steps: [2], desc: ['부대원 공격이 보호 무시'], mod: [{ pierce: true }] },
    Horizon: { steps: [2], desc: ['부대원 마나 50으로 시작'], mod: [{ mana: 50 }] },
    Bermuda: { steps: [2], desc: ['부대원 준 피해의 15% 회복'], mod: [{ drain: 0.15 }] },
    BattleMaid: { steps: [2], team: true, desc: ['아군 전원 공격력 +10% (오르카의 지휘)'], mod: [{ atk: 1.1 }] },
    '3PFairy': { steps: [2], desc: ['부대원 회피 +15%'], mod: [{ eva: 0.15 }] },
    PublicServant: { steps: [2], desc: ['부대원 체력 +25%'], mod: [{ hp: 1.25 }] },
    Bismarck: { steps: [2], desc: ['부대원 스킬 피해 +30%'], mod: [{ skill: 1.3 }] },
  };

  function merge(into, m) {
    for (const k in m) {
      if (k === 'eva' || k === 'crit' || k === 'shield' || k === 'mana' || k === 'drain') into[k] = (into[k] || 0) + m[k];
      else if (k === 'pierce') into.pierce = into.pierce || m.pierce;
      else into[k] = (into[k] || 1) * m[k];
    }
    return into;
  }

  function compute(lineup, roster) {
    const ids = [...new Set(lineup.map((x) => x[0]))];
    const out = [];
    for (const [cls, c] of Object.entries(CLASS)) {
      const members = ids.filter((id) => roster.BY_ID[id].cls === cls);
      const level = c.steps.filter((s) => members.length >= s).length; // 0 = inactive
      out.push({ key: 'c:' + cls, kind: 'class', id: cls, name: c.name, count: members.length, steps: c.steps, level, active: level > 0, desc: c.desc, members });
    }
    for (const [sq, d] of Object.entries(SQUAD)) {
      const members = ids.filter((id) => roster.BY_ID[id].squad === sq);
      if (!members.length) continue;
      const level = d.steps.filter((s) => members.length >= s).length;
      const name = roster.BY_ID[members[0]].squadName || sq;
      out.push({ key: 's:' + sq, kind: 'squad', id: sq, name, count: members.length, steps: d.steps, level, active: level > 0, desc: d.desc, members, team: !!d.team });
    }
    // active first, then by how close the next step is
    out.sort((a, b) => b.level - a.level || b.count / b.steps[0] - a.count / a.steps[0] || a.kind.localeCompare(b.kind));
    return out;
  }

  function mods(lineup, roster) {
    const syn = compute(lineup, roster).filter((s) => s.active);
    const res = {};
    lineup.forEach(([id], i) => {
      const d = roster.BY_ID[id];
      const m = {};
      for (const s of syn) {
        const def = s.kind === 'class' ? CLASS[s.id] : SQUAD[s.id];
        const mine = s.kind === 'class' ? d.cls === s.id : (s.team || d.squad === s.id);
        if (mine) merge(m, def.mod[s.level - 1]);
      }
      res[i] = m;
    });
    return res;
  }

  // squads a unit belongs to that have a synergy at all (for cards)
  const hasSquad = (sq) => !!SQUAD[sq];

  const api = { compute, mods, hasSquad, CLASS, SQUAD };
  if (typeof module !== 'undefined') module.exports = api; else root.Synergy = api;
})(this);
