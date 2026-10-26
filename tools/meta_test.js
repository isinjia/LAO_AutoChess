// Progression check: a bot plays run after run with permanent upgrades. node tools/meta_test.js [accounts] [runs]
const path = require('path');
const J = (f) => path.join(__dirname, '..', 'js', f);
const roster = require(J('roster.js'));
const Meta = require(J('meta.js'));
const { playStage } = require('./stage_test.js');
const STORY = require(J('story.js'));
const LAST = STORY.total();
const A = +process.argv[2] || 6, R = +process.argv[3] || 30;

function spend(m) {
  // research first while cheap, then unlock the cheapest locked S/SS, then level the most used tiers
  for (let guard = 0; guard < 200; guard++) {
    const opts = [];
    for (const k of ['atk', 'hp', 'base', 'gold']) if (m.data.research[k] < m.RULES.research[k].max) opts.push([m.researchCost(k) * (k === 'gold' ? 1.5 : 1), () => m.research(k)]);
    for (const r of roster.ROSTER) if (!m.isUnlocked(r.id)) opts.push([m.unlockCost(r.id) * 0.9, () => m.unlock(r.id)]);
    for (const id of m.data.unlocked) if (roster.BY_ID[id].tier >= 3 && m.level(id) < 10) opts.push([m.levelCost(id) * 1.3, () => m.levelUp(id)]);
    opts.sort((a, b) => a[0] - b[0]);
    const pick = opts.find((o) => o[0] / (o[0] > 0 ? 1 : 1) <= m.data.parts * 1.0 + 0.001 && o[1]());
    if (!pick) break;
  }
}

const firstClear = {};
for (let a = 1; a <= A; a++) {
  const m = Meta.memory(roster);
  const line = [];
  for (let run = 1; run <= R; run++) {
    const stage = m.data.stageCleared + 1;
    if (stage > LAST) break;
    const st = playStage(stage, m.data.unlocked, a * 1000 + run, m.upgrades(), { baseHp: m.baseHp(), bonusGold: m.bonusGold(), deck: m.deck() });
    if (stage > LAST) break;
    m.finishStage(stage, st.cleared, st.cleared ? st.waves : st.wave - 1, st.parts);
    if (st.cleared) { (firstClear[stage] = firstClear[stage] || []).push(run); line.push(`S${stage}@${run}`); }
    spend(m);
  }
  console.log(`account ${a}: cleared up to S${m.data.stageCleared} in ${R} runs | ${line.join(' ')} | parts left ${m.data.parts}, unlocked ${m.data.unlocked.length}, research ${JSON.stringify(m.data.research)}`);
}
console.log('first clear run (median):', Object.entries(firstClear).map(([s, v]) => { v.sort((x, y) => x - y); return `S${s}=${v[v.length >> 1]} (${v.length}/${A})`; }).join('  '));
