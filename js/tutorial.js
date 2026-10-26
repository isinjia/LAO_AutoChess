// First-run tutorial: a spotlight on one element and a short card, advanced by what the player actually does
// (buy, start a wave, ...) or by "다음". Never blocks the game; "건너뛰기" ends it. Stored in the save (meta.data.tutorial).
//
//   TUTORIAL.bind(meta)          once, before the lobby opens (js/shop.js)
//   TUTORIAL.signal(name, info)  game events: lobby, stage, buy, move, merge, fight, waveEnd, levelUp, stageEnd
(function () {
  'use strict';
  let meta = null;
  let step = null; // current step
  let queue = [];
  let timer = 0;

  // each step: target (selector or function returning an element / rect), text, and either `wait` (a signal) or a "다음" button
  const STEPS = {
    lobby: [
      { target: '#btnOperation', text: '<b>오르카 방어전</b>에 오신 것을 환영합니다, 사령관님.<br>철충의 공세를 막아 기지를 지켜야 합니다. <b>작전 개시</b>를 눌러 주세요.', wait: 'page' },
      { target: '#btnSortie', text: '챕터 1의 첫 작전 <b>1-1</b>입니다. 상점에는 <b>편성</b>한 대원 6명만 같은 확률로 나옵니다(지금은 자동 편성). <b>출격</b>하세요.', wait: 'stage' },
    ],
    stage: [
      { target: '#shop', text: '<b>상점</b>입니다. 카드를 누르면 대원을 영입합니다.<br>카드 왼쪽 위 숫자가 가격(골드)입니다. 한 명 영입해 보세요.', wait: 'buy' },
      { target: '#zones', text: '영입한 대원은 <b>3×3 진형</b>에 자동으로 배치됩니다. 끌어서 다른 칸으로 옮길 수 있어요.<br>오른쪽 앞줄에는 보호기와 사거리가 짧은 대원, 왼쪽 뒷줄에는 원거리 대원이 좋습니다.' },
      { target: '.rbRes', text: '골드가 남았다면 더 영입하세요. 위쪽에 <b>배치 인원</b>이 표시됩니다.<br>같은 대원 <b>2명</b>이 모이면 한 단계 높은 별로 합성됩니다(최대 <b>★7</b>). 은별부터 스킨이 바뀌어요.' },
      { target: '#btnFight', text: '준비가 끝나면 <b>웨이브 시작</b>!<br>철충은 오른쪽에서 레인을 따라 다가옵니다. 막지 못한 철충은 왼쪽 <b>기지 체력</b>을 깎습니다.', wait: 'fight' },
    ],
    afterWave1: [
      { target: '#btnXp', text: '웨이브를 막을 때마다 <b>골드</b>를 받습니다(10골드마다 이자도 붙어요).<br><b>경험치</b>를 사서 레벨을 올리면 진형에 세울 수 있는 인원이 늘어납니다.' },
      { target: '#synL', text: '같은 분류(경장·기동·중장)나 같은 원작 부대가 모이면 <b>시너지</b>가 켜집니다.<br>상점 카드의 <b>▲ 표시</b>는 영입하면 새로 켜지는 시너지입니다.' },
      { target: '#bench', text: '자리가 없는 대원은 <b>대기석</b>에서 기다립니다.<br>필요 없는 대원은 상점 쪽으로 끌어다 놓으면 <b>판매</b>할 수 있어요. 같은 장비 2개도 자동으로 합성됩니다. 이제 8웨이브까지 막아 보세요!' },
    ],
    elite: [{ target: '#status', text: '다음은 <b>엘리트 웨이브</b>입니다. 단단하고 강한 철충이 섞여 나옵니다.<br>막으면 골드를 4 더 받고, 장비 보상을 고를 수 있습니다.' }],
    boss: [{ target: '#status', text: '<b>마지막 웨이브</b>입니다! 스테이지 대장이나 보스가 나옵니다. 보스는 <b>기믹</b>(소환·방어막·봉인·재생)이 있어요.<br>위 상태줄의 힌트를 보고 진형을 다듬으세요.' }],
    lobbyAfter: [
      { target: '.lhMenu .mRow', text: '이야기가 진행되면 <b>대원</b>이 합류하고, 챕터를 깰 때마다 <b>전 대원이 강해집니다</b>.<br><b>편성</b>에서 데려갈 6명을 고르세요. 새로 합류한 대원은 <b>대원</b>에서 볼 수 있습니다.', last: true },
    ],
  };

  function el(id) { return document.getElementById(id); }
  function ensureDom() {
    if (el('tut')) return;
    const d = document.createElement('div');
    d.id = 'tut';
    d.hidden = true;
    d.innerHTML = '<div class="tutSpot"></div><div class="tutCard"><div class="tutText"></div><div class="tutBtns"><button class="quiet" id="tutSkip">건너뛰기</button><button class="primary" id="tutNext">다음</button></div></div>';
    document.getElementById('stage').appendChild(d);
    el('tutSkip').onclick = () => finish();
    el('tutNext').onclick = () => advance();
  }

  function rectOf(target) {
    const nodes = typeof target === 'function' ? [target()] : [...document.querySelectorAll(target)];
    const rs = nodes.filter(Boolean).map((n) => n.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (target === '#zones') { // the drop zones themselves, not the full-screen layer
      const z = [...document.querySelectorAll('.zone')].map((n) => n.getBoundingClientRect());
      if (z.length) rs.splice(0, rs.length, ...z);
    }
    if (!rs.length) return null;
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    const r = Math.max(...rs.map((x) => x.right)), b = Math.max(...rs.map((x) => x.bottom));
    return { left: l, top: t, width: r - l, height: b - t };
  }

  function place() {
    if (!step) return;
    let r = rectOf(step.target);
    const spot = document.querySelector('#tut .tutSpot'), card = document.querySelector('#tut .tutCard');
    // screen rectangles -> stage (design) pixels: the stage is scaled to the screen
    // (window.toStageRect also undoes the quarter turn of a portrait screen)
    const st = el('stage'), stage = { left: 0, top: 0, width: st.offsetWidth, height: st.offsetHeight };
    if (r) r = window.toStageRect({ left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height });
    if (r) {
      const pad = 6;
      Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    } else spot.style.display = 'none';
    // the card goes below the target if there is room, else above
    const cw = Math.min(360, stage.width - 24);
    card.style.width = cw + 'px';
    const ch = card.offsetHeight || 120;
    let top = r ? r.top - stage.top + r.height + 14 : stage.height / 2 - ch / 2;
    if (r && top + ch > stage.height - 8) top = r.top - stage.top - ch - 14;
    let left = r ? r.left - stage.left + r.width / 2 - cw / 2 : stage.width / 2 - cw / 2;
    card.style.left = Math.max(12, Math.min(stage.width - cw - 12, left)) + 'px';
    card.style.top = Math.max(8, top) + 'px';
  }

  function show(s) {
    ensureDom();
    step = s;
    el('tut').hidden = false;
    document.querySelector('#tut .tutText').innerHTML = s.text;
    el('tutNext').style.display = s.wait ? 'none' : '';
    el('tutNext').textContent = s.last ? '시작하기' : '다음';
    place();
    clearInterval(timer);
    timer = setInterval(place, 300); // the layout moves (rigs load, panels re-render)
  }
  function hide() { step = null; if (el('tut')) el('tut').hidden = true; clearInterval(timer); }
  function run(name) {
    if (!active()) return;
    queue = (STEPS[name] || []).slice();
    advance();
  }
  function advance() {
    const s = queue.shift();
    if (!s) { if (step && step.last) finish(); else hide(); return; }
    show(s);
  }
  function finish() {
    hide();
    queue = [];
    if (meta) { meta.data.tutorial = true; meta.save(); }
  }
  function active() { return !!meta && !meta.data.tutorial; }

  const seen = {};
  function signal(name, info = {}) {
    if (!active()) return;
    if (step && step.wait === name) advance();
    if (name === 'lobby') {
      if (meta.data.stats.runs > 0 && !seen.lobbyAfter) { seen.lobbyAfter = 1; run('lobbyAfter'); } else if (!meta.data.stats.runs && !seen.lobby) { seen.lobby = 1; run('lobby'); }
    }
    if (name === 'stage' && !seen.stage) { seen.stage = 1; setTimeout(() => run('stage'), 400); }
    if (name === 'waveEnd') {
      if (info.wave === 1 && !seen.w1) { seen.w1 = 1; run('afterWave1'); }
      if (info.elite && !seen.elite) { seen.elite = 1; run('elite'); }
      if (info.boss && !seen.boss) { seen.boss = 1; run('boss'); }
    }
    if (name === 'fight' && step && !step.wait) hide(); // the player started a wave while a card was up
  }

  window.addEventListener('resize', () => place());
  window.TUTORIAL = { bind(m) { meta = m; }, signal, active, finish };
})();
