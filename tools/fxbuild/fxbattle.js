// Battle-level sync check of the original effects in real stage battles (index.html?fxbattle).
// Every roster unit at ★1 / ★3 / ★5 (base rig and both skins), six at a time, fights the final wave of a stage
// (stages 9..24, so captains, bosses and their gimmicks are in). The battle runtime logs (js/battle.js):
//   timing     every original effect: the clip time of its event vs the playhead the effect starts at
//   placement  every projectile: the live rig's nearest kept ancestor of _fire<n> vs Unity's at that moment
//   coverage   which rig / clip timelines fired, which were cut (the unit died)
// Results: window.FXBATTLE and the #fxbattle element (read with --dump-dom).
(async () => {
  const B = window.BATTLE, S = window.STORY, RO = window.ROSTER;
  const out = document.createElement('pre');
  out.id = 'fxbattle';
  out.style.cssText = 'position:fixed;left:0;top:0;z-index:999;background:#000;color:#0f0;font:11px monospace;max-height:100%;overflow:auto;margin:0';
  document.body.appendChild(out);
  const say = (t) => { out.textContent = t; };
  await new Promise((r) => setTimeout(r, 3000));
  const ONLY = new URLSearchParams(location.search).get('n'); // battles to run (default all)
  const units = [];
  for (const star of [1, 3, 5]) for (const d of RO.ROSTER) units.push([d.id, star]);
  const batches = [];
  const PICK = new URLSearchParams(location.search).get('units'); // "id:star,id:star" (targeted run)
  const pool = PICK ? PICK.split(',').map((x) => { const [id, st] = x.split(':'); return [id, +st || 1]; }) : units;
  const SIZE = new URLSearchParams(location.search).get("solo") ? 1 : 6; // solo: each unit alone, so the bugs come into its reach
  for (let i = 0; i < pool.length; i += SIZE) batches.push(pool.slice(i, i + SIZE));
  const HP = +(new URLSearchParams(location.search).get('hp') || 10);
  const cells = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]];
  window.FX_SYNC_LOG = [];
  window.FX_ANC = {};
  const ancLoaded = new Set();
  async function loadAnc(rig) {
    if (ancLoaded.has(rig)) return;
    ancLoaded.add(rig);
    for (const clip of ['atk', 'skill']) {
      try {
        const r = await fetch(`tools/sdbuild/unity/proj/fx/C__${rig}__${clip}.anc.json`);
        if (r.ok) (FX_ANC[rig] || (FX_ANC[rig] = {}))[clip] = await r.json();
      } catch (e) { /* no projectiles in this clip */ }
    }
  }
  const nb = ONLY ? Math.min(+ONLY, batches.length) : batches.length;
  for (let b = 0; b < nb; b++) {
    const g = 9 + (b % (S.total() - 8)), plan = S.plan(g); // chapters 2-3: longer fights, so skills come round
    const lineup = batches[b].map(([id, star], i) => [id, cells[i][0], cells[i][1], star, []]);
    await B.showWave({ lineup, plan, stage: g, wave: plan.waves, baseHp: 999, seed: 1000 + b, upgrades: { atk: 2.5, hp: HP, levels: {} } }, ['test', 'test']);
    for (const u of B.units()) await loadAnc(u.rig);
    B.start();
    let t = 0;
    while (B.running && t < 150) { B.tick(2); t += 2; await new Promise((r) => setTimeout(r, 0)); }
    say(`battle ${b + 1}/${nb} stage ${g} … log ${FX_SYNC_LOG.length}`);
  }
  const L = FX_SYNC_LOG;
  const fired = L.filter((x) => x[0] !== 'cut' && x[0] !== 'place');
  const eff = fired.filter((x) => x[5] >= 0).map((x) => Math.abs(x[5] - x[2]));
  const raw = fired.filter((x) => x[3] >= 0).map((x) => Math.abs(x[3] - x[2]));
  const place = L.filter((x) => x[0] === 'place').map((x) => x[4]);
  const cut = L.filter((x) => x[0] === 'cut');
  const tlAll = new Set(), tlFired = new Set();
  for (const [uid, star] of pool) { const rig = B.skinOf(uid, star); for (const c of ['atk', 'skill']) if (FX_META.timelines[rig] && FX_META.timelines[rig][c]) tlAll.add(rig + ':' + c); }
  for (const x of fired) tlFired.add(x[0] + ':' + x[1]);
  const pct = (a, f) => (a.length ? (a.filter(f).length / a.length * 100).toFixed(1) : '-') + '%';
  const mean = (a) => (a.length ? (a.reduce((p, q) => p + q, 0) / a.length) : 0);
  const res = {
    battles: nb,
    effects: fired.length,
    timingExact: pct(eff, (e) => e < 1e-3), timingMeanMs: (mean(eff) * 1000).toFixed(2), rawLateMeanMs: (mean(raw) * 1000).toFixed(1),
    shots: place.length, placeWithin3: pct(place, (e) => e <= 3), placeMean: mean(place).toFixed(2) + '%', placeMax: (place.length ? Math.max(...place) : 0).toFixed(2) + '%',
    unitTimelines: tlAll.size, unitTimelinesFired: [...tlAll].filter((k) => tlFired.has(k)).length,
    rigsFired: new Set(fired.map((x) => x[0])).size, enemyRigsFired: new Set(fired.filter((x) => x[0].startsWith('e_')).map((x) => x[0])).size,
    cut: cut.length, cutAlive: cut.filter((x) => x[6]).length,
    notFired: [...tlAll].filter((k) => !tlFired.has(k)),
    worstPlace: L.filter((x) => x[0] === 'place').sort((p, q) => q[4] - p[4]).slice(0, 8).map((x) => `${x[1]}:${x[2]}@${x[3]} ${x[4].toFixed(1)}%`),
  };
  window.FXBATTLE = res;
  say('FXBATTLE ' + JSON.stringify(res, null, 1));
})();
