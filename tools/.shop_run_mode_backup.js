// Run mode UI: shop, bench, drag and drop onto the formation, rounds. Logic lives in js/run.js,
// battles in js/sim.js + js/battle.js (window.BATTLE). Not used in ?sandbox.
(function () {
  'use strict';
  const B = window.BATTLE;
  if (!B || B.MODE !== 'run') return;
  const RO = window.ROSTER;
  const $ = (id) => document.getElementById(id);
  let run = null;
  let phase = 'prep'; // prep | fight | result

  const ENEMY_NAMES = ['철충 정찰대', '철충 선발대', '철충 돌격대', '철충 강습대', '철충 기갑대', '철충 사령부'];
  const icon = (id, star = 1) => `assets/icons/${B.skinOf(id, star, 'icons')}.webp`; // ★2 / ★3 show the skin portrait

  function toast(msg, ok) {
    const t = $('toast');
    t.textContent = msg;
    t.className = ok ? 'ok' : '';
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 1600);
  }

  // ---------- rendering ----------
  function chipHtml(u) {
    const d = RO.BY_ID[u.id];
    return `<div class="chip t${d.tier}" data-key="${u.key}"><div class="pic" style="background-image:url(${icon(u.id, u.star)})"></div>` +
      `<div class="nm">${d.name}</div>${u.star > 1 ? `<span class="stars">${'★'.repeat(u.star)}</span>` : ''}</div>`;
  }

  function renderHud() {
    $('rHp').textContent = run.hp;
    $('rRound').textContent = run.round;
    $('rRounds').textContent = run.RULES.rounds;
    $('rGold').textContent = run.gold;
    $('rLv').textContent = run.level;
    const need = run.RULES.xpNeed[run.level];
    $('rXp').style.width = need ? (run.xp / need * 100) + '%' : '100%';
    $('rCap').textContent = run.boardCount() + '/' + run.cap();
    $('btnReroll').disabled = phase !== 'prep' || run.gold < run.RULES.reroll;
    $('btnXp').disabled = phase !== 'prep' || run.gold < run.RULES.xpCost || run.level >= run.RULES.maxLevel;
    $('btnFight').disabled = phase !== 'prep';
  }

  function renderBench() {
    const el = $('bench');
    el.innerHTML = run.bench.map((u, i) => `<div class="slot" data-bench="${i}">${u ? chipHtml(u) : ''}</div>`).join('');
  }

  // synergy steps a card would switch on if it joined the formation (it must be a unit not fielded yet)
  function synergyGain(id) {
    if (!window.Synergy) return [];
    const now = run.lineup();
    if (now.some((x) => x[0] === id)) return [];
    const before = {};
    for (const x of Synergy.compute(now, RO)) before[x.key] = x.level;
    return Synergy.compute(now.concat([[id, 0, 0, 1]]), RO).filter((x) => x.level > (before[x.key] || 0)).map((x) => x.name + ' ' + x.steps[x.level - 1]);
  }

  function renderShop() {
    const owned = {};
    for (const x of run.units()) if (x.u.star === 1) owned[x.u.id] = (owned[x.u.id] || 0) + 1;
    $('shop').innerHTML = run.shop.map((id, i) => {
      if (!id) return '<div class="card sold"></div>';
      const d = RO.BY_ID[id];
      const cls = ['card', 't' + d.tier];
      if (run.gold < d.tier) cls.push('poor');
      if ((owned[id] || 0) >= 2) cls.push('pair');
      const gain = synergyGain(id);
      const squad = window.Synergy && Synergy.hasSquad(d.squad) ? d.squadName : '';
      return `<div class="${cls.join(' ')}" data-shop="${i}" data-id="${id}"><div class="pic" style="background-image:url(${icon(id)})"></div>` +
        `<span class="cost">${d.tier}</span>${gain.length ? `<span class="gain">▲ ${gain.join(', ')}</span>` : ''}` +
        `<div class="meta"><div class="nm"><span class="tier t${d.tier}">${RO.TIER_NAME[d.tier]}</span>${d.name}</div>` +
        `<div class="tg">${RO.CLASS_NAME[d.cls]} ${RO.ROLE_NAME[d.role]}${squad ? ' · ' + squad : ''}</div></div></div>`;
    }).join('');
  }

  // drop zones over the six player cells, positioned from the 3D layout
  function renderZones() {
    const z = $('zones');
    let h = '';
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 3; row++) {
        const r = B.cellRect(0, col, row);
        const filled = !!run.board[col + ',' + row];
        h += `<div class="zone${filled ? ' filled' : ''}" data-col="${col}" data-row="${row}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>`;
      }
    }
    z.innerHTML = h;
  }

  function renderAll() {
    renderHud(); renderBench(); renderShop(); renderZones();
  }

  let showTimer = 0;
  // rebuild the field (player board + next enemy) after a change; batched so fast clicks do not reload rigs each time
  function refreshField() {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      B.show(run.lineup(), run.enemy, ['오르카 지휘 부대', ENEMY_NAMES[Math.min(ENEMY_NAMES.length - 1, Math.floor((run.round - 1) / 3))] + ` (${run.round}R)`], run.round * 7919);
    }, 30);
  }
  function changed() { renderAll(); refreshField(); }

  // ---------- drag and drop (pointer events: mouse and touch) ----------
  let drag = null;

  function locFromEl(el) {
    if (!el) return null;
    const slot = el.closest('[data-bench]');
    if (slot) return { at: 'bench', i: +slot.dataset.bench };
    const zone = el.closest('.zone');
    if (zone) return { at: 'board', col: +zone.dataset.col, row: +zone.dataset.row };
    if (el.closest('#sellZone')) return { at: 'sell' };
    return null;
  }

  function onDown(e) {
    if (phase !== 'prep' || e.button > 0) return;
    const card = e.target.closest('[data-shop]');
    if (card) { // shop: click buys, no drag
      e.preventDefault();
      buy(+card.dataset.shop);
      return;
    }
    const from = locFromEl(e.target);
    if (!from || from.at === 'sell') return;
    const u = run.unitAt(from);
    if (!u) return;
    e.preventDefault();
    drag = { from, u, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
      drag.moved = true;
      const g = document.createElement('div');
      g.className = 'ghost';
      g.innerHTML = chipHtml(drag.u);
      document.body.appendChild(g);
      drag.ghost = g;
      document.body.classList.add('dragging');
      $('sellZone').textContent = `판매 ●${run.cost(drag.u.id) * run.RULES.starCost[drag.u.star]}`;
      B.hideInfo();
    }
    if (!drag.moved) return;
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    document.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const tgt = over && (over.closest('[data-bench]') || over.closest('.zone') || over.closest('#sellZone'));
    if (tgt) tgt.classList.add('hot');
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    // read the drop target while the sell zone is still shown
    const to = d.moved ? locFromEl(document.elementFromPoint(e.clientX, e.clientY)) : null;
    document.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
    document.body.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    if (!d.moved) { B.showCard(d.u.id, d.u.star); return; } // a click: show the card
    if (!to) return;
    if (to.at === 'sell') {
      const v = run.cost(d.u.id) * run.RULES.starCost[d.u.star];
      run.sell(d.from);
      toast(`${RO.BY_ID[d.u.id].name} 판매 +${v}`, true);
      changed();
      return;
    }
    if (!run.move(d.from, to)) {
      if (to.at === 'board' && d.from.at === 'bench' && run.boardCount() >= run.cap()) toast(`배치 인원 초과: 레벨 ${run.level}에서는 ${run.cap()}명까지`);
      return;
    }
    changed();
  }

  // ---------- actions ----------
  function buy(i) {
    const id = run.shop[i];
    if (!id) return;
    const before = run.log.length;
    if (!run.buy(i)) { toast(run.gold < run.cost(id) ? '골드가 부족합니다' : '대기석이 가득 찼습니다'); return; }
    const merged = run.log.slice(before).filter((l) => l.type === 'merge');
    if (merged.length) toast(`${RO.BY_ID[id].name} ${'★'.repeat(merged[merged.length - 1].star)} 합성!`, true);
    autoPlace();
    changed();
  }

  // a bought unit goes straight onto a free formation cell while there is room (tanks / short reach in front)
  function autoPlace() {
    while (run.boardCount() < run.cap()) {
      const i = run.bench.findIndex(Boolean);
      if (i < 0) return;
      const d = RO.BY_ID[run.bench[i].id];
      const front = d.role === 'tank' || d.basic.range <= 2;
      const order = front ? [[0, 1], [0, 0], [0, 2], [1, 1], [1, 0], [1, 2]] : [[1, 1], [1, 0], [1, 2], [0, 1], [0, 0], [0, 2]];
      const cell = order.find(([c, r]) => !run.board[c + ',' + r]);
      if (!cell || !run.move({ at: 'bench', i }, { at: 'board', col: cell[0], row: cell[1] })) return;
    }
  }

  function fight() {
    if (phase !== 'prep') return;
    if (!run.boardCount()) { toast('진형에 대원을 배치하세요'); return; }
    phase = 'fight';
    document.body.classList.add('fighting');
    B.hideInfo();
    renderHud();
    clearTimeout(showTimer);
    // make sure the field shows exactly this line-up before the fight starts
    B.show(run.lineup(), run.enemy, null, run.round * 7919).then(() => B.start());
  }

  B.onEnd = (e, sim) => {
    if (phase !== 'fight') return;
    phase = 'result';
    const surv = sim.units.filter((u) => u.side === 1 && u.alive).map((u) => ({ id: u.id, star: u.star || 1 }));
    const res = run.finishBattle(e.winner, surv);
    const t = $('rrTitle');
    if (run.over) {
      t.className = run.won ? 'win' : 'lose';
      t.textContent = run.won ? '작전 성공' : '작전 실패';
      $('rrSub').innerHTML = run.won ? `${run.RULES.rounds}라운드를 모두 돌파했습니다<br>남은 체력 ${run.hp}` : `${res.round}라운드에서 지휘관 체력이 바닥났습니다`;
      $('btnNext').textContent = '새 작전';
    } else {
      t.className = e.winner === 0 ? 'win' : 'lose';
      t.textContent = e.winner === 0 ? '승리' : e.winner === 1 ? '패배' : '무승부';
      $('rrSub').innerHTML = (res.damage ? `지휘관 체력 -${res.damage} (남은 ${run.hp})<br>` : '') + `수입 ●${res.gold} · 다음 ${run.round}라운드`;
      $('btnNext').textContent = '다음 라운드';
    }
    $('roundResult').hidden = false;
    renderHud();
  };

  function next() {
    $('roundResult').hidden = true;
    document.body.classList.remove('fighting');
    if (run.over) { newRun(); return; }
    phase = 'prep';
    changed();
  }

  function newRun() {
    run = Run.create({ roster: RO, seed: (Date.now() >>> 0) % 1000000 });
    phase = 'prep';
    changed();
  }

  // ---------- wiring ----------
  // hovering a shop card outlines the synergies it belongs to
  $('shop').addEventListener('pointerover', (e) => {
    const c = e.target.closest('[data-id]');
    if (!c) { B.highlightSynergy(null); return; }
    const d = RO.BY_ID[c.dataset.id];
    B.highlightSynergy(['c:' + d.cls, 's:' + d.squad]);
  });
  $('shop').addEventListener('pointerleave', () => B.highlightSynergy(null));
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; document.body.classList.remove('dragging'); });
  $('btnReroll').onclick = () => { if (phase === 'prep' && run.reroll()) { renderShop(); renderHud(); } };
  $('btnXp').onclick = () => {
    if (phase !== 'prep') return;
    const lv = run.level;
    if (run.buyXp()) { if (run.level > lv) { toast(`레벨 ${run.level}: 배치 ${run.cap()}명`, true); autoPlace(); changed(); } else renderAll(); }
  };
  $('btnFight').onclick = fight;
  $('btnNext').onclick = next;
  window.addEventListener('keydown', (e) => {
    if (phase !== 'prep') return;
    if (e.key === 'd' || e.key === 'D') $('btnReroll').click();
    if (e.key === 'f' || e.key === 'F') $('btnXp').click();
    if (e.code === 'Enter') fight();
  });
  B.onLayout = () => { if (run) renderZones(); };

  newRun();
  window.RUN = { get run() { return run; }, get phase() { return phase; } }; // debugging handle
})();
