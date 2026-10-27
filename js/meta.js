// Story progress (a packaged game, not a grind): three save slots, the playthrough cycle, the squad the story has
// given (js/story.js JOIN), the chapter bonuses, which scenes were seen. Nothing is bought with a currency.
//
//   Meta.slots(roster)        -> [{ n, empty, cycle, stageCleared, endings, playSec, updated }] for the title screen
//   const m = Meta.load(roster, n)   m.data, m.upgrades(), m.baseHp(), m.finishStage(...), m.newCycle(), m.save()
//
// Cycle 1: the squad grows on each chapter clear and every cleared chapter adds a bonus (attack / hp +4%, base +2).
// Cycle 2+ (after the ending): everyone in the squad, all eight bonuses, cruel bosses and stronger bugs (STORY.plan).
(function (root) {
  const SLOT_KEY = (n) => 'lao_orca_slot_' + n;
  const LEGACY_KEY = 'lao_autobattler_save_v1'; // the old single save (grind version): moves into slot 1 once
  const SLOTS = 3;
  const RULES = {
    deckSize: 6, // the units taken into a stage (King God Castle style): the shop draws only these, all equally likely
    bonusAtk: 0.04, bonusHp: 0.04, bonusBase: 2, // per cleared chapter
  };
  const story = () => (typeof STORY !== 'undefined' ? STORY : require('./story.js'));
  const PER = () => story().PER_CHAPTER;
  const TOTAL = () => story().total();

  // what `chapters` cleared chapters give everyone (tools/stage_test.js --story uses it too)
  function chapterBonus(chapters) {
    return { atk: 1 + RULES.bonusAtk * chapters, hp: 1 + RULES.bonusHp * chapters, base: RULES.bonusBase * chapters };
  }

  const storeOf = (key) => ({
    get() { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
  });

  function fresh() {
    return {
      v: 2,
      cycle: 1, // the playthrough: 1 = story, 2+ = new game plus
      endings: 0, // highest cycle whose ending was reached (2 = the true ending)
      stageCleared: 0, // highest stage cleared in this cycle
      best: {}, // stage -> best wave reached (this cycle)
      stats: { runs: 0, clears: 0 },
      deck: [], // unit ids taken into a stage (deckSize); empty = picked automatically
      unlocked: [], // the squad (kept in step with the story by sync())
      tutorial: false, // first-run tutorial finished or skipped (js/tutorial.js)
      headIcons: true, // battle: class / squad icons beside the hp bar (lobby settings)
      seen: {}, // story scenes already shown this cycle: 'c1' chapter intro, 's3' stage 3, 'o1' outro, 'ng1' / 'ngo1' extras
      playSec: 0, // play time
      created: Date.now(), updated: Date.now(),
    };
  }

  function wrap(roster, data, storage) {
    const m = {
      RULES, data,
      save() { data.updated = Date.now(); return storage ? storage.set(data) : false; },
      reset() { Object.assign(data, fresh()); m.sync(); if (storage) storage.clear(); m.save(); },
      chapters: () => Math.floor(data.stageCleared / PER()), // chapters cleared this cycle
      bonusChapters: () => (data.cycle >= 2 ? story().CHAPTERS.length : m.chapters()),
      isUnlocked: (id) => data.unlocked.includes(id),
      // the squad as the story stands; returns the units that just joined
      sync() {
        const want = story().squad(m.chapters(), data.cycle).filter((id) => roster.BY_ID[id]);
        const fresh_ = want.filter((id) => !data.unlocked.includes(id));
        data.unlocked = want;
        return fresh_;
      },
      // when each unit joins (cycle 1): 0 = from the start, n = after chapter n
      // when each unit joins (cycle 1): 0 = from the start, n = after chapter n, -1 = the 2nd cycle
      joinsAfter(id) { const J = story().JOIN; for (const c in J) if (J[c].includes(id)) return +c; return -1; },
      // the party of the chapter about to be played (js/story.js PARTY) and a deck built around it
      party() { const c = Math.min(story().CHAPTERS.length, Math.floor(data.stageCleared / PER()) + 1); return (story().PARTY[c] || []).filter((id) => data.unlocked.includes(id)); },
      partyDeck() { const p = m.party(); return p.length ? p.slice(0, RULES.deckSize) : autoDeck(roster, data.unlocked); }, // the scene's party only
      // what a stage run gets from the story: chapter bonuses (WaveSim `upgrades`, Stage options)
      upgrades() { const b = chapterBonus(m.bonusChapters()); return { atk: b.atk, hp: b.hp, levels: {} }; },
      baseHp: () => 20 + chapterBonus(m.bonusChapters()).base,
      bonusGold: () => 0,
      level: () => 1,
      stageOpen: (n) => n <= data.stageCleared + 1,
      plan: (g) => story().plan(g, data.cycle),
      // the deck: saved picks still in the squad, filled up automatically to deckSize
      deck() {
        const d = [...new Set((data.deck || []).filter((id) => roster.BY_ID[id] && data.unlocked.includes(id)))].slice(0, RULES.deckSize);
        return d.length ? d : m.partyDeck();
      },
      setDeck(ids) {
        const d = [...new Set(ids.filter((id) => data.unlocked.includes(id)))].slice(0, RULES.deckSize);
        data.deck = d; m.save(); return d;
      },
      // a finished stage: progress recorded; a chapter clear grows the squad; the last stage is the cycle's ending
      finishStage(stage, cleared, wavesCleared) {
        const first = cleared && stage > data.stageCleared;
        const chBefore = m.chapters();
        data.best[stage] = Math.max(data.best[stage] || 0, cleared ? 10 : wavesCleared);
        if (cleared) { data.stageCleared = Math.max(data.stageCleared, stage); data.stats.clears++; }
        data.stats.runs++;
        const joined = m.sync();
        const chapterDone = first && m.chapters() > chBefore ? m.chapters() : 0;
        const ending = first && stage >= TOTAL();
        if (ending) data.endings = Math.max(data.endings, data.cycle);
        m.save();
        return { first, joined, chapterDone, ending, bonus: chapterBonus(m.bonusChapters()) };
      },
      canNewCycle: () => data.endings >= data.cycle,
      // the next playthrough: the story again from 1-1, harder, with everyone and every bonus
      newCycle() {
        if (!m.canNewCycle()) return false;
        data.cycle++;
        data.stageCleared = 0; data.best = {}; data.seen = {};
        m.sync();
        data.deck = m.partyDeck();
        m.save();
        return true;
      },
      addTime(sec) { data.playSec = (data.playSec || 0) + sec; },
    };
    m.sync();
    return m;
  }

  // a sensible deck from a pool: the best tank and the best support, then the strongest of the rest, with at most
  // two S and two SS cards (they cost 3-4 gold: an all-SS deck buys too few copies to merge and loses mid-game)
  const TIER_CAP = { 3: 2, 4: 2 };
  // prefer: a chapter's party, taken first (in its order) before the usual picks
  function autoDeck(roster, pool, prefer = []) {
    const score = (id) => { const d = roster.BY_ID[id]; return d.tier * 100 + (d.atk * d.hp) / 1e6; };
    const list = pool.filter((id) => roster.BY_ID[id]).sort((a, b) => score(b) - score(a));
    const out = [], n = {};
    const fits = (id) => (n[roster.BY_ID[id].tier] || 0) < (TIER_CAP[roster.BY_ID[id].tier] || 9);
    const add = (id) => { out.push(id); const t = roster.BY_ID[id].tier; n[t] = (n[t] || 0) + 1; };
    for (const id of prefer) if (out.length < RULES.deckSize && pool.includes(id) && roster.BY_ID[id] && !out.includes(id)) add(id);
    for (const role of ['tank', 'support']) { const id = list.find((x) => roster.BY_ID[x].role === role && !out.includes(x) && fits(x)); if (id) add(id); }
    for (const id of list) { if (out.length >= RULES.deckSize) break; if (!out.includes(id) && fits(id)) add(id); }
    for (const id of list) { if (out.length >= RULES.deckSize) break; if (!out.includes(id)) add(id); } // a small pool: anyone
    return out;
  }

  // the old single save (parts / research version) becomes slot 1: its story progress and settings carry over
  function migrate() {
    const old = storeOf(LEGACY_KEY).get();
    if (!old) return;
    const s1 = storeOf(SLOT_KEY(1));
    if (!s1.get()) {
      const d = Object.assign(fresh(), {
        stageCleared: old.stageCleared || 0, best: old.best || {}, stats: old.stats || { runs: 0, clears: 0 },
        deck: old.deck || [], tutorial: !!old.tutorial, headIcons: old.headIcons !== false, seen: old.seen || {},
      });
      s1.set(d);
    }
    storeOf(LEGACY_KEY).clear();
  }

  function slots() {
    migrate();
    const out = [];
    for (let n = 1; n <= SLOTS; n++) {
      const d = storeOf(SLOT_KEY(n)).get();
      out.push(d ? { n, empty: false, cycle: d.cycle || 1, stageCleared: d.stageCleared || 0, endings: d.endings || 0, playSec: d.playSec || 0, updated: d.updated || 0 }
        : { n, empty: true });
    }
    return out;
  }
  function load(roster, n = 1) {
    migrate();
    const storage = storeOf(SLOT_KEY(n));
    const data = Object.assign(fresh(), storage.get() || {});
    const m = wrap(roster, data, storage);
    m.slot = n;
    return m;
  }
  function erase(n) { storeOf(SLOT_KEY(n)).clear(); }
  // headless runs (tools): no storage
  function memory(roster, data) { return wrap(roster, Object.assign(fresh(), data || {}), null); }

  const api = { load, memory, slots, erase, autoDeck, chapterBonus, RULES, SLOTS };
  if (typeof module !== 'undefined') module.exports = api; else root.Meta = api;
})(this);
