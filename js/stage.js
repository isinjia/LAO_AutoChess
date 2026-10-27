// One stage of the PvE wave defence: 10 waves, gold, levels, shop, bench, 3x3 formation, 3-copy merges.
// Pure logic (no DOM), deterministic for a seed. tools/stage_test.js plays whole stages headless.
//
//   const st = Stage.create({ roster, stage, seed, pool, baseHp });   // pool: unlocked unit ids
//   st.reroll(); st.buy(slot); st.move(from, to); st.sell(loc); st.buyXp();
//   st.lineup()  -> [[id, col, row, star], ...] for WaveSim
//   st.finishWave(result, baseHpLeft)  -> income / next wave, or the stage result
//
// Locations: { at: 'bench', i: 0..7 } or { at: 'board', col: 0..2, row: 0..2 }
(function (root) {
  const RULES = {
    waves: 10, startGold: 8, startLevel: 3, maxLevel: 7,
    income: 5, interestPer: 10, interestMax: 3, clearBonus: 1, eliteBonus: 4,
    reroll: 2, xpCost: 4, xpGain: 4, xpPerWave: 2,
    xpNeed: { 3: 4, 4: 6, 5: 10, 6: 14 },
    benchSize: 8, shopSize: 5,
    odds: { 3: [70, 25, 5, 0], 4: [55, 32, 12, 1], 5: [40, 34, 22, 4], 6: [28, 33, 30, 9], 7: [18, 30, 35, 17] },
    maxStar: 7, // two copies of the same unit and star merge into one of the next star (King God Castle style)
    starCost: { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64 }, // copies inside one unit of that star
    maxItemStar: 7, // two copies of the same gear and star merge too
    itemSlots: 2, maxItems: 6, // gear per unit, gear in the store
    shopTimeAfter: [3, 7], // waves after which the supply shop (보급 상점) opens
    itemShopSize: 4, itemReroll: 2,
    // permanent reward per wave cleared, and on a stage clear
    partsPerWave: 15, partsClear: 80,
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
    const Items = opts.items || (typeof module !== 'undefined' ? require('./items.js') : root.Items);
    const rand = rng(opts.seed == null ? 1 : opts.seed);
    // deck (King God Castle style): the shop draws only these units, each equally likely; without one, the pool by tier odds
    const deck = (opts.deck || []).filter((id) => roster.BY_ID[id]);
    const pool = (deck.length ? deck : opts.pool && opts.pool.length ? opts.pool : roster.ROSTER.map((r) => r.id)).filter((id) => roster.BY_ID[id]);
    const byTier = { 1: [], 2: [], 3: [], 4: [] };
    for (const id of pool) byTier[roster.BY_ID[id].tier].push(id);
    let keySeq = 0;
    const newUnit = (id, star = 1) => ({ key: ++keySeq, id, star });

    const plan = opts.plan || null; // js/story.js stage plan: waves, elite wave
    const WAVES = plan ? plan.waves : RULES.waves, ELITE = plan ? plan.eliteWave : 5;
    const SHOP_AFTER = plan ? [2, 5] : RULES.shopTimeAfter;
    const PARTS_K = plan && plan.partsK ? plan.partsK : 1; // later chapters pay more parts
    const st = {
      RULES, plan, waves: WAVES, stage: opts.stage || (plan ? plan.g : 1), wave: 1, baseHp: opts.baseHp || 20, maxBaseHp: opts.baseHp || 20,
      gold: RULES.startGold + (opts.bonusGold || 0), level: RULES.startLevel, xp: 0,
      bench: new Array(RULES.benchSize).fill(null), board: {}, shop: [], log: [], deck,
      over: false, cleared: false, parts: 0,
      items: [], itemShop: null, reward: null, // gear store, supply shop offer (when open), elite reward choice
      cost, reroll, buy, sell, move, buyXp, lineup, boardCount, cap, finishWave, unitAt, units, freeReroll,
      equip, buyItem, rerollItems, closeItemShop, takeReward, itemTier, mergeItems, fits: (it) => fits(it),
    };
    // opts.starters: [[id, col, row, star]] already on the formation, free (the tutorial's first stage)
    for (const [id, col, row, star] of opts.starters || []) if (roster.BY_ID[id]) st.board[col + ',' + row] = newUnit(id, star || 1);

    function cost(id) { return roster.BY_ID[id].tier; }
    function cap() { return st.level; }
    function boardCount() { return Object.keys(st.board).length; }
    function units() {
      const out = [];
      st.bench.forEach((u, i) => { if (u) out.push({ u, loc: { at: 'bench', i } }); });
      for (const k in st.board) { const [col, row] = k.split(',').map(Number); out.push({ u: st.board[k], loc: { at: 'board', col, row } }); }
      return out;
    }
    function unitAt(loc) { return loc.at === 'bench' ? st.bench[loc.i] : st.board[loc.col + ',' + loc.row] || null; }
    function put(loc, u) {
      if (loc.at === 'bench') st.bench[loc.i] = u;
      else if (u) st.board[loc.col + ',' + loc.row] = u;
      else delete st.board[loc.col + ',' + loc.row];
    }
    function rollTier() {
      const o = RULES.odds[st.level];
      // tiers with nothing unlocked are skipped
      const w = o.map((x, t) => (byTier[t + 1].length ? x : 0));
      let x = rand() * (w.reduce((a, b) => a + b, 0) || 1);
      for (let t = 0; t < 4; t++) { if ((x -= w[t]) < 0) return t + 1; }
      return [1, 2, 3, 4].find((t) => byTier[t].length) || 1;
    }
    function freeReroll() {
      st.shop = [];
      for (let i = 0; i < RULES.shopSize; i++) {
        if (deck.length) { st.shop.push(deck[Math.floor(rand() * deck.length)]); continue; }
        const list = byTier[rollTier()];
        st.shop.push(list.length ? list[Math.floor(rand() * list.length)] : null);
      }
    }
    function reroll() {
      if (st.gold < RULES.reroll) return false;
      st.gold -= RULES.reroll;
      freeReroll();
      return true;
    }
    function merge(id) {
      for (let star = 1; star < RULES.maxStar; star++) {
        const same = units().filter((x) => x.u.id === id && x.u.star === star);
        if (same.length < 2) continue;
        same.sort((a, b) => (a.loc.at === 'board' ? 0 : 1) - (b.loc.at === 'board' ? 0 : 1));
        const keep = same[0], gone = same[1];
        put(gone.loc, null);
        const up = newUnit(id, star + 1);
        up.items = [...(keep.u.items || []), ...(gone.u.items || [])].slice(0, RULES.itemSlots || 2); // gear carries over
        const spare = [...(keep.u.items || []), ...(gone.u.items || [])].slice(RULES.itemSlots || 2);
        if (spare.length && st.items) { st.items.push(...spare); mergeItems(); }
        put(keep.loc, up);
        st.log.push({ type: 'merge', id, star: star + 1 });
      }
    }
    function buy(slot) {
      const id = st.shop[slot];
      if (!id || st.gold < cost(id)) return false;
      const free = st.bench.indexOf(null);
      const twins = units().filter((x) => x.u.id === id && x.u.star === 1);
      if (free < 0 && !twins.length) return false; // a full bench still takes the copy that completes a merge
      st.gold -= cost(id);
      st.shop[slot] = null;
      if (free >= 0) st.bench[free] = newUnit(id);
      else { const up = newUnit(id, 2); up.items = twins[0].u.items || []; put(twins[0].loc, up); st.log.push({ type: 'merge', id, star: 2 }); }
      merge(id);
      return true;
    }
    function sell(loc) {
      const u = unitAt(loc);
      if (!u) return false;
      put(loc, null);
      for (const it of u.items || []) if (st.items.length < RULES.maxItems) st.items.push(it); // gear goes back to the store
      mergeItems();
      st.gold += cost(u.id) * RULES.starCost[u.star];
      return true;
    }
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
      if (st.level >= RULES.maxLevel || st.gold < RULES.xpCost) return false;
      st.gold -= RULES.xpCost;
      addXp(RULES.xpGain);
      return true;
    }
    function addXp(n) {
      st.xp += n;
      while (st.level < RULES.maxLevel && st.xp >= RULES.xpNeed[st.level]) { st.xp -= RULES.xpNeed[st.level]; st.level++; }
      if (st.level >= RULES.maxLevel) st.xp = 0;
    }
    function lineup() {
      return Object.entries(st.board).map(([k, u]) => { const [col, row] = k.split(',').map(Number); return [u.id, col, row, u.star, u.items || []]; });
    }

    // ---- gear ----
    function itemTier() { // the star the shop rolls (rewards one more): higher stars come from merging
      const base = 1 + Math.floor((st.stage - 1) / 8) + (st.wave > WAVES / 2 && rand() < 0.4 ? 1 : 0); // better gear in later chapters / waves
      return Math.min(3, base);
    }
    // two pieces of the same gear and star in the store merge into one of the next star; a store piece that matches
    // a piece a unit wears upgrades the worn one. Repeats until nothing pairs up.
    function mergeItems() {
      const same = (a, b) => a.key === b.key && a.tier === b.tier && a.tier < RULES.maxItemStar;
      for (let again = true; again;) {
        again = false;
        for (let i = 0; i < st.items.length && !again; i++) {
          const j = st.items.findIndex((b, k) => k > i && same(st.items[i], b));
          if (j >= 0) {
            const up = { key: st.items[i].key, tier: st.items[i].tier + 1 };
            st.items.splice(j, 1);
            st.items[i] = up;
            st.log.push({ type: 'itemMerge', key: up.key, star: up.tier });
            again = true;
            break;
          }
          for (const { u } of units()) {
            const w = (u.items || []).findIndex((b) => same(st.items[i], b));
            if (w < 0) continue;
            u.items[w] = { key: u.items[w].key, tier: u.items[w].tier + 1 };
            st.items.splice(i, 1);
            st.log.push({ type: 'itemMerge', key: u.items[w].key, star: u.items[w].tier, unit: u.id });
            again = true;
            break;
          }
        }
      }
    }
    // a piece fits in a full store when it completes a merge
    const fits = (it) => st.items.length < RULES.maxItems || it.tier < RULES.maxItemStar && (st.items.some((b) => b.key === it.key && b.tier === it.tier) || units().some(({ u }) => (u.items || []).some((b) => b.key === it.key && b.tier === it.tier)));
    function equip(i, loc) {
      const it = st.items[i], u = unitAt(loc);
      if (!it || !u) return false;
      u.items = u.items || [];
      if (u.items.length >= RULES.itemSlots) return false;
      u.items.push(it);
      st.items.splice(i, 1);
      return true;
    }
    function openItemShop() {
      st.itemShop = [];
      for (let i = 0; i < RULES.itemShopSize; i++) st.itemShop.push(Items.roll(rand, itemTier()));
    }
    function buyItem(i) {
      const it = st.itemShop && st.itemShop[i];
      if (!it || st.gold < Items.price(it.tier) || !fits(it)) return false;
      st.gold -= Items.price(it.tier);
      st.items.push(it);
      st.itemShop[i] = null;
      mergeItems();
      return true;
    }
    function rerollItems() {
      if (!st.itemShop || st.gold < RULES.itemReroll) return false;
      st.gold -= RULES.itemReroll;
      openItemShop();
      return true;
    }
    function closeItemShop() { st.itemShop = null; }
    function takeReward(i) {
      const it = st.reward && st.reward[i];
      if (!it) return false;
      if (fits(it)) { st.items.push(it); mergeItems(); }
      st.reward = null;
      return true;
    }

    // result: 'clear' | 'fall' (from WaveSim); baseHp: what the base has left
    function finishWave(result, baseHp) {
      const res = { wave: st.wave, result, gold: 0, parts: 0 };
      st.baseHp = baseHp;
      if (result === 'fall' || baseHp <= 0) {
        st.over = true; st.cleared = false;
      } else {
        res.parts = Math.round(RULES.partsPerWave * PARTS_K);
        if (st.wave >= WAVES) { st.over = true; st.cleared = true; res.parts += Math.round(RULES.partsClear * PARTS_K); }
      }
      st.parts += res.parts;
      if (!st.over) {
        res.gold = RULES.income + RULES.clearBonus + Math.min(RULES.interestMax, Math.floor(st.gold / RULES.interestPer)) + (st.wave === ELITE ? RULES.eliteBonus : 0);
        st.gold += res.gold;
        if (st.wave === ELITE) { st.reward = [0, 1, 2].map(() => Items.roll(rand, itemTier() + 1)); res.reward = true; } // elite chest
        if (SHOP_AFTER.includes(st.wave)) { openItemShop(); res.shopTime = true; }
        st.wave++;
        addXp(RULES.xpPerWave);
        freeReroll();
      }
      st.log.push(Object.assign({ type: 'wave' }, res));
      return res;
    }

    freeReroll();
    return st;
  }

  const api = { create, RULES };
  if (typeof module !== 'undefined') module.exports = api; else root.Stage = api;
})(this);
