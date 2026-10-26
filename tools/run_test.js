// Headless runs with a simple bot: node tools/run_test.js [runs]
// Shows how far a reasonable player gets, so the AI enemy curve and the economy can be tuned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const J = (f) => path.join(__dirname, '..', 'js', f);
const roster = require(J('roster.js'));
const clipMeta = require(J('clip_meta.js'));
const BattleSim = require(J('sim.js'));
const synergy = process.env.NOSYN ? null : require(J('synergy.js'));
const Run = require(J('run.js'));
const ctx = {}; ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(J('anim_events.js'), 'utf8'), ctx);
const animEv = ctx.ANIM_EV;
const N = +process.argv[2] || 100;
const B = roster.BY_ID;
const power = (u) => B[u.id].tier * (u.star === 3 ? 9 : u.star === 2 ? 3 : 1);

function botTurn(run) {
  // level when rich, buy the best affordable cards (prefer pairs), reroll with spare gold above 20
  if (run.gold >= 14 && run.level < 6) run.buyXp();
  for (let pass = 0; pass < 3; pass++) {
    const order = run.shop.map((id, i) => [id, i]).filter(([id]) => id)
      .sort((a, b) => {
        const own = (id) => run.units().filter((x) => x.u.id === id).length;
        return (own(b[0]) * 2 + B[b[0]].tier) - (own(a[0]) * 2 + B[a[0]].tier);
      });
    for (const [, i] of order) if (run.gold - run.cost(run.shop[i]) >= 0) run.buy(i);
    if (run.gold >= 22) run.reroll(); else break;
  }
  // board: the strongest units; tanks and short reach in front
  const all = run.units().sort((a, b) => power(b.u) - power(a.u));
  const chosen = all.slice(0, run.cap()).map((x) => x.u);
  const rest = all.slice(run.cap()).map((x) => x.u);
  run.board = {};
  run.bench = new Array(run.RULES.benchSize).fill(null);
  rest.forEach((u, i) => { if (i < run.bench.length) run.bench[i] = u; });
  const front = chosen.filter((u) => B[u.id].role === 'tank' || B[u.id].basic.range <= 2);
  const back = chosen.filter((u) => !front.includes(u));
  while (front.length > 3) back.push(front.pop());
  while (back.length > 3) front.push(back.pop());
  const rows = [1, 0, 2];
  front.forEach((u, i) => { run.board['0,' + rows[i]] = u; });
  back.forEach((u, i) => { run.board['1,' + rows[i]] = u; });
  // sell leftovers that no longer fit
  while (run.bench.filter(Boolean).length > 6) { const i = run.bench.findIndex(Boolean); run.sell({ at: 'bench', i }); }
}

const reached = [];
let wins = 0, roundWins = {}, roundN = {}, merges = 0;
for (let s = 1; s <= N; s++) {
  const run = Run.create({ roster, seed: s });
  while (!run.over) {
    botTurn(run);
    const b = BattleSim.create({ left: run.lineup(), right: run.enemy, seed: s * 1000 + run.round, roster, animEv, clipMeta, synergy });
    while (!b.over) b.step(1 / 30);
    const surv = b.units.filter((u) => u.side === 1 && u.alive).map((u) => ({ id: u.id, star: u.star }));
    roundN[run.round] = (roundN[run.round] || 0) + 1;
    if (b.winner === 0) roundWins[run.round] = (roundWins[run.round] || 0) + 1;
    run.finishBattle(b.winner, surv);
  }
  merges += run.log.filter((l) => l.type === 'merge').length;
  reached.push(run.round);
  if (run.won) wins++;
}
reached.sort((a, b) => a - b);
console.log(`runs ${N}: won ${wins} (${(wins / N * 100).toFixed(0)}%)  median round ${reached[N >> 1]}  merges/run ${(merges / N).toFixed(1)}`);
console.log('round  played  bot win%');
for (const r of Object.keys(roundN).map(Number).sort((a, b) => a - b)) console.log(String(r).padStart(5), String(roundN[r]).padStart(7), ((roundWins[r] || 0) / roundN[r] * 100).toFixed(0).padStart(8));
