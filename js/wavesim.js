// Wave defence simulator (King God Castle style PvE): pure logic, deterministic for a seed.
//
//   const w = WaveSim.create({ lineup, wave, stage, seed, roster, enemies, animEv, clipMeta, synergy, baseHp });
//   const events = w.step(dt);   w.units (allies and enemies), w.baseHp, w.over, w.result ('clear' | 'fall')
//
// Field: allies stand on the original 3x3 formation (col 0 front .. 2 back, row = lane 0..2) at fixed x.
// Iron Bugs spawn on the right of a lane and walk left; they stop to fight when an ally in their lane blocks
// them or comes into their range. One that reaches the base line breaches: it damages the base and leaves.
// Attacks follow the SD clips (damage on the clip's hit frames), as in js/sim.js.
(function (root) {
  const ADV = { light: 'heavy', heavy: 'air', air: 'light' };
  const ADV_UP = 1.25, ADV_DOWN = 0.85, CRIT = 1.5;
  const MANA_MAX = 100, MANA_PER_ATTACK = 28, MANA_PER_HURT = 70;
  const GUARD = 0.5, MARK_UP = 1.25, MARK_T = 8, BUFF_ATK = 1.3, BUFF_SPD = 1.2, BUFF_T = 6;
  const SHIELD_K = 1.2, SHIELD_T = 8, PROTECT_T = 6, ARMOUR = 1.5, SPLASH = 0.6, GAP = 0.25;
  const STAR = { 1: 1, 2: 1.7, 3: 2.8, 4: 4.5, 5: 7, 6: 11, 7: 17 }; // hp / attack per star (2-copy merges, ★7 max)
  const MAX_HITS = 5;

  // field geometry (world units, shared with the renderer)
  const FIELD = {
    allyX: [-1.4, -3.3, -5.2], // formation columns: front, middle, back
    baseX: -7.4, // the base line
    spawnX: 9.6,
    cellW: 1.9, // one formation column; ranges are counted in these
    blockGap: 1.15, // an enemy stops this far in front of the ally blocking its lane
  };
  // ally reach: range counted in formation columns from the front line (like the original grid: a back-row unit
  // spends part of its range crossing its own formation). enemy reach: distance to the ally it attacks.
  const allyReach = (u, range) => FIELD.allyX[0] - u.x + range * FIELD.cellW + 0.3;
  const reach = (range) => FIELD.cellW * (range - 1) + 1.6;

  // enemy strength by kind; wave and stage scale it (tools/wave_test.js tunes these)
  const ENEMY = {
    normal: { hp: 5200, atk: 330, def: 60, breach: 1, rate: 1.4 },
    elite: { hp: 30000, atk: 380, def: 160, breach: 4, rate: 1.8 },
    boss: { hp: 80000, atk: 400, def: 220, breach: 10, rate: 2.2 },
  };
  const ROLE_K = { tank: { hp: 1.5, atk: 0.75, def: 1.6 }, attacker: { hp: 0.9, atk: 1.25, def: 0.8 }, support: { hp: 1.0, atk: 1.0, def: 1.0 } };
  // boss tricks (after the defence project's BOSSES: summon / shield / silence / regen). Stages 6-10 bring the same
  // bosses back "cruel": one extra trick and harsher numbers.
  const GIMMICK = {
    e_EmperorChick_N: { gim: ['summon'], cruel: ['regen'], tip: '체력 50%에서 부하를 소환합니다. 범위 공격으로 정리하세요' },
    e_Goltarion_N: { gim: ['shield'], cruel: ['summon'], tip: '체력 2/3 · 1/3에서 방어막을 펼칩니다(피해 80% 감소). 그 동안은 주변 철충부터' },
    e_Executioner_EW: { gim: ['silence'], cruel: ['shield'], tip: '주기적으로 가장 많이 공격한 대원을 봉인합니다. 화력을 여러 대원에 나누세요' },
    e_Nidhogg_N: { gim: ['regen'], cruel: ['silence'], tip: '공격이 끊기면 빠르게 재생합니다. 사거리가 긴 대원으로 쉬지 않고 몰아치세요' },
    e_IronPrince_N: { gim: ['summon', 'shield', 'silence'], cruel: ['regen'], tip: '최종 보스: 소환 · 방어막 · 봉인을 모두 사용합니다' },
  };
  const GIM_NAME = { summon: '소환', shield: '방어막', silence: '봉인', regen: '재생' };
  // trick numbers, plain and cruel (tools/stage_test.js tunes them against a deck with no upgrades)
  const GIM = {
    plain: { summonN: 6, summonAt: [0.5], shieldAt: [2 / 3, 1 / 3], shieldT: 4, shieldCut: 0.8, regenWait: 1.5, regenRate: 0.03, silFirst: 9, silEvery: 14, silDur: 5, silN: 1 },
    // cruel (chapters 4-8, some stages before): one extra trick, a second summon, a third shield. Softened 2026-10-26
    // from 8 summons / 6 s 90% shields / 5% regen after 1 s / 2 seals of 7 s every 9 s, which no deck without upgrades beat
    cruel: { summonN: 6, summonAt: [0.5, 0.2], shieldAt: [3 / 4, 1 / 2, 1 / 4], shieldT: 5, shieldCut: 0.85, regenWait: 1.3, regenRate: 0.035, silFirst: 8, silEvery: 12, silDur: 5, silN: 1 },
  };
  const gimOf = (u) => (u.cruel ? GIM.cruel : GIM.plain);
  const gimmicksOf = (rig, cruel) => {
    const g = GIMMICK[rig];
    if (!g) return [];
    return cruel ? [...new Set([...g.gim, ...g.cruel])] : g.gim.slice();
  };
  // g: the global stage index (chapter stages in a row); wave: 1.. within the stage
  // stage factor tuned with no upgrades at all (tools/stage_test.js "강화 없음": no research, levels or unlocks): +4.5% a
  // stage through chapter 2 (stage 16), then +0.4% a stage, so stage 64 is ~2.3x stage 1. A starting deck clears chapter 1
  // every time and the last chapter about 60% of the time (a simple bot; the final bosses ~20%); upgrades are the margin.
  // (The old +13% / +3% curve reached ~26x by stage 64: nothing past stage 12 could be cleared without upgrades.)
  const CURVE = { early: 1.045, cap: 16, late: 1.015, wave: 1.13, boss: 0.4 }; // exposed for tuning
  const stageK = (g) => Math.pow(CURVE.early, Math.min(g, CURVE.cap) - 1) * Math.pow(CURVE.late, Math.max(0, g - CURVE.cap));
  const growth = (g, wave) => Math.pow(CURVE.wave, wave - 1) * stageK(g);
  // a stage's plan (js/story.js); without one, the old 10-wave layout with a rotating boss
  function planOf(opts, enemies) {
    if (opts.plan) return opts.plan;
    const stage = opts.stage || 1;
    const bosses = Object.keys(enemies).filter((r) => enemies[r].kind === 'boss');
    return { g: 1 + (stage - 1) * 2, waves: 10, eliteWave: 5, final: bosses[(stage - 1) % bosses.length], cruel: stage > 5 };
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function pickHits(times, d) {
    let t = (times && times.length ? times : [d * 0.55]).filter((x) => x <= d);
    if (!t.length) t = [d * 0.55];
    if (t.length <= MAX_HITS) return t.slice();
    const out = [];
    for (let i = 0; i < MAX_HITS; i++) out.push(t[Math.round(i * (t.length - 1) / (MAX_HITS - 1))]);
    return out;
  }

  // the spawn list of a wave: [{ t, rig, row, captain }]
  function waveSpawns(plan, wave, enemies, rand) {
    const stage = plan.g;
    const by = { normal: [], elite: [], boss: [] };
    for (const [rig, e] of Object.entries(enemies)) by[e.kind].push(rig);
    const list = [];
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    // each stage draws from a rotating slice of the normal roster so stages feel different
    const pool = [];
    for (let i = 0; i < 5; i++) pool.push(by.normal[(stage * 3 + i) % by.normal.length]);
    const n = 5 + Math.floor(wave * 1.0);
    let t = 0.4;
    for (let i = 0; i < n; i++) { list.push({ t, rig: pick(pool), row: Math.floor(rand() * 3) }); t += 0.75 + rand() * 0.6; }
    if (wave === plan.eliteWave) list.push({ t: 2.5, rig: by.elite[(stage - 1) % by.elite.length], row: 1 });
    if (wave === plan.waves) { // the last wave: a stage captain (a tougher elite) or the stage's trick boss
      if (plan.final === 'elite') list.push({ t: 3, rig: by.elite[(stage + 2) % by.elite.length], row: 1, captain: true });
      else list.push({ t: 3, rig: plan.final, row: 1 });
    }
    return list.sort((a, b) => a.t - b.t);
  }

  function create(opts) {
    const { roster, enemies, animEv = {}, clipMeta = {} } = opts;
    const plan = planOf(opts, enemies);
    const stage = plan.g, wave = opts.wave || 1;
    const rand = rng(opts.seed == null ? 1 : opts.seed);
    const units = [];
    const events = [];
    let uidSeq = 0;
    const syn = opts.synergy || null;
    const ups = opts.upgrades || {}; // permanent bonuses: { atk, hp } multipliers, { [id]: level }

    // ---- allies ----
    const lineup = opts.lineup || [];
    const mods = syn ? syn.mods(lineup, roster) : {};
    const Items = opts.items || (typeof module !== 'undefined' ? require('./items.js') : root.Items);
    lineup.forEach(([id, col, row, star = 1, gear = []], i) => {
      const base = roster.BY_ID[id];
      const k = STAR[star] || 1, m = Object.assign({}, mods[i] || {});
      if (gear.length && Items) { const im = Items.mods(gear); if (syn) for (const key in im) { if (key === 'vs' || key === 'range') m[key] = im[key]; } Items.merge(m, Object.fromEntries(Object.entries(im).filter(([key]) => key !== 'vs' && key !== 'range'))); }
      const lv = (ups.levels && ups.levels[id]) || 1;
      const lvK = 1 + 0.06 * (lv - 1); // permanent unit level: +6% hp / attack per level
      const def = Object.assign({}, base, {
        hp: Math.round(base.hp * k * lvK * (m.hp || 1) * (ups.hp || 1)),
        atk: Math.round(base.atk * k * lvK * (m.atk || 1) * (ups.atk || 1)),
        def: Math.round(base.def * (m.def || 1)), aspd: base.aspd / (m.spd || 1),
        eva: Math.min(0.6, base.eva + (m.eva || 0)), crit: Math.min(1, base.crit + (m.crit || 0)),
        // gear: 저격형 OS adds range to both attacks
        basic: m.range ? Object.assign({}, base.basic, { range: base.basic.range + m.range }) : base.basic,
        skill: m.range ? Object.assign({}, base.skill, { range: base.skill.range + m.range }) : base.skill,
      });
      const u = newUnit({ id, rig: id, def, side: 0, col, row, star, x: FIELD.allyX[col], gear });
      u.vs = m.vs || null; // gear: more damage against a class
      u.pierceAll = !!m.pierce; u.drain = m.drain || 0; u.skillMul = m.skill || 1;
      if (m.shield) { u.shield = Math.round(u.maxHp * m.shield); u.shieldT = 15; }
      if (m.mana) u.mana = Math.min(MANA_MAX, m.mana);
      u.cd = 0.2 + rand() * 0.5;
    });

    function newUnit(o) {
      const u = Object.assign({
        uid: ++uidSeq, hp: o.def.hp, maxHp: o.def.hp, mana: 0, shield: 0, shieldT: 0,
        tauntT: 0, armourT: 0, protectT: 0, markT: 0, buffT: 0, alive: true, act: null, cd: 0,
        dealt: 0, taken: 0, pierceAll: false, drain: 0, skillMul: 1, moving: false, star: 1, sealedT: 0,
      }, o);
      units.push(u);
      return u;
    }

    // ---- enemies ----
    const spawns = waveSpawns(plan, wave, enemies, rand);
    let nextSpawn = 0;
    function spawnEnemy(s) {
      const e = enemies[s.rig];
      const kind = ENEMY[e.kind];
      const role = ['tank', 'attacker', 'support'][e.role] || 'attacker';
      // normals grow with the wave; an elite / boss always appears on the same wave, so it grows with the stage only
      // a boss grows with stageK ** CURVE.boss: its tricks (and the cruel ones from chapter 4) already make it the stage's
      // wall, so it climbs slower than the waves before it
      const sg = e.kind === 'normal' ? growth(stage, wave) : e.kind === 'boss' ? Math.pow(CURVE.wave, 3) * Math.pow(stageK(stage), CURVE.boss) : growth(stage, 4);
      const rk = ROLE_K[role], g = sg * (s.captain ? 1.6 : 1) * (plan.ngK || 1); // a captain: +60%; new game plus: ngK
      const s1 = e.s1 || { range: 1, grid: [0, 0, 0, 0, 1, 0, 0, 0, 0] };
      const def = {
        id: s.rig, name: e.name, cls: ['light', 'heavy', 'air'][e.type] || 'light', role, tier: 0,
        // a tank-role boss would be tanky twice over (role + shield trick): bosses keep at most +15% hp from their role
        hp: Math.round(kind.hp * (e.kind === 'boss' ? Math.min(rk.hp, 1.15) : rk.hp) * g), atk: Math.round(kind.atk * rk.atk * g), def: Math.round(kind.def * (e.kind === 'boss' ? Math.min(rk.def, 1.2) : rk.def)),
        aspd: clamp(2.3 * 4 / (e.spd || 4), 1.6, 3.2), crit: Math.max(0, e.cri || 0) / 100, eva: 0,
        basic: { rate: kind.rate, range: clamp(s1.range, 1, 3), grid: [0, 0, 0, 0, 1, 0, 0, 0, 0], pierce: false },
        // elites and bosses cast a lane-wide blast when their gauge fills
        skill: e.kind === 'normal' ? null : { kind: 'damage', rate: kind.rate * 1.6, range: 3, grid: [1, 1, 1, 1, 1, 1, 1, 1, 1], pierce: true, name: e.kind === 'boss' ? '섬멸 포격' : '강습' },
        speed: (e.kind === 'boss' ? 0.5 : e.kind === 'elite' ? 0.68 : 1.0) * (e.spd || 4) / 4,
        kind: e.kind, breach: kind.breach,
      };
      const u = newUnit({ id: s.rig, rig: s.rig, def, side: 1, col: -1, row: s.row, x: s.x != null ? s.x : FIELD.spawnX + rand() * 0.6, enemy: e.kind });
      u.cd = 0.3;
      if (s.captain) { u.captain = true; def.name = def.name + ' (대장)'; }
      if (e.kind === 'boss') {
        u.gim = gimmicksOf(s.rig, plan.cruel);
        u.cruel = !!plan.cruel;
        u.done = {}; u.quietT = 0; u.silT = gimOf(u).silFirst; u.barrierT = 0;
      }
      events.push({ t: w.time, type: 'spawn', uid: u.uid });
      return u;
    }

    const w = {
      units, time: 0, over: false, result: null, stage, wave, FIELD, step, timing,
      baseHp: opts.baseHp == null ? 20 : opts.baseHp, breached: 0, killed: 0, total: spawns.length,
      synergies: [syn ? syn.compute(lineup, roster) : [], []], // [allies, enemies] like BattleSim (bugs have none)
      kind: 'wave', waves: plan.waves, rigs: [...new Set(spawns.map((x) => x.rig))], // the enemy rigs this wave needs (renderer preloads them)
      remaining: () => spawns.length - nextSpawn + units.filter((u) => u.side === 1 && u.alive).length,
    };

    function timing(id, kind) {
      const ev = animEv[id] || {};
      const meta = clipMeta[id] || {};
      let clip = kind;
      if (!meta[clip] && !ev[clip]) clip = 'atk';
      const e = ev[clip];
      const d = meta[clip] || (e && e.d) || 2;
      return { clip, d, hits: pickHits(e && e.t, d), mv: e && e.mv && e.mv.length >= 4 ? e.mv.slice(0, 4) : null };
    }
    const alive = (side) => units.filter((u) => u.alive && u.side === side);
    const byUid = (uid) => units.find((x) => x.uid === uid);
    const dist = (a, b) => Math.abs(a.x - b.x);

    // ally target: enemies within reach (and not behind the ally), same lane first, then nearest
    function allyTarget(u, sk) {
      const r = allyReach(u, sk.range);
      const foes = alive(1).filter((e) => e.x - u.x <= r && e.x > u.x - 0.8);
      if (!foes.length) return null;
      const taunt = foes.filter((e) => e.tauntT > 0);
      const pool = taunt.length ? taunt : foes;
      let best = null, bk = 1e9;
      for (const e of pool) {
        const k = Math.abs(e.row - u.row) * 4 + (e.x - u.x) - (sk.pierce && e.enemy !== 'normal' ? 3 : 0);
        if (k < bk) { bk = k; best = e; }
      }
      return best;
    }
    // enemy target: the frontmost ally of its lane within reach, else an adjacent lane's for ranged bugs
    function enemyTarget(u) {
      const r = reach(u.def.basic.range);
      const allies = alive(0).filter((a) => u.x - a.x <= r && u.x - a.x > -0.5);
      if (!allies.length) return null;
      let best = null, bk = 1e9;
      for (const a of allies) {
        const lane = Math.abs(a.row - u.row);
        if (lane > (u.def.basic.range >= 3 ? 1 : 0)) continue;
        const k = lane * 6 + (u.x - a.x);
        if (k < bk) { bk = k; best = a; }
      }
      return best;
    }
    function blockerX(u) { // the x where this enemy must stop (the front ally of its lane), or the base line
      const lane = alive(0).filter((a) => a.row === u.row);
      if (!lane.length) return null;
      return Math.max(...lane.map((a) => a.x)) + FIELD.blockGap;
    }

    // a skill's 3x3 area around the target, laid on lanes (rows) and formation-width steps along x
    function areaTargets(u, tgt, sk) {
      const foes = alive(1 - u.side);
      if (!tgt) return [];
      const g = sk.grid || [0, 0, 0, 0, 1, 0, 0, 0, 0];
      const dir = u.side === 0 ? 1 : -1; // +1 column = further from the attacker
      return foes.filter((f) => {
        const dr = f.row - tgt.row, dc = Math.round(((f.x - tgt.x) * dir) / FIELD.cellW);
        return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && g[(dr + 1) * 3 + (dc + 1)];
      });
    }

    // 보호: a protecting ally covers all; a tank covers allies standing behind it in its lane
    function guardOf(dst) {
      if (dst.side !== 0) return null;
      const p = units.find((g) => g.alive && g.side === 0 && g !== dst && g.protectT > 0);
      if (p) return p;
      if (dst.col === 0) return null;
      return units.find((g) => g.alive && g.side === 0 && g.row === dst.row && g.col < dst.col && g.def.role === 'tank') || null;
    }

    function damage(src, dst, mult, kind, pierce, guarded) {
      if (!dst.alive) return 0;
      pierce = pierce || src.pierceAll;
      if (!pierce && !guarded) {
        const g = guardOf(dst);
        if (g) {
          events.push({ t: w.time, type: 'guard', guard: g.uid, dst: dst.uid });
          damage(src, g, mult * GUARD, kind, pierce, true);
          return damage(src, dst, mult * (1 - GUARD), kind, pierce, true);
        }
      }
      if (rand() < (dst.def.eva || 0)) { events.push({ t: w.time, type: 'miss', src: src.uid, dst: dst.uid }); return 0; }
      let m = mult, adv = 0;
      if (ADV[src.def.cls] === dst.def.cls) { m *= ADV_UP; adv = 1; } else if (ADV[dst.def.cls] === src.def.cls) { m *= ADV_DOWN; adv = -1; }
      if (src.buffT > 0) m *= BUFF_ATK;
      if (src.vs && src.vs[dst.def.cls]) m *= src.vs[dst.def.cls];
      if (dst.markT > 0) m *= MARK_UP;
      if (kind === 'skill') m *= src.skillMul;
      const crit = rand() < (src.def.crit || 0);
      if (crit) m *= CRIT;
      if (dst.barrierT > 0) m *= 1 - gimOf(dst).shieldCut; // boss shield
      if (dst.gim) { dst.quietT = 0; dst.regenOn = false; } // regen waits for a lull
      const dv = dst.def.def * (dst.armourT > 0 ? ARMOUR : 1);
      const amount = Math.max(1, Math.round(src.def.atk * m * 300 / (300 + dv)));
      let absorbed = 0;
      if (dst.shield > 0) { absorbed = Math.min(dst.shield, amount); dst.shield -= absorbed; }
      const hpLoss = amount - absorbed;
      dst.hp = Math.max(0, dst.hp - hpLoss);
      src.dealt += amount; dst.taken += amount;
      dst.mana = Math.min(MANA_MAX, dst.mana + MANA_PER_HURT * hpLoss / dst.maxHp);
      events.push({ t: w.time, type: 'hit', src: src.uid, dst: dst.uid, amount, absorbed, crit, adv, kind });
      if (src.drain > 0 && src.alive && hpLoss > 0) {
        const v = Math.min(src.maxHp - src.hp, Math.round(hpLoss * src.drain));
        if (v > 0) { src.hp += v; events.push({ t: w.time, type: 'heal', src: src.uid, dst: src.uid, amount: v }); }
      }
      if (dst.hp <= 0) kill(dst, src);
      else if (dst.gim) hpTricks(dst);
      return amount;
    }

    // ---- boss tricks ----
    function gimmick(u, kind, text) { events.push({ t: w.time, type: 'gimmick', uid: u.uid, kind, text }); }
    function hpTricks(e) {
      const f = e.hp / e.maxHp;
      if (e.gim.includes('summon')) {
        const G = gimOf(e), k = G.summonAt.findIndex((th, i) => !e.done['summon' + i] && f <= th);
        if (k >= 0) {
          e.done['summon' + k] = 1;
          const n = G.summonN;
          const pool = Object.keys(enemies).filter((r) => enemies[r].kind === 'normal');
          for (let k = 0; k < n; k++) {
            const m = spawnEnemy({ rig: pool[(stage * 3 + k) % pool.length], row: k % 3, x: e.x + 0.8 + (k / 3 | 0) * 0.9 });
            m.minion = true;
            w.total++;
          }
          gimmick(e, 'summon', `부하 ${n}기 소환!`);
        }
      }
      if (e.gim.includes('shield')) {
        const G = gimOf(e);
        G.shieldAt.forEach((th, k) => {
          if (!e.done['s' + k] && f <= th) {
            e.done['s' + k] = 1;
            e.barrierT = G.shieldT;
            gimmick(e, 'shield', `방어막 전개! ${e.barrierT}초간 피해 ${Math.round(G.shieldCut * 100)}% 감소`);
          }
        });
      }
    }
    // per step: regenerate after a lull, seal the ally that dealt the most damage
    function bossTricks(e, dt) {
      if (e.barrierT > 0) e.barrierT -= dt;
      e.quietT += dt;
      const G = gimOf(e);
      if (e.gim.includes('regen') && e.quietT > G.regenWait && e.hp < e.maxHp) {
        if (!e.regenOn) { e.regenOn = true; gimmick(e, 'regen', `재생 시작! 초당 ${Math.round(G.regenRate * 100)}%`); }
        const v = e.maxHp * G.regenRate * dt;
        e.hp = Math.min(e.maxHp, e.hp + v);
        e.regenAcc = (e.regenAcc || 0) + v;
        if (e.regenAcc >= e.maxHp * 0.02) { events.push({ t: w.time, type: 'heal', src: e.uid, dst: e.uid, amount: Math.round(e.regenAcc) }); e.regenAcc = 0; }
      }
      if (e.gim.includes('silence')) {
        e.silT -= dt;
        if (e.silT <= 0) {
          e.silT = G.silEvery;
          const dur = G.silDur;
          const order = alive(0).filter((a) => !(a.sealedT > 0)).sort((a, b) => b.dealt - a.dealt);
          for (const a of order.slice(0, G.silN)) {
            a.sealedT = dur; a.act = null;
            events.push({ t: w.time, type: 'seal', src: e.uid, dst: a.uid, dur });
          }
          if (order.length) gimmick(e, 'silence', `${order[0].def.name}${G.silN > 1 && order[1] ? ` 외 ${Math.min(G.silN, order.length) - 1}명` : ''} 봉인! (${dur}초)`);
        }
      }
    }

    function kill(u) {
      u.alive = false; u.act = null; u.shield = 0;
      if (u.side === 1) w.killed++;
      events.push({ t: w.time, type: 'die', uid: u.uid, enemy: u.enemy || null });
    }

    const SELF_KINDS = { buff: 1, shield: 1, protect: 1, taunt: 1 };
    function startAction(u) {
      const sk = u.def.skill;
      let skill = !!sk && u.mana >= MANA_MAX;
      const pickT = (s) => (u.side === 0 ? allyTarget(u, s) : enemyTarget(u));
      let target = null;
      if (skill && !SELF_KINDS[sk.kind]) { target = pickT(sk); if (!target) skill = false; }
      if (!skill) { target = pickT(u.def.basic); if (!target) return false; }
      const tm = timing(u.rig, skill ? 'skill' : 'atk');
      const spd = u.buffT > 0 ? BUFF_SPD : 1;
      const rate = (skill ? clamp(tm.d / Math.min(4, u.def.aspd * 1.6), 0.9, 4.5) : clamp(tm.d / u.def.aspd, 0.7, 5)) * spd;
      if (skill) u.mana = 0;
      u.act = { skill, clip: tm.clip, rate, dur: tm.d / rate, t: 0, hits: tm.hits.map((h) => h / rate), next: 0, target: target ? target.uid : 0, mv: tm.mv ? tm.mv.map((x) => x / rate) : null };
      if (u.moving) { u.moving = false; events.push({ t: w.time, type: 'stop', uid: u.uid }); }
      events.push({ t: w.time, type: 'action', uid: u.uid, skill, skillName: skill ? sk.name : '', kind: skill ? sk.kind : 'basic', clip: tm.clip, rate, dur: u.act.dur, target: u.act.target, mv: u.act.mv });
      return true;
    }

    function applyHit(u, a) {
      const share = 1 / a.hits.length;
      const sk = a.skill ? u.def.skill : u.def.basic;
      const kind = a.skill ? sk.kind : 'damage';
      const first = a.next === 0;
      if (kind === 'damage' || kind === 'mark') {
        let tgt = byUid(a.target);
        if (!tgt || !tgt.alive) { tgt = u.side === 0 ? allyTarget(u, sk) : enemyTarget(u); if (!tgt) return; a.target = tgt.uid; }
        for (const f of areaTargets(u, tgt, sk)) {
          if (kind === 'mark' && first) { f.markT = MARK_T; events.push({ t: w.time, type: 'mark', src: u.uid, dst: f.uid }); }
          const main = f === tgt;
          damage(u, f, sk.rate * share * (main ? 1 : SPLASH), a.skill ? 'skill' : (main ? 'atk' : 'splash'), sk.pierce, false);
        }
        return;
      }
      if (!first) return;
      const team = alive(u.side);
      if (kind === 'buff') for (const f of team) { f.buffT = BUFF_T; events.push({ t: w.time, type: 'buff', src: u.uid, dst: f.uid }); }
      if (kind === 'shield') for (const f of team) { const v = Math.round(u.def.atk * SHIELD_K); f.shield += v; f.shieldT = SHIELD_T; events.push({ t: w.time, type: 'shield', src: u.uid, dst: f.uid, amount: v }); }
      if (kind === 'protect') { u.protectT = PROTECT_T; u.armourT = PROTECT_T; events.push({ t: w.time, type: 'protect', src: u.uid, dst: u.uid }); }
      if (kind === 'taunt') { u.tauntT = PROTECT_T; u.armourT = PROTECT_T; events.push({ t: w.time, type: 'protect', src: u.uid, dst: u.uid, taunt: true }); }
    }

    function finish(result) {
      w.over = true; w.result = result;
      for (const u of units) u.act = null;
      events.push({ t: w.time, type: 'end', result, baseHp: w.baseHp });
    }

    function step(dt) {
      events.length = 0;
      if (w.over) return events;
      w.time += dt;
      while (nextSpawn < spawns.length && spawns[nextSpawn].t <= w.time) spawnEnemy(spawns[nextSpawn++]);
      for (const u of units) {
        if (!u.alive) continue;
        for (const k of ['tauntT', 'armourT', 'protectT', 'markT', 'buffT']) if (u[k] > 0) u[k] -= dt;
        if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
        if (u.gim) bossTricks(u, dt);
        if (u.sealedT > 0) { u.sealedT -= dt; if (u.sealedT <= 0) events.push({ t: w.time, type: 'unseal', uid: u.uid }); continue; } // 봉인: no actions
        const a = u.act;
        if (a) {
          a.t += dt;
          while (a.next < a.hits.length && a.t >= a.hits[a.next] && u.alive) { applyHit(u, a); a.next++; }
          if (u.act && a.t >= a.dur) { if (!a.skill) u.mana = Math.min(MANA_MAX, u.mana + MANA_PER_ATTACK); u.act = null; u.cd = GAP; }
          continue;
        }
        u.cd -= dt;
        if (u.cd > 0) continue;
        if (startAction(u)) continue;
        if (u.side === 1) { // nothing to hit: walk on (blocked by the lane's front ally, or to the base)
          const stopX = blockerX(u);
          if (stopX != null && u.x <= stopX) { if (u.moving) { u.moving = false; events.push({ t: w.time, type: 'stop', uid: u.uid }); } continue; }
          if (!u.moving) { u.moving = true; events.push({ t: w.time, type: 'walk', uid: u.uid }); }
          u.x -= u.def.speed * dt;
          if (stopX != null) u.x = Math.max(u.x, stopX);
          if (u.x <= FIELD.baseX) { // breach
            u.alive = false; u.moving = false;
            w.baseHp = Math.max(0, w.baseHp - u.def.breach); w.breached++;
            events.push({ t: w.time, type: 'breach', uid: u.uid, amount: u.def.breach, baseHp: w.baseHp });
          }
        }
      }
      if (w.baseHp <= 0) { finish('fall'); return events.slice(); }
      if (nextSpawn >= spawns.length && !alive(1).length) finish('clear');
      else if (!alive(0).length && nextSpawn >= spawns.length && alive(1).every((e) => e.moving || e.x <= FIELD.baseX)) { /* bugs walk to the base */ }
      if (w.time > 240) finish(w.baseHp > 0 ? 'clear' : 'fall'); // safety net
      return events.slice();
    }

    return w;
  }

  // the boss of a stage, its tricks and a hint (lobby / prep previews)
  function bossInfo(plan, enemies) {
    if (typeof plan === 'number') plan = planOf({ stage: plan }, enemies);
    if (plan.final === 'elite') return null;
    const rig = plan.final;
    const gim = gimmicksOf(rig, plan.cruel);
    return { rig, name: enemies[rig].name, gim, gimNames: gim.map((g) => GIM_NAME[g]), tip: (GIMMICK[rig] || {}).tip || '', cruel: !!plan.cruel };
  }
  const api = { create, STAR, FIELD, ENEMY, CURVE, GIM, stageK, waveSpawns, reach, bossInfo, GIM_NAME, MANA_MAX, WAVES: 10 };
  if (typeof module !== 'undefined') module.exports = api; else root.WaveSim = api;
})(this);
