// Headless stages with a simple bot: node tools/stage_test.js [runs] [--chapters | --story]
// Prints clear rate and waves reached per stage for a starter pool and for the full roster.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const J = (f) => path.join(__dirname, '..', 'js', f);
const roster = require(J('roster.js'));
const enemies = require(J('lao_enemies.js'));
const clipMeta = require(J('clip_meta.js'));
const synergy = require(J('synergy.js'));
const WaveSim = require(J('wavesim.js'));
const Stage = require(J('stage.js'));
const STORY = require(J('story.js'));
const Items = require(J('items.js'));
const Meta = require(J('meta.js'));
const ctx = {}; ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(J('anim_events.js'), 'utf8'), ctx);
const animEv = ctx.ANIM_EV;
const B = roster.BY_ID;
const power = (u) => B[u.id].tier * Math.pow(2, u.star - 1);

function botGear(st) {
  if (st.reward) st.takeReward(0);
  if (st.itemShop) { for (let i = 0; i < st.itemShop.length; i++) if (st.gold >= 14) st.buyItem(i); st.closeItemShop(); }
  const board = st.units().filter((x) => x.loc.at === 'board').sort((a, b) => power(b.u) - power(a.u));
  for (const x of board) while (st.items.length && (x.u.items || []).length < st.RULES.itemSlots) st.equip(0, x.loc);
}
function botTurn(st) {
  botGear(st);
  if (st.gold >= 12 && st.level < st.RULES.maxLevel) st.buyXp();
  for (let pass = 0; pass < 3; pass++) {
    const own = (id) => st.units().filter((x) => x.u.id === id).length;
    const order = st.shop.map((id, i) => [id, i]).filter(([id]) => id).sort((a, b) => (own(b[0]) * 2 + B[b[0]].tier) - (own(a[0]) * 2 + B[a[0]].tier));
    for (const [, i] of order) if (st.shop[i] && st.gold >= st.cost(st.shop[i])) st.buy(i);
    if (st.gold >= 16) st.reroll(); else break;
  }
  const all = st.units().sort((a, b) => power(b.u) - power(a.u));
  const chosen = all.slice(0, st.cap()).map((x) => x.u), rest = all.slice(st.cap()).map((x) => x.u);
  st.board = {}; st.bench = new Array(st.RULES.benchSize).fill(null);
  rest.forEach((u, i) => { if (i < st.bench.length) st.bench[i] = u; });
  const front = chosen.filter((u) => B[u.id].role === 'tank' || B[u.id].basic.range <= 2);
  const back = chosen.filter((u) => !front.includes(u));
  const cells = { 0: [[0, 1], [0, 0], [0, 2]], 1: [[1, 1], [1, 0], [1, 2]], 2: [[2, 1], [2, 0], [2, 2]] };
  const free = [...cells[0], ...cells[1], ...cells[2]];
  const take = (pref) => { const order = pref === 'front' ? free : [...cells[2], ...cells[1], ...cells[0]]; const c = order.find((x) => !st.board[x[0] + ',' + x[1]]); return c; };
  for (const u of front) { const c = take('front'); st.board[c[0] + ',' + c[1]] = u; }
  for (const u of back) { const c = take('back'); st.board[c[0] + ',' + c[1]] = u; }
  while (st.bench.filter(Boolean).length > 6) st.sell({ at: 'bench', i: st.bench.findIndex(Boolean) });
}

function playStage(stage, pool, seed, ups, opts = {}) {
  const plan = STORY.plan(stage, opts.cycle || 1);
  const deck = opts.deck || Meta.autoDeck(roster, pool); // the bot takes a 6-unit deck like the player
  const st = Stage.create({ roster, stage, plan, seed, deck, baseHp: opts.baseHp || 20 + ((ups && ups.baseHp) || 0), bonusGold: opts.bonusGold || 0 });
  while (!st.over) {
    botTurn(st);
    const w = WaveSim.create({ lineup: st.lineup(), plan, stage, wave: st.wave, seed: seed * 100 + st.wave, roster, enemies, animEv, clipMeta, synergy, baseHp: st.baseHp, upgrades: ups });
    while (!w.over) w.step(1 / 20);
    st.finishWave(w.result, w.baseHp);
  }
  return st;
}
module.exports = { playStage };

