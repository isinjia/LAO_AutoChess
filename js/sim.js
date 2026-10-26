// Autobattler battle simulator: pure logic, no rendering, deterministic for a given seed.
//
//   const b = BattleSim.create({ left, right, seed, roster, animEv, clipMeta });
//   const events = b.step(dt);   // advance; returns what happened (the renderer plays it)
//   b.units, b.time, b.over, b.winner
//
// left / right: [[unitId, col, row], ...]   col 0 = front, 1 = back; row 0..2
// Attacks follow the SD clips: an action lasts as long as its clip (sped up to the unit's aspd)
// and damage lands on the clip's own hit frames (js/anim_events.js), so what you see is what is computed.
// Unit numbers, ranges, areas and "보호 무시" come from the original game data (js/roster.js).
(function (root) {
  const ADV = { light: 'heavy', heavy: 'air', air: 'light' }; // key beats value
  const ADV_UP = 1.25, ADV_DOWN = 0.85, CRIT = 1.5;
  const MANA_MAX = 100, MANA_PER_ATTACK = 28, MANA_PER_HURT = 70, MANA_WAIT = 12; // hurt: share of max hp -> mana; wait: per s out of range
  const GUARD = 0.5; // share a guarding tank takes
  const MARK_UP = 1.25, MARK_T = 8; // mark: damage taken
  const BUFF_ATK = 1.3, BUFF_SPD = 1.2, BUFF_T = 6;
  const SPLASH = 0.6; // area attacks: units other than the chosen target take this share (6 units make full-grid skills very strong)
  const SHIELD_K = 1.2, SHIELD_T = 8;
  const PROTECT_T = 6, ARMOUR = 1.5;
  const GAP = 0.25; // pause between two actions (s)
  const TIME_LIMIT = 90;
  const STAR = { 1: 1, 2: 1.7, 3: 2.8, 4: 4.5, 5: 7, 6: 11, 7: 17 }; // hp / attack per star (2-copy merges, ★7 max)
  const MAX_HITS = 5; // clips with dozens of hit frames: damage is grouped into at most this many numbers

  function rng(seed) { // mulberry32
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

  function create(opts) {
    const { roster, animEv = {}, clipMeta = {} } = opts;
    const defK = (roster.BAL && roster.BAL.defK) || 300;
    const rand = rng(opts.seed == null ? 1 : opts.seed);
    const units = [];
    const events = [];
    let uidSeq = 0;

    const syn = opts.synergy || null; // js/synergy.js: class / squad bonuses
    function addSide(list, side) {
      const mods = syn ? syn.mods(list, roster) : {};
      list.forEach(([id, col, row, star = 1], i) => {
        const base = roster.BY_ID[id];
        if (!base) throw new Error('unknown unit ' + id);
        const k = STAR[star] || 1; // merged copies: hp and attack scale with the star
        const m = mods[i] || {};
        const def = Object.assign({}, base, {
          hp: Math.round(base.hp * k * (m.hp || 1)), atk: Math.round(base.atk * k * (m.atk || 1)),
          def: Math.round(base.def * (m.def || 1)), aspd: base.aspd / (m.spd || 1),
          eva: Math.min(0.6, base.eva + (m.eva || 0)), crit: Math.min(1, base.crit + (m.crit || 0)),
        });
        units.push({
          uid: ++uidSeq, id, def, side, col, row, star,
          hp: def.hp, maxHp: def.hp, mana: 0, shield: 0, shieldT: 0,
          tauntT: 0, armourT: 0, protectT: 0, markT: 0, buffT: 0,
          alive: true, act: null, waiting: false,
          cd: 0.3 + rand() * 0.6, // staggered opening
          dealt: 0, taken: 0, guarded: 0,
          pierceAll: !!m.pierce, drain: m.drain || 0, skillMul: m.skill || 1,
        });
        const u = units[units.length - 1];
        if (m.shield) { u.shield = Math.round(u.maxHp * m.shield); u.shieldT = 15; }
        if (m.mana) u.mana = Math.min(MANA_MAX, m.mana);
      });
    }
    addSide(opts.left, 0);
    addSide(opts.right, 1);
    const synergies = syn ? [syn.compute(opts.left, roster), syn.compute(opts.right, roster)] : [[], []];

    const b = { units, time: 0, over: false, winner: -1, step, timing, inRange, TIME_LIMIT, synergies };

    // clip timing for a unit: { clip, d (clip seconds), hits [clip seconds], mv [clip seconds] | null }
    function timing(id, kind) {
      const ev = animEv[id] || {};
      const meta = clipMeta[id] || {};
      let clip = kind;
      if (!meta[clip] && !ev[clip]) clip = 'atk';
      const e = ev[clip];
      const d = (meta[clip] || (e && e.d) || 2);
      return { clip, d, hits: pickHits(e && e.t, d), mv: e && e.mv && e.mv.length >= 4 ? e.mv.slice(0, 4) : null };
    }

    const alive = (side) => units.filter((u) => u.alive && u.side === side);
    const byUid = (uid) => units.find((x) => x.uid === uid);
    function inRange(u, f, range) { return u.col + f.col + 1 <= range; }

    // target for an attack with this range; null when nothing is in reach
    function chooseTarget(u, sk) {
      const foes = alive(1 - u.side).filter((f) => inRange(u, f, sk.range));
      if (!foes.length) return null;
      const taunt = foes.filter((f) => f.tauntT > 0);
      let pool = taunt.length ? taunt : null;
      if (!pool) {
        const want = sk.pierce ? 1 : 0; // guard-piercing attacks go for the back row, the rest for the front
        pool = foes.filter((f) => f.col === want);
        if (!pool.length) pool = foes;
      }
      // same row first, then the nearest row (ties: the upper row)
      let best = null, bk = 1e9;
      for (const f of pool) {
        const k = Math.abs(f.row - u.row) * 10 + f.row + f.col * 0.5;
        if (k < bk) { bk = k; best = f; }
      }
      return best;
    }

    // the original 3x3 area around the target (col offset +1 = one further back), or fixed cells of the grid
    function areaTargets(u, tgt, sk) {
      const g = sk.grid || [0, 0, 0, 0, 1, 0, 0, 0, 0];
      const foes = alive(1 - u.side);
      if (sk.fixed) {
        // our front column = the original column 0, our back column = columns 1 and 2
        return foes.filter((f) => (f.col === 0 ? g[f.row * 3] : g[f.row * 3 + 1] || g[f.row * 3 + 2]));
      }
      if (!tgt) return [];
      return foes.filter((f) => {
        const dr = f.row - tgt.row, dc = f.col - tgt.col;
        return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && g[(dr + 1) * 3 + (dc + 1)];
      });
    }

    // 보호: a protecting unit (protect skill) covers everyone on its side; otherwise a living tank in the
    // front cell of the same row covers a back-row ally
    function guardOf(dst) {
      const p = units.find((g) => g.alive && g.side === dst.side && g !== dst && g.protectT > 0);
      if (p) return p;
      if (dst.col !== 1) return null;
      return units.find((g) => g.alive && g.side === dst.side && g.col === 0 && g.row === dst.row && g.def.role === 'tank') || null;
    }

    function damage(src, dst, mult, kind, pierce, guarded) {
      if (!dst.alive) return 0;
      pierce = pierce || src.pierceAll;
      if (!pierce && !guarded) {
        const g = guardOf(dst);
        if (g) {
          events.push({ t: b.time, type: 'guard', guard: g.uid, dst: dst.uid });
          damage(src, g, mult * GUARD, kind, pierce, true);
          g.guarded++;
          return damage(src, dst, mult * (1 - GUARD), kind, pierce, true);
        }
      }
      if (rand() < dst.def.eva) {
        events.push({ t: b.time, type: 'miss', src: src.uid, dst: dst.uid });
        return 0;
      }
      let m = mult;
      let adv = 0;
      if (ADV[src.def.cls] === dst.def.cls) { m *= ADV_UP; adv = 1; } else if (ADV[dst.def.cls] === src.def.cls) { m *= ADV_DOWN; adv = -1; }
      if (src.buffT > 0) m *= BUFF_ATK;
      if (kind === 'skill') m *= src.skillMul;
      if (dst.markT > 0) m *= MARK_UP;
      const crit = rand() < src.def.crit;
      if (crit) m *= CRIT;
      const def = dst.def.def * (dst.armourT > 0 ? ARMOUR : 1);
      const amount = Math.max(1, Math.round(src.def.atk * m * defK / (defK + def)));
      let absorbed = 0;
      if (dst.shield > 0) { absorbed = Math.min(dst.shield, amount); dst.shield -= absorbed; }
      const hpLoss = amount - absorbed;
      dst.hp = Math.max(0, dst.hp - hpLoss);
      src.dealt += amount; dst.taken += amount;
      dst.mana = Math.min(MANA_MAX, dst.mana + MANA_PER_HURT * hpLoss / dst.maxHp);
      events.push({ t: b.time, type: 'hit', src: src.uid, dst: dst.uid, amount, absorbed, crit, adv, kind });
      if (src.drain > 0 && src.alive && hpLoss > 0) { // 버뮤다: heal a share of the damage dealt
        const v = Math.min(src.maxHp - src.hp, Math.round(hpLoss * src.drain));
        if (v > 0) { src.hp += v; events.push({ t: b.time, type: 'heal', src: src.uid, dst: src.uid, amount: v }); }
      }
      if (dst.hp <= 0) kill(dst);
      return amount;
    }

    function kill(u) {
      u.alive = false; u.act = null; u.shield = 0;
      events.push({ t: b.time, type: 'die', uid: u.uid });
    }

    const SELF_KINDS = { buff: 1, shield: 1, protect: 1, taunt: 1 };

    function startAction(u) {
      let skill = u.mana >= MANA_MAX;
      const sk = u.def.skill;
      let target = null;
      if (skill && !SELF_KINDS[sk.kind]) {
        target = chooseTarget(u, sk);
        if (!target && !sk.fixed) skill = false; // skill out of reach: try a basic attack instead
      }
      if (!skill) {
        target = chooseTarget(u, u.def.basic);
        if (!target) { // nothing in reach: wait (and build mana) until something comes into range
          if (!u.waiting) { u.waiting = true; events.push({ t: b.time, type: 'wait', uid: u.uid }); }
          return false;
        }
      }
      u.waiting = false;
      const tm = timing(u.id, skill ? 'skill' : 'atk');
      const spd = u.buffT > 0 ? BUFF_SPD : 1;
      // atk: the clip is stretched to the unit's attack time; skills play a bit slower than attacks, capped at ~4 s
      const rate = skill ? clamp(tm.d / Math.min(4, u.def.aspd * 1.6), 0.9, 3.5) * spd : clamp(tm.d / u.def.aspd, 0.7, 3.8) * spd;
      const dur = tm.d / rate;
      if (skill) u.mana = 0;
      u.act = {
        skill, clip: tm.clip, rate, dur, t: 0,
        hits: tm.hits.map((h) => h / rate), next: 0,
        target: target ? target.uid : 0,
        mv: tm.mv ? tm.mv.map((x) => x / rate) : null,
      };
      events.push({ t: b.time, type: 'action', uid: u.uid, skill, skillName: skill ? sk.name : '', kind: skill ? sk.kind : 'basic', clip: tm.clip, rate, dur, target: u.act.target, mv: u.act.mv });
      return true;
    }

    // one hit frame of an action; damage is split evenly over the frames
    function applyHit(u, a) {
      const share = 1 / a.hits.length;
      const sk = a.skill ? u.def.skill : u.def.basic;
      const kind = a.skill ? sk.kind : 'damage';
      const first = a.next === 0;
      if (kind === 'damage' || kind === 'mark') {
        let tgt = byUid(a.target);
        if (!sk.fixed && (!tgt || !tgt.alive)) { tgt = chooseTarget(u, sk); if (!tgt) return; a.target = tgt.uid; }
        const hit = areaTargets(u, tgt, sk);
        for (const f of hit) {
          if (kind === 'mark' && first) { f.markT = MARK_T; events.push({ t: b.time, type: 'mark', src: u.uid, dst: f.uid }); }
          const main = f === tgt || (sk.fixed && hit.length === 1);
          damage(u, f, sk.rate * share * (main ? 1 : SPLASH), a.skill ? 'skill' : (main ? 'atk' : 'splash'), sk.pierce, false);
        }
        return;
      }
      if (!first) return; // team / self effects land once, on the first hit frame
      const team = alive(u.side);
      if (kind === 'buff') for (const f of team) { f.buffT = BUFF_T; events.push({ t: b.time, type: 'buff', src: u.uid, dst: f.uid }); }
      if (kind === 'shield') for (const f of team) { const v = Math.round(u.def.atk * SHIELD_K); f.shield += v; f.shieldT = SHIELD_T; events.push({ t: b.time, type: 'shield', src: u.uid, dst: f.uid, amount: v }); }
      if (kind === 'protect') { u.protectT = PROTECT_T; u.armourT = PROTECT_T; events.push({ t: b.time, type: 'protect', src: u.uid, dst: u.uid }); }
      if (kind === 'taunt') { u.tauntT = PROTECT_T; u.armourT = PROTECT_T; events.push({ t: b.time, type: 'protect', src: u.uid, dst: u.uid, taunt: true }); }
    }

    function finish(winner, reason) {
      b.over = true; b.winner = winner;
      for (const u of units) u.act = null;
      events.push({ t: b.time, type: 'end', winner, reason });
    }

    function step(dt) {
      events.length = 0;
      if (b.over) return events;
      b.time += dt;
      for (const u of units) {
        if (!u.alive) continue;
        for (const k of ['tauntT', 'armourT', 'protectT', 'markT', 'buffT']) if (u[k] > 0) u[k] -= dt;
        if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
        const a = u.act;
        if (a) {
          a.t += dt;
          while (a.next < a.hits.length && a.t >= a.hits[a.next] && u.alive && !b.over) {
            applyHit(u, a);
            a.next++;
            if (!alive(0).length || !alive(1).length) break;
          }
          if (u.act && a.t >= a.dur) {
            if (!a.skill) u.mana = Math.min(MANA_MAX, u.mana + MANA_PER_ATTACK);
            u.act = null; u.cd = GAP;
          }
        } else {
          u.cd -= dt;
          if (u.waiting) u.mana = Math.min(MANA_MAX, u.mana + MANA_WAIT * dt);
          if (u.cd <= 0 && !startAction(u)) u.cd = 0.3;
        }
        const l = alive(0).length, r = alive(1).length;
        if (!l || !r) { finish(l ? 0 : r ? 1 : -1, 'wipe'); return events.slice(); }
      }
      if (b.time >= TIME_LIMIT) {
        const pct = (s) => alive(s).reduce((a, u) => a + u.hp, 0) / units.filter((u) => u.side === s).reduce((a, u) => a + u.maxHp, 0);
        const p0 = pct(0), p1 = pct(1);
        finish(Math.abs(p0 - p1) < 1e-6 ? -1 : p0 > p1 ? 0 : 1, 'time');
      }
      return events.slice();
    }

    return b;
  }

  const api = { create, ADV, MANA_MAX };
  if (typeof module !== 'undefined') module.exports = api; else root.BattleSim = api;
})(this);
