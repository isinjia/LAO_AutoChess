// Permanent progression (survives runs): parts (부품), unlocked units, unit levels, research, stage progress.
// Pure logic + a small storage adapter (browser localStorage now; swap `store` for a server later).
//
//   const m = Meta.load(roster);   m.data.parts, m.unlock(id), m.levelUp(id), m.research(key), m.upgrades(), m.save()
(function (root) {
  const KEY = 'lao_autobattler_save_v1';
  const RULES = {
    unitMaxLevel: 10, levelK: 0.06, // +6% hp / attack per unit level
    unlockCost: { 1: 0, 2: 40, 3: 120, 4: 300 }, // by tier (B / A / S / SS)
    levelCost: (lv, tier) => Math.round((20 + 15 * lv) * (0.8 + 0.2 * tier)),
    research: {
      atk: { name: '공격 연구', desc: (lv) => `전 대원 공격력 +${lv * 8}%`, max: 15, cost: (lv) => 50 + 40 * lv },
      hp: { name: '체력 연구', desc: (lv) => `전 대원 체력 +${lv * 8}%`, max: 15, cost: (lv) => 50 + 40 * lv },
      base: { name: '기지 장갑', desc: (lv) => `기지 체력 +${lv * 2}`, max: 15, cost: (lv) => 40 + 30 * lv },
      gold: { name: '보급 확대', desc: (lv) => `스테이지 시작 골드 +${lv}`, max: 5, cost: (lv) => 80 + 60 * lv },
    },
    starterTiers: [1, 2], // B and A units are unlocked from the start
    deckSize: 6, // the units taken into a stage (King God Castle style): the shop draws only these, all equally likely
    firstClearK: 2,
  };

  // storage: localStorage when it works (private windows can refuse it), memory otherwise
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };

  function fresh(roster) {
    return {
      v: 1, parts: 0,
      unlocked: roster.ROSTER.filter((r) => RULES.starterTiers.includes(r.tier)).map((r) => r.id),
      levels: {}, research: { atk: 0, hp: 0, base: 0, gold: 0 },
      stageCleared: 0, // highest stage cleared
      best: {}, // stage -> best wave reached
      stats: { runs: 0, clears: 0 },
      deck: [], // unit ids taken into a stage (deckSize); empty = picked automatically
      tutorial: false, // first-run tutorial finished or skipped (js/tutorial.js)
      headIcons: true, // battle: class / squad icons beside the hp bar (lobby settings)
      seen: {}, // story scenes already shown: 'c1' chapter intro, 's3' stage 3, 'o1' chapter outro
    };
  }

  function wrap(roster, data, storage) {
    const m = {
      RULES, data,
      save() { return storage ? storage.set(data) : false; },
      reset() { Object.assign(data, fresh(roster)); if (storage) storage.clear(); m.save(); },
      isUnlocked: (id) => data.unlocked.includes(id),
      level: (id) => data.levels[id] || 1,
      unlockCost: (id) => RULES.unlockCost[roster.BY_ID[id].tier],
      levelCost: (id) => RULES.levelCost(m.level(id), roster.BY_ID[id].tier),
      researchCost: (key) => RULES.research[key].cost(data.research[key]),
      unlock(id) {
        if (m.isUnlocked(id) || data.parts < m.unlockCost(id)) return false;
        data.parts -= m.unlockCost(id); data.unlocked.push(id); m.save(); return true;
      },
      levelUp(id) {
        if (!m.isUnlocked(id) || m.level(id) >= RULES.unitMaxLevel || data.parts < m.levelCost(id)) return false;
        data.parts -= m.levelCost(id); data.levels[id] = m.level(id) + 1; m.save(); return true;
      },
      research(key) {
        const r = RULES.research[key];
        if (!r || data.research[key] >= r.max || data.parts < m.researchCost(key)) return false;
        data.parts -= m.researchCost(key); data.research[key]++; m.save(); return true;
      },
      // what a stage run gets from the permanent side (WaveSim `upgrades`, Stage options)
      upgrades() {
        return { atk: 1 + 0.08 * data.research.atk, hp: 1 + 0.08 * data.research.hp, levels: Object.assign({}, data.levels) };
      },
      baseHp: () => 20 + 2 * data.research.base,
      bonusGold: () => data.research.gold,
      stageOpen: (n) => n <= data.stageCleared + 1,
      // the deck: saved picks that are still unlocked, filled up automatically to deckSize
      deck() {
        const d = [...new Set((data.deck || []).filter((id) => roster.BY_ID[id] && data.unlocked.includes(id)))].slice(0, RULES.deckSize);
        for (const id of autoDeck(roster, data.unlocked, m.level)) { if (d.length >= RULES.deckSize) break; if (!d.includes(id)) d.push(id); }
        return d;
      },
      setDeck(ids) {
        const d = [...new Set(ids.filter((id) => data.unlocked.includes(id)))].slice(0, RULES.deckSize);
        data.deck = d; m.save(); return d;
      },
      // a finished stage run: parts earned (first clear pays double), progress recorded
      finishStage(stage, cleared, wavesCleared, parts) {
        const first = cleared && stage > data.stageCleared;
        const gain = first ? Math.round(parts * RULES.firstClearK) : parts;
        data.parts += gain;
        data.best[stage] = Math.max(data.best[stage] || 0, cleared ? 10 : wavesCleared);
        if (cleared) { data.stageCleared = Math.max(data.stageCleared, stage); data.stats.clears++; }
        data.stats.runs++;
        m.save();
        return { gain, first };
      },
    };
    return m;
  }

  // a sensible deck from a pool: the best tank and the best support, then the strongest of the rest
  function autoDeck(roster, pool, level = () => 1) {
    const score = (id) => { const d = roster.BY_ID[id]; return d.tier * 100 + level(id) * 5 + (d.atk * d.hp) / 1e6; };
    const list = pool.filter((id) => roster.BY_ID[id]).sort((a, b) => score(b) - score(a));
    const out = [];
    for (const role of ['tank', 'support']) { const id = list.find((x) => roster.BY_ID[x].role === role && !out.includes(x)); if (id) out.push(id); }
    for (const id of list) { if (out.length >= RULES.deckSize) break; if (!out.includes(id)) out.push(id); }
    return out;
  }

  function load(roster) {
    const saved = store.get();
    const data = Object.assign(fresh(roster), saved || {});
    data.unlocked = data.unlocked.filter((id) => roster.BY_ID[id]);
    return wrap(roster, data, store);
  }
  // headless runs (tools): no storage
  function memory(roster, data) { return wrap(roster, Object.assign(fresh(roster), data || {}), null); }

  const api = { load, memory, autoDeck, RULES };
  if (typeof module !== 'undefined') module.exports = api; else root.Meta = api;
})(this);