if (require.main === module) {
  const N = +process.argv[2] || 30;
  const starter = roster.ROSTER.filter((r) => r.tier <= 2).map((r) => r.id);
  const full = roster.ROSTER.map((r) => r.id);
  // --story: the packaged game as played. Cycle 1: the squad and the chapter bonuses the story has given by that chapter
  // (js/story.js JOIN, js/meta.js chapterBonus); cycle 2: everyone, all eight bonuses, cruel bosses and stronger bugs
  if (process.argv.includes('--story')) {
    const Meta = require(J('meta.js'));
    const env = (k) => process.env[k] && JSON.parse(process.env[k]); // CURVE='{"late":1.01}' NGK=1.5: try values
    if (env('CURVE')) Object.assign(WaveSim.CURVE, env('CURVE'));
    if (env('NG')) Object.assign(STORY.TUNE, env('NG')); // NG='{"ng0":2.2,"ng1":1.3}'
    for (const cycle of [1, 2]) {
      const line = [];
      for (let c = 0; c < STORY.CHAPTERS.length; c++) {
        const done = cycle >= 2 ? STORY.CHAPTERS.length : c;
        const pool = STORY.squad(done, cycle), bon = Meta.chapterBonus(done);
        const ups = { atk: bon.atk, hp: bon.hp, baseHp: bon.base };
        let sum = 0, low = 101, lowG = 0;
        for (let i = 1; i <= STORY.PER_CHAPTER; i++) {
          const g = c * STORY.PER_CHAPTER + i;
          let clear = 0;
          for (let s = 1; s <= N; s++) if (playStage(g, pool, s, ups, { cycle }).cleared) clear++;
          const r = clear / N * 100; sum += r; if (r < low) { low = r; lowG = g; }
        }
        line.push(`${c + 1}장 ${Math.round(sum / STORY.PER_CHAPTER)}% (최저 ${STORY.at(lowG).code} ${Math.round(low)}%)`);
      }
      console.log(`${cycle}회차`.padEnd(6), line.join(' | '));
    }
    process.exit(0);
  }
  // the curve (js/wavesim.js CURVE / GIM) is tuned on the first line: nothing bought at all
  const chapters = process.argv.includes('--chapters'); // every stage, chapter averages and each chapter's hardest stage
  for (const [name, pool, ups] of [['강화 없음(B·A만)', starter, null], ['해금만(강화 없음)', full, null], ['전원+강화', full, { atk: 1.3, hp: 1.3, baseHp: 10 }]]) {
    const line = [];
    if (chapters) {
      for (let c = 0; c < STORY.CHAPTERS.length; c++) {
        let sum = 0, low = 101, lowG = 0;
        for (let i = 1; i <= STORY.PER_CHAPTER; i++) {
          const g = c * STORY.PER_CHAPTER + i;
          let clear = 0;
          for (let s = 1; s <= N; s++) if (playStage(g, pool, s, ups).cleared) clear++;
          const r = clear / N * 100; sum += r; if (r < low) { low = r; lowG = g; }
        }
        line.push(`${c + 1}장 평균 ${Math.round(sum / STORY.PER_CHAPTER)}% (최저 ${STORY.at(lowG).code} ${Math.round(low)}%)`);
      }
    } else {
      for (const stage of [1, 4, 8, 16, 24, 32, 48, 64]) {
        let clear = 0, waves = 0;
        for (let s = 1; s <= N; s++) { const st = playStage(stage, pool, s, ups); if (st.cleared) clear++; waves += st.cleared ? st.waves : st.wave - 1; }
        line.push(`S${stage} 클리어 ${(clear / N * 100).toFixed(0)}% 평균 ${(waves / N).toFixed(1)}웨이브`);
      }
    }
    console.log(name.padEnd(14), line.join(' | '));
  }
}
