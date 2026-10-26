// One autobattler run: rounds, gold, levels, shop, bench, board, 3-copy merges and AI enemy teams.
// Pure logic (no DOM), deterministic for a seed; tools/run_test.js plays whole runs headless.
//
//   const run = Run.create({ roster, seed });
//   run.reroll(); run.buy(slot); run.move(from, to); run.sell(loc); run.buyXp();
//   run.lineup()  -> [[id, col, row, star], ...] for BattleSim
//   run.enemy     -> the AI line-up of this round
//   run.finishBattle(winner, survivors)  -> damage / gold, next round
//
// Locations: { at: 'bench', i: 0..7 } or { at: 'board', col: 0..1, row: 0..2 }
(function (root) {
  const RULES = {
    startGold: 10, startHp: 100, startLevel: 3, maxLevel: 6,
    rounds: 15, // beat the last round to win the run
    income: 5, interestPer: 10, interestMax: 5, winBonus: 1,
    reroll: 2, xpCost: 4, xpGain: 4, xpPerRound: 2,
    xpNeed: { 3: 4, 4: 8, 5: 14 }, // xp to reach the next level
    benchSize: 8, shopSize: 5,
    // shop odds by level for tier 1..4 (B / A / S / SS)
    odds: { 3: [70, 25, 5, 0], 4: [50, 35, 13, 2], 5: [35, 35, 23, 7], 6: [20, 32, 33, 15] },
    starCost: { 1: 1, 2: 3, 3: 9 }, // copies inside one unit of that star
  };

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

  function create(opts) {
    const { roster } = opts;
    const rand = rng(opts.seed == null ? 1 : opts.seed);
    const byTier = { 1: [], 2: [], 3: [], 4: [] };
    for (const r of roster.ROSTER) byTier[r.tier].push(r.id);
    let keySeq = 0;
    const newUnit = (id, star = 1) => ({ key: ++keySeq, id, star });

    const run = {
      RULES, round: 1, hp: RULES.startHp, gold: RULES.startGold, level: RULES.startLevel, xp: 0,
      bench: new Array(RULES.benchSize).fill(null),
      board: {}, // "col,row" -> unit
      shop: [], enemy: [], log: [], over: false, won: false, streak: 0,
      cost, reroll, buy, sell, move, buyXp, lineup, boardCount, cap, finishBattle, unitAt, units, freeReroll,
    };

    function cost(id) { return roster.BY_ID[id].tier; }
    function cap() { return run.level; }
    function boardCount() { return Object.keys(run.board).length; }
    function units() {
      const out = [];
      run.bench.forEach((u, i) => { if (u) out.push({ u, loc: { at: 'bench', i } }); });
      for (const k in run.board) { const [col, row] = k.split(',').map(Number); out.push({ u: run.board[k], loc: { at: 'board', col, row } }); }
      return out;
    }
    function unitAt(loc) { return loc.at === 'bench' ? run.bench[loc.i] : run.board[loc.col + ',' + loc.row] || null; }
    function put(loc, u) {
      if (loc.at === 'bench') run.bench[loc.i] = u;
      else if (u) run.board[loc.col + ',' + loc.row] = u;
      else delete run.board[loc.col + ',' + loc.row];
    }

    function rollTier() {
      const o = RULES.odds[run.level];
      let x = rand() * o.reduce((a, b) => a + b, 0);
      for (let t = 0; t < 4; t++) { if ((x -= o[t]) < 0) return t + 1; }
      return 1;
    }
    function freeReroll() {
      run.shop = [];
      for (let i = 0; i < RULES.shopSize; i++) { const list = byTier[rollTier()]; run.shop.push(list[Math.floor(rand() * list.length)]); }
    }
    function reroll() {
      if (run.gold < RULES.reroll) return false;
      run.gold -= RULES.reroll;
      freeReroll();
      return true;
    }

    // three copies of the same unit and star merge into one of the next star (repeats for ★2 -> ★3)
    function merge(id) {
      for (let star = 1; star <= 2; star++) {
        const same = units().filter((x) => x.u.id === id && x.u.star === star);
        if (same.length < 3) continue;
        same.sort((a, b) => (a.loc.at === 'board' ? 0 : 1) - (b.loc.at === 'board' ? 0 : 1)); // keep a board spot
        const keep = same[0];
        for (const x of same.slice(1, 3)) put(x.loc, null);
        const up = newUnit(id, star + 1);
        put(keep.loc, up);
        run.log.push({ type: 'merge', id, star: star + 1 });
      }
    }

    function buy(slot) {
      const id = run.shop[slot];
      if (!id || run.gold < cost(id)) return false;
      const free = run.bench.indexOf(null);
      // a full bench still accepts the copy that completes a merge
      const wouldMerge = units().filter((x) => x.u.id === id && x.u.star === 1).length >= 2;
      if (free < 0 && !wouldMerge) return false;
      run.gold -= cost(id);
      run.shop[slot] = null;
      if (free >= 0) run.bench[free] = newUnit(id);
      else { // complete the merge in place of one of the two copies
        const two = units().filter((x) => x.u.id === id && x.u.star === 1);
        put(two[0].loc, newUnit(id, 2)); put(two[1].loc, null);
        run.log.push({ type: 'merge', id, star: 2 });
      }
      merge(id);
      return true;
    }

    function sell(loc) {
      const u = unitAt(loc);
      if (!u) return false;
      put(loc, null);
      run.gold += cost(u.id) * RULES.starCost[u.star];
      return true;
    }

    // move / swap between bench and board; the board holds at most `level` units
    function move(from, to) {
      const a = unitAt(from);
      if (!a) return false;
      if (from.at === to.at && (from.at === 'bench' ? from.i === to.i : from.col === to.col && from.row === to.row)) return false;
      const b = unitAt(to);
      if (to.at === 'board' && from.at === 'bench' && !b && boardCount() >= cap()) return false;
      put(from, b); put(to, a);
      return true;
    }

    function buyXp() {
      if (run.level >= RULES.maxLevel || run.gold < RULES.xpCost) return false;
      run.gold -= RULES.xpCost;
      addXp(RULES.xpGain);
      return true;
    }
    function addXp(n) {
      run.xp += n;
      while (run.level < RULES.maxLevel && run.xp >= RULES.xpNeed[run.level]) { run.xp -= RULES.xpNeed[run.level]; run.level++; }
      if (run.level >= RULES.maxLevel) run.xp = 0;
    }

    function lineup() {
      return Object.entries(run.board).map(([k, u]) => { const [col, row] = k.split(',').map(Number); return [u.id, col, row, u.star]; });
    }

    // AI team for a round: more units, higher tiers and stars as rounds go on
    function makeEnemy(round) {
      const n = Math.min(6, 2 + Math.floor((round + 1) / 2));
      const lvl = Math.min(6, 3 + Math.floor(round / 3));
      const saved = run.level; run.level = lvl;
      const ids = [];
      for (let i = 0; i < n; i++) { const list = byTier[rollTier()]; ids.push(list[Math.floor(rand() * list.length)]); }
      run.level = saved;
      const star2 = round >= 12 ? 0.75 : round >= 9 ? 0.5 : round >= 6 ? 0.3 : round >= 4 ? 0.15 : 0;
      const star3 = round >= 14 ? 0.25 : round >= 12 ? 0.1 : 0;
      const B = roster.BY_ID;
      const front = ids.filter((id) => B[id].role === 'tank' || B[id].basic.range <= 2);
      const back = ids.filter((id) => !front.includes(id));
      while (front.length > 3) back.push(front.pop());
      while (back.length > 3) front.push(back.pop());
      if (!front.length && back.length > 1) front.push(back.pop());
      const rows = [1, 0, 2];
      const star = () => (rand() < star3 ? 3 : rand() < star2 ? 2 : 1);
      return [...front.map((id, i) => [id, 0, rows[i], star()]), ...back.map((id, i) => [id, 1, rows[i], star()])];
    }

    // winner: 0 player, 1 enemy, -1 draw. survivors: enemy units left alive [{ id, star }]
    function finishBattle(winner, survivors) {
      const res = { round: run.round, winner, damage: 0, gold: 0 };
      if (winner === 0) { run.streak = Math.max(1, run.streak + 1); res.gold += RULES.winBonus; }
      else {
        run.streak = Math.min(-1, run.streak - 1);
        res.damage = 2 + Math.floor(run.round / 3) + (survivors || []).reduce((a, s) => a + roster.BY_ID[s.id].tier * s.star, 0);
        run.hp = Math.max(0, run.hp - res.damage);
      }
      if (run.hp <= 0) { run.over = true; run.won = false; }
      else if (run.round >= RULES.rounds) { run.over = true; run.won = winner === 0; } // the last round decides the run
      if (!run.over) {
        res.gold += RULES.income + Math.min(RULES.interestMax, Math.floor(run.gold / RULES.interestPer));
        run.gold += res.gold;
        run.round++;
        addXp(RULES.xpPerRound);
        freeReroll();
        run.enemy = makeEnemy(run.round);
      }
      run.log.push(Object.assign({ type: 'battle' }, res));
      return res;
    }

    freeReroll();
    run.enemy = makeEnemy(1);
    return run;
  }

  const api = { create, RULES };
  if (typeof module !== 'undefined') module.exports = api; else root.Run = api;
})(this);
