// Headless battle checks: node tools/sim_test.js [battles]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const J = (f) => path.join(__dirname, '..', 'js', f);
const roster = require(J('roster.js'));
const clipMeta = require(J('clip_meta.js'));
const BattleSim = require(J('sim.js'));
const synergy = process.env.NOSYN ? null : require(J('synergy.js'));
const ctx = {}; ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(J('anim_events.js'), 'utf8'), ctx);
const animEv = ctx.ANIM_EV;
const N = +process.argv[2] || 300;
const DT = 1 / 60;

function run(left, right, seed) {
  const b = BattleSim.create({ left, right, seed, roster, animEv, clipMeta, synergy });
  let guard = 0, actions = 0, skills = 0;
  while (!b.over && guard++ < 60 * 200) {
    for (const e of b.step(DT)) if (e.type === 'action') { actions++; if (e.skill) skills++; }
  }
  for (const u of b.units) if (!Number.isFinite(u.hp) || u.hp < 0 || u.hp > u.maxHp) throw new Error('bad hp ' + u.id + ' ' + u.hp);
  if (!b.over) throw new Error('battle did not end');
  return { b, actions, skills };
}

function report(label, make) {
  const wins = [0, 0, 0]; let time = 0, timeouts = 0, sk = 0, act = 0;
  for (let s = 1; s <= N; s++) {
    const [l, r] = make(s);
    const { b, actions, skills } = run(l, r, s);
    wins[b.winner === -1 ? 2 : b.winner]++; time += b.time; act += actions; sk += skills;
    if (b.time >= b.TIME_LIMIT) timeouts++;
  }
  console.log(`${label}: left ${(wins[0] / N * 100).toFixed(1)}%  right ${(wins[1] / N * 100).toFixed(1)}%  draw ${wins[2]}  ` +
    `avg ${(time / N).toFixed(1)}s  timeouts ${timeouts}  skills/battle ${(sk / N).toFixed(1)}  actions/battle ${(act / N).toFixed(1)}`);
}

const P = roster.PRESETS;
report('preset', () => [P.left.units, P.right.units]);
report('mirror', () => [P.left.units, P.left.units]);

// random line-ups: tanks / melee in front, the rest behind
function rnd(seed) { let a = seed; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
function team(r, ids) {
  const pick = ids.sort(() => r() - 0.5).slice(0, 6);
  const front = pick.filter((id) => roster.BY_ID[id].role === 'tank' || roster.BY_ID[id].basic.range <= 2);
  const back = pick.filter((id) => !front.includes(id));
  while (front.length > 3) back.push(front.pop());
  while (back.length > 3) front.push(back.pop());
  return [...front.map((id, i) => [id, 0, i]), ...back.map((id, i) => [id, 1, i])];
}
report('random', (s) => {
  const r = rnd(s * 7919);
  const ids = roster.ROSTER.map((x) => x.id).sort(() => r() - 0.5);
  return [team(r, ids.slice(0, 9)), team(r, ids.slice(9))];
});

// per-unit win contribution over random battles
const stat = {};
for (let s = 1; s <= N; s++) {
  const r = rnd(s * 104729);
  const ids = roster.ROSTER.map((x) => x.id).sort(() => r() - 0.5);
  const l = team(r, ids.slice(0, 9)), rr = team(r, ids.slice(9));
  const { b } = run(l, rr, s);
  for (const u of b.units) {
    const st = stat[u.id] || (stat[u.id] = { n: 0, w: 0, dealt: 0, healed: 0 });
    st.n++; if (b.winner === u.side) st.w++; st.dealt += u.dealt; st.healed += u.guarded;
  }
}
console.log('\nunit       win%   dmg/battle  heal/battle');
for (const [id, s] of Object.entries(stat).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n))
  { const d = roster.BY_ID[id]; console.log(id.padEnd(15), roster.TIER_NAME[d.tier].padEnd(4), d.cls.padEnd(5), d.role.padEnd(9), (s.w / s.n * 100).toFixed(0).padStart(4), String(Math.round(s.dealt / s.n)).padStart(10), String(Math.round(s.healed / s.n)).padStart(7)); }
