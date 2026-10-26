// Headless wave checks: node tools/wave_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const J = (f) => path.join(__dirname, '..', 'js', f);
const roster = require(J('roster.js'));
const enemies = require(J('lao_enemies.js'));
const clipMeta = require(J('clip_meta.js'));
const synergy = require(J('synergy.js'));
const WaveSim = require(J('wavesim.js'));
const ctx = {}; ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(J('anim_events.js'), 'utf8'), ctx);
const animEv = ctx.ANIM_EV;

function wave(lineup, stage, w, seed, ups) {
  const s = WaveSim.create({ lineup, stage, wave: w, seed, roster, enemies, animEv, clipMeta, synergy, baseHp: 20, upgrades: ups });
  while (!s.over) s.step(1 / 30);
  const alliesDead = s.units.filter((u) => u.side === 0 && !u.alive).length;
  return { res: s.result, t: s.time, breach: 20 - s.baseHp, dead: alliesDead, total: s.total };
}
module.exports = { wave };
if (require.main === module) {
  const teams = {
    'B/A 3명': [['gnome', 0, 1, 1], ['leprechaun', 1, 1, 1], ['brownie', 2, 1, 1]],
    'S급 5명': [['empress', 0, 1, 1], ['undine', 0, 0, 1], ['valkyrie', 1, 1, 1], ['phoenix', 2, 1, 1], ['thetis', 1, 0, 1]],
    'SS 7명': [['labiata', 0, 1, 1], ['eternity', 0, 0, 1], ['blacklilith', 0, 2, 1], ['ullr', 1, 1, 1], ['tiamat', 2, 0, 1], ['mercury', 2, 1, 1], ['hela', 1, 2, 1]],
  };
  for (const [name, lu] of Object.entries(teams)) {
    for (const stage of [1, 2, 3]) {
      const row = [];
      for (const w of [1, 3, 5, 8, 10]) { const r = wave(lu, stage, w, 7 + w); row.push(`w${w}:${r.res === 'clear' ? 'C' : 'F'} ${r.t.toFixed(0)}s b${r.breach} d${r.dead}`); }
      console.log(name.padEnd(8), 'S' + stage, row.join(' | '));
    }
  }
}
