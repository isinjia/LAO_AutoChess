// Game UI (not in ?sandbox): title (save slots), lobby (stages, deck, members) and stage play (shop, bench, 3x3 formation,
// waves), the story scenes and the ending / next cycle.
// Logic: js/meta.js (permanent), js/stage.js (one stage), js/wavesim.js (one wave); field: js/battle.js (window.BATTLE).
(function () {
  'use strict';
  const B = window.BATTLE;
  if (!B || B.MODE !== 'run') return;
  const RO = window.ROSTER;
  const $ = (id) => document.getElementById(id);
  let meta = null; // the save slot being played (js/meta.js), picked on the title screen
  let st = null; // the stage being played
  let phase = 'lobby'; // lobby | prep | fight | result

  const S = window.STORY;
  const bossOf = (g) => WaveSim.bossInfo(meta ? meta.plan(g) : S.plan(g), window.LAO_ENEMIES); // null on a captain (elite) stage
  let chapterSel = 1;
  const icon = (id, star = 1) => `assets/icons/${B.skinOf(id, star, 'icons')}.webp`; // ★2 / ★3 show the skin portrait
  const card = (id, star = 1) => `assets/cards/${B.skinOf(id, star, 'icons')}.webp`; // whole-face bust (deck / member screens)
  const fmt = (n) => n.toLocaleString('ko-KR');
  const A = window.AUDIO;
  const T = window.TUTORIAL || { signal() {}, active: () => false }; // first-run tutorial (js/tutorial.js)

  // the bottom panel comes and goes with the lobby: the field (canvas, background, cells) must be measured again
  function relayout() { window.dispatchEvent(new Event('resize')); }
  function toast(msg, ok) {
    const t = $('toast');
    t.textContent = msg;
    t.className = ok ? 'ok' : '';
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 1700);
  }

  // =====================================================================================
  // lobby: a home screen (secretary, banner, menu) and full-screen pages with a back button
  // =====================================================================================
  const PAGES = {
    stage: ['작전', 'OPERATION'], deck: ['편성', 'DECK'], units: ['대원', 'MEMBERS'],
    archive: ['기록', 'ARCHIVE'], settings: ['설정', 'SETTINGS'],
  };
  let page = 'home';
  let stageSel = 1, unitSel = null;
  const SEC_KEY = 'lao_lobby_secretary';
  const L = window.L2D;
  function secretary() {
    let id = null;
    try { id = localStorage.getItem(SEC_KEY); } catch (e) { /* private window */ }
    return L && L.MODELS[id] ? id : 'harpy';
  }
  const nextStage = () => Math.min(meta.data.stageCleared + 1, S.total());
  const stars = () => Math.min(meta.data.stageCleared, S.total());
  function stageState(g) { return g <= meta.data.stageCleared ? 'cleared' : meta.stageOpen(g) ? 'open' : 'locked'; }

  function renderTop() {
    $('lobbyCycle').textContent = meta.data.cycle;
    $('lobbyStars').textContent = stars();
    $('lobbyStarsMax').textContent = '/' + S.total();
    $('profLv').textContent = 1 + meta.data.stageCleared;
    $('profXp').style.width = Math.round((meta.data.stageCleared % S.PER_CHAPTER) / S.PER_CHAPTER * 100) + '%';
    $('profPic').src = icon(secretary());
  }
  function renderLobby() {
    if (page === 'home') page = 'stage'; // no mobile-style home: the operation map is the hub
    renderTop();
    const home = false;
    $('lobbyHome').hidden = !home;
    $('lobbyPage').hidden = home;
    $('lobby').dataset.page = page;
    if (home) { renderHome(); return; }
    if (L) L.pause(true);
    $('pgTitle').textContent = PAGES[page][0];
    $('pgEn').textContent = PAGES[page][1];
    ({ stage: renderStagePage, deck: renderDeckPage, units: renderUnitsPage, archive: renderArchivePage, settings: renderSettingsPage })[page]();
  }
  function go(p) {
    if (p === 'home') { if (page === 'stage') { meta.save(); showTitle(); return; } p = 'stage'; } // back: pages -> map -> title
    if (p === page) return;
    page = p;
    if (p === 'stage') { stageSel = nextStage(); chapterSel = S.at(stageSel).chapter.id; }
    renderLobby();
    T.signal('page', { page: p });
  }

  // ---------- home ----------
  function renderHome() {
    const g = nextStage(), a = S.at(g), ch = a.chapter, b = bossOf(g);
    const done = Math.max(0, Math.min(S.PER_CHAPTER, meta.data.stageCleared - (ch.id - 1) * S.PER_CHAPTER));
    B.setBg(ch.bg);
    $('homeBanner').style.backgroundImage = `linear-gradient(90deg, rgba(8,9,12,.92) 30%, rgba(8,9,12,.2)), url(${ch.bg})`;
    $('homeBanner').innerHTML = `<span class="bTag">${meta.data.cycle >= 2 ? `NEW GAME+ · ${meta.data.cycle}회차` : 'MAIN STORY'}</span><div class="bCh">CHAPTER ${ch.id}</div><div class="bT">${ch.title}</div>` +
      `<div class="bProg"><span><i style="width:${done / S.PER_CHAPTER * 100}%"></i></span><b>${done}</b>/${S.PER_CHAPTER}</div>`;
    $('homeNext').innerHTML = `<span class="nL">NEXT</span><b>${a.code}</b> ${a.stage.name}<span class="nB">${b ? '보스 · ' + b.name : '대장 · 엘리트 철충'}</span>`;
    $('homeCur').textContent = `${a.code} ${a.stage.name}`;
    const sec = secretary();
    $('secName').innerHTML = `<small>부관</small>${L ? L.MODELS[sec].name : RO.BY_ID[sec].name}`;
    if (L) { L.show(sec); L.pause(false); }
  }

  // ---------- operation: chapter list, stage map, detail ----------
  // stage nodes on the map (percent of the map box): a winding route from the landing point to the boss
  const ROUTE = [[7, 70], [19, 44], [31, 70], [43, 42], [55, 68], [67, 38], [79, 62], [91, 32]];
  function renderStagePage() {
    const chs = S.CHAPTERS, ch = chs[chapterSel - 1];
    const chOpen = (c) => meta.stageOpen((c - 1) * S.PER_CHAPTER + 1);
    B.setBg(ch.bg);
    let h = '<div class="opWrap"><div class="chList">' + chs.map((c) => {
      const open = chOpen(c.id), first = (c.id - 1) * S.PER_CHAPTER;
      const done = Math.max(0, Math.min(S.PER_CHAPTER, meta.data.stageCleared - first));
      return `<button class="chCard${c.id === chapterSel ? ' on' : ''}" data-ch="${c.id}" ${open ? '' : 'disabled'} style="background-image:linear-gradient(90deg, rgba(8,9,12,.9) 35%, rgba(8,9,12,.35)), url(${c.bg})">` +
        `<span class="cN">CHAPTER ${c.id}</span><span class="cT">${c.title}</span><span class="cP">${open ? `${done}/${S.PER_CHAPTER}` : '🔒 잠김'}</span></button>`;
    }).join('') + '</div>';
    const pts = ROUTE.map(([x, y]) => `${x},${y}`).join(' ');
    h += `<div class="opMap"><div class="mapHead"><b>CHAPTER ${ch.id}</b> ${ch.title}<small>${ch.sub}</small></div>` +
      `<svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
    for (let i = 0; i < S.PER_CHAPTER; i++) {
      const g = (ch.id - 1) * S.PER_CHAPTER + i + 1, a = S.at(g), b = bossOf(g), s = stageState(g);
      const [x, y] = ROUTE[i];
      h += `<button class="node ${s}${b ? ' boss' : ''}${g === stageSel ? ' sel' : ''}" data-sel="${g}" style="left:${x}%;top:${y}%" ${s === 'locked' ? 'disabled' : ''}>` +
        `<span class="nd">${a.code}</span><span class="nn">${a.stage.name}</span>${s === 'cleared' ? '<span class="ck">CLEAR</span>' : b ? '<span class="ck bs">BOSS</span>' : ''}</button>`;
    }
    h += '</div>';
    const g = stageSel, a = S.at(g), b = bossOf(g), s = stageState(g), best = meta.data.best[g] || 0, plan = meta.plan(g);
    const joins = a.last && meta.data.cycle === 1 ? (S.JOIN[a.chapter.id] || []) : [];
    const first = g > meta.data.stageCleared;
    h += `<div class="opDetail"><div class="dCode">${a.code}${meta.data.cycle >= 2 ? `<em class="ngTag">${meta.data.cycle}회차</em>` : ''}</div><div class="dName">${a.stage.name}</div>` +
      '<div class="dSec"><span class="dL">적 정보</span>' +
      (b ? `<div class="dBoss boss"><b>보스</b>${b.name}${b.cruel ? ' <em>강화</em>' : ''}</div><div class="dGim">${b.gimNames.map((x) => `<span>${x}</span>`).join('')}</div><p class="dTip">${b.tip}</p>`
        : '<div class="dBoss"><b>대장</b>엘리트 철충</div><p class="dTip">마지막 웨이브에 단단한 대장 철충이 나옵니다.</p>') + '</div>' +
      `<div class="dSec"><span class="dL">작전 정보</span><div class="dRows"><span>웨이브</span><b>${plan.waves}</b><span>엘리트</span><b>${plan.eliteWave}웨이브</b><span>최고 기록</span><b>${s === 'cleared' ? '클리어' : best ? best + '웨이브' : '-'}</b></div></div>` +
      `<div class="dSec"><span class="dL">보상</span><div class="dRew">${a.last && first ? '<span class="pill">챕터 보상 · 전 대원 +4%</span>' : ''}${joins.length && first ? `<span class="pill">합류 ${joins.length}명</span>` : ''}<span class="pill">장비 보상</span></div></div>` +
      `<div class="dSec"><span class="dL">편성 ${meta.data.deck.length}/${DECK_N()}</span>${deckStrip(meta.data.deck)}<button class="quiet dEdit" data-page="deck">편성 변경</button></div>` +
      '<div class="dBtns">' + (meta.data.seen['s' + g] ? `<button class="quiet story" data-replay="s${g}" title="스토리 다시 보기">STORY</button>` : '') +
      `<button class="primary sortie" id="btnSortie" data-go="${g}" ${s === 'locked' ? 'disabled' : ''}><b>출격</b><small>SORTIE</small></button></div></div></div>`;
    $('lobbyBody').innerHTML = h;
    // the chapter column scrolls on its own (8 cards do not fit the 720 design height): keep the open chapter in view
    const cl = $('lobbyBody').querySelector('.chList'), on = cl && cl.querySelector('.chCard.on');
    if (on) cl.scrollTop += window.toStageRect(on.getBoundingClientRect()).top - window.toStageRect(cl.getBoundingClientRect()).top - (cl.clientHeight - on.offsetHeight) / 2;
  }

  // ---------- members: the squad (joined) and who joins later ----------
  function joinText(id) {
    const c = meta.joinsAfter(id);
    return c ? `${c}장 클리어 후 합류` : '처음부터 합류';
  }
  function renderUnitsPage() {
    const list = RO.ROSTER.slice().sort((a, b) => (meta.isUnlocked(b.id) - meta.isUnlocked(a.id)) || meta.joinsAfter(a.id) - meta.joinsAfter(b.id) || b.tier - a.tier || a.name.localeCompare(b.name, 'ko'));
    if (!unitSel || !RO.BY_ID[unitSel]) unitSel = list[0].id;
    let h = '<div class="uWrap"><div class="uGrid">' + list.map((d) => {
      const on = meta.isUnlocked(d.id);
      return `<button class="uTile t${d.tier}${on ? '' : ' locked'}${d.id === unitSel ? ' sel' : ''}" data-usel="${d.id}" style="background-image:url(${card(d.id)})">` +
        `<img class="ricon" src="${B.roleIcon(d)}" alt=""><span class="rk">${RO.TIER_NAME[d.tier]}</span><span class="nm">${on ? d.name : '???'}</span>${on ? '' : `<span class="lk">${meta.joinsAfter(d.id)}장</span>`}</button>`;
    }).join('') + '</div>';
    const d = RO.BY_ID[unitSel], on = meta.isUnlocked(d.id), bon = meta.upgrades();
    h += `<div class="uDetail t${d.tier}${on ? '' : ' locked'}"><div class="uArt" style="background-image:url(${card(d.id)})"><span class="rk">${RO.TIER_NAME[d.tier]}</span></div>` +
      `<div class="uHead"><img class="ricon" src="${B.roleIcon(d)}" alt=""><div><div class="uName">${on ? d.name : '합류 전'}</div><div class="uFull">${on ? d.fullName || '' : joinText(d.id)}</div></div></div>` +
      `<div class="uTags"><span>${RO.CLASS_NAME[d.cls]}</span><span>${RO.ROLE_NAME[d.role]}</span>${d.squadName ? `<span>${d.squadName}</span>` : ''}</div>` +
      `<div class="dRows"><span>체력</span><b>${fmt(Math.round(d.hp * bon.hp))}</b><span>공격력</span><b>${fmt(Math.round(d.atk * bon.atk))}</b><span>방어력</span><b>${d.def}</b><span>사거리</span><b>${d.basic.range}</b></div>` +
      `<div class="uSk"><span class="dL">스킬</span><div>${d.basic.name || '기본 공격'}</div><div>${d.skill.name || '-'}</div></div>` +
      `<p class="hint">${on ? `챕터 보상으로 전 대원 공격력·체력 +${Math.round((bon.atk - 1) * 100)}% 적용 중` : joinText(d.id)}</p>` +
      `<div class="uBtns"><button class="quiet" data-info="${d.id}">상세</button></div></div></div>`;
    $('lobbyBody').innerHTML = h;
  }

  // ---------- deck: the 6 units taken into a stage (the shop draws only these, all equally likely) ----------
  let deckSlot = -1, deckRole = 'all';
  const DECK_N = () => meta.RULES.deckSize;
  function deckSynergies(ids) {
    return Synergy.compute(ids.map((id) => [id, 0, 0, 1]), RO).filter((x) => x.count >= 2 || x.level > 0);
  }
  function deckStrip(ids, cls = '') { // small portraits (operation detail)
    let h = `<div class="dDeck ${cls}">`;
    for (let i = 0; i < DECK_N(); i++) {
      const id = ids[i], d = id && RO.BY_ID[id];
      h += d ? `<span class="dd t${d.tier}" style="background-image:url(${card(id)})" title="${d.name}"><img class="ricon" src="${B.roleIcon(d)}" alt=""></span>` : '<span class="dd empty"></span>';
    }
    return h + '</div>';
  }
  function renderDeckPage() {
    const deck = meta.data.deck.slice(0, DECK_N());
    let h = '<div class="dkWrap"><div class="dkTop"><div class="dkSlots">';
    for (let i = 0; i < DECK_N(); i++) {
      const id = deck[i], d = id && RO.BY_ID[id];
      h += d ? `<button class="dkSlot t${d.tier}${i === deckSlot ? ' sel' : ''}" data-dslot="${i}" style="background-image:url(${card(id)})">` +
        `<span class="no">${i + 1}</span><img class="ricon" src="${B.roleIcon(d)}" alt=""><span class="rk">${RO.TIER_NAME[d.tier]}</span>` +
        `<span class="nm">${d.name}</span><span class="tg">${RO.CLASS_NAME[d.cls]} ${RO.ROLE_NAME[d.role]}</span><span class="out" data-dout="${i}" title="빼기">✕</span></button>`
        : `<button class="dkSlot empty${i === deckSlot ? ' sel' : ''}" data-dslot="${i}"><span class="no">${i + 1}</span><span class="plus">+</span></button>`;
    }
    h += '</div><div class="dkSide"><div class="dkInfo"><b>편성</b> <span>' + deck.length + '/' + DECK_N() + '</span><p>상점에는 편성한 대원만 같은 확률로 나옵니다. 아래에서 대원을 눌러 넣고, 칸을 누른 뒤 대원을 누르면 바꿉니다.</p></div>' +
      '<div class="dkSyn">' + (deckSynergies(deck).map((x) => `<span class="${x.level ? 'on' : ''}" title="${x.steps.join('/')}">${x.name} <b>${x.count}</b></span>`).join('') || '<span>시너지 없음</span>') + '</div>' +
      '<div class="dkBtns"><button id="btnAutoDeck">자동 편성</button><button id="btnClearDeck" class="quiet">비우기</button></div></div></div>';
    // the unlocked units, filtered by role
    const roles = [['all', '전체'], ['tank', '보호기'], ['attacker', '공격기'], ['support', '지원기']];
    h += '<div class="dkFilter">' + roles.map(([k, n]) => `<button data-drole="${k}" class="${deckRole === k ? 'on' : ''}">${n}</button>`).join('') + '</div><div class="dkGrid">';
    const list = meta.data.unlocked.filter((id) => RO.BY_ID[id] && (deckRole === 'all' || RO.BY_ID[id].role === deckRole))
      .sort((a, b) => RO.BY_ID[b].tier - RO.BY_ID[a].tier || RO.BY_ID[a].name.localeCompare(RO.BY_ID[b].name, 'ko'));
    for (const id of list) {
      const d = RO.BY_ID[id], k = deck.indexOf(id);
      h += `<button class="uTile t${d.tier}${k >= 0 ? ' inDeck' : ''}" data-dpick="${id}" style="background-image:url(${card(id)})">` +
        `<img class="ricon" src="${B.roleIcon(d)}" alt=""><span class="rk">${RO.TIER_NAME[d.tier]}</span><span class="nm">${d.name}</span>${k >= 0 ? `<span class="inNo">${k + 1}</span>` : ''}</button>`;
    }
    $('lobbyBody').innerHTML = h + '</div></div>';
  }
  function deckPick(id) {
    const deck = meta.data.deck.slice(0, DECK_N());
    const k = deck.indexOf(id);
    if (deckSlot >= 0) { // replace the chosen slot (swap when the unit is already in the deck)
      if (k >= 0) { deck[k] = deck[deckSlot]; }
      if (deckSlot < deck.length) deck[deckSlot] = id; else deck.push(id);
      deckSlot = -1;
    } else if (k >= 0) deck.splice(k, 1);
    else if (deck.length < DECK_N()) deck.push(id);
    else { toast('편성이 가득 찼습니다. 바꿀 칸을 먼저 누르세요'); return; }
    meta.setDeck(deck.filter(Boolean));
    A.voice(id, 'SortiePick');
  }

  // ---------- archive: story replays ----------
  function renderArchivePage() {
    $('lobbyBody').innerHTML = '<div class="aWrap">' + S.CHAPTERS.map((c) => {
      const items = [];
      items.push(meta.data.seen['c' + c.id] ? `<button data-replay="c${c.id}">프롤로그</button>` : '<button disabled>프롤로그 🔒</button>');
      for (let i = 0; i < S.PER_CHAPTER; i++) {
        const g = (c.id - 1) * S.PER_CHAPTER + i + 1, a = S.at(g);
        items.push(meta.data.seen['s' + g] ? `<button data-replay="s${g}">${a.code} ${a.stage.name}</button>` : `<button disabled>${a.code} 🔒</button>`);
      }
      items.push(meta.data.seen['o' + c.id] ? `<button data-replay="o${c.id}">에필로그</button>` : '<button disabled>에필로그 🔒</button>');
      return `<div class="aCh" style="background-image:linear-gradient(90deg, rgba(8,9,12,.94) 40%, rgba(8,9,12,.55)), url(${c.bg})"><div class="aHead"><span class="cN">CHAPTER ${c.id}</span><b>${c.title}</b><small>${c.sub}</small></div><div class="aList">${items.join('')}</div></div>`;
    }).join('') + '</div>';
  }

  // ---------- settings ----------
  function renderSettingsPage() {
    const v = A.settings;
    const slider = (k, label) => `<label class="vol"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${v[k]}" data-vol="${k}"><b>${Math.round(v[k] * 100)}</b></label>`;
    $('lobbyBody').innerHTML = '<div class="sWrap"><div class="sBox"><div class="dL">사운드</div>' + slider('bgm', '배경음악') + slider('sfx', '효과음') + slider('voice', '캐릭터 보이스') +
      `<label class="vol"><span>전체 음소거</span><input type="checkbox" id="muteAll" ${v.mute ? 'checked' : ''}></label></div>` +
      '<div class="sBox"><div class="dL">게임</div><label class="vol htagSet"><span>머리 위 아이콘 표시</span><input type="checkbox" id="headIcons" ' + (meta.data.headIcons !== false ? 'checked' : '') + '></label><div class="setRow"><button id="btnTutorial">튜토리얼 다시 보기</button><button id="btnTitle">타이틀로</button><button id="btnResetSave" class="quiet">이 슬롯 지우기</button></div>' +
      `<div class="dRows"><span>슬롯</span><b>${meta.slot}</b><span>회차</span><b>${meta.data.cycle}회차</b><span>진행</span><b>${stars()}/${S.total()}</b><span>플레이 시간</span><b>${playTime(meta.data.playSec)}</b><span>출격</span><b>${meta.data.stats.runs}회</b><span>클리어</span><b>${meta.data.stats.clears}회</b></div></div></div>`;
  }

  function openLobby() {
    phase = 'lobby';
    document.body.classList.add('lobby');
    document.body.classList.remove('fighting');
    relayout();
    $('lobby').hidden = false;
    $('roundResult').hidden = true;
    B.hideInfo();
    page = 'stage';
    stageSel = nextStage(); chapterSel = S.at(stageSel).chapter.id;
    if (L) L.pause(true);
    renderLobby();
    A.bgm('title');
    T.signal('lobby');
  }

  $('lobby').addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.vol) { A.set(t.dataset.vol, +t.value); const b = t.parentElement.querySelector('b'); if (b) b.textContent = Math.round(t.value * 100); }
  });
  $('lobby').addEventListener('click', (e) => {
    if (e.target.id === 'muteAll') { A.set('mute', e.target.checked); return; }
    if (e.target.id === 'headIcons') { meta.data.headIcons = e.target.checked; meta.save(); B.setHeadIcons(e.target.checked); return; }
    const t = e.target.closest('button, [data-page], #l2d');
    if (!t) return;
    const out = e.target.closest('[data-dout]'); // the ✕ on a deck slot
    if (out) { A.sfx('click'); const d = meta.data.deck.slice(); d.splice(+out.dataset.dout, 1); meta.setDeck(d); deckSlot = -1; renderLobby(); return; }
    if (t.tagName === 'BUTTON' && !t.disabled) A.sfx('click');
    if (t.id === 'l2d') { const sec = secretary(); if (L && L.touch()) A.voice(sec, ['Join', 'Reinforce', 'MVP', 'SortiePick'][Math.floor(Math.random() * 4)], true); return; }
    if (t.id === 'secSwap') { const ids = L.ids, sec = ids[(ids.indexOf(secretary()) + 1) % ids.length]; try { localStorage.setItem(SEC_KEY, sec); } catch (err) { /* fine */ } renderLobby(); A.voice(sec, 'Join', true); return; }
    if (t.dataset.page) { go(t.dataset.page); return; }
    if (t.dataset.ch) { chapterSel = +t.dataset.ch; const first = (chapterSel - 1) * S.PER_CHAPTER + 1; stageSel = Math.max(first, Math.min(first + S.PER_CHAPTER - 1, nextStage())); renderLobby(); return; }
    if (t.dataset.sel) { stageSel = +t.dataset.sel; renderLobby(); return; }
    if (t.dataset.usel) { unitSel = t.dataset.usel; renderLobby(); return; }
    if (t.dataset.replay) { replay(t.dataset.replay); return; }
    if (t.dataset.go) {
      const ga = S.at(+t.dataset.go);
      if (ga.si === 0 && !meta.data.seen['c' + ga.chapter.id]) { startStage(+t.dataset.go); return; } // a new chapter: its party is set in startStage
      if (meta.data.deck.length < Math.min(DECK_N(), meta.data.unlocked.length)) { toast(`편성을 ${DECK_N()}명 채워 주세요`); go('deck'); return; }
      startStage(+t.dataset.go); return;
    }
    if (t.dataset.dslot) { const i = +t.dataset.dslot; deckSlot = deckSlot === i ? -1 : i; renderLobby(); return; }
    if (t.dataset.dpick) { deckPick(t.dataset.dpick); renderLobby(); return; }
    if (t.dataset.drole) { deckRole = t.dataset.drole; renderLobby(); return; }
    if (t.id === 'btnAutoDeck') { meta.setDeck(Meta.autoDeck(RO, meta.data.unlocked)); deckSlot = -1; renderLobby(); return; }
    if (t.id === 'btnClearDeck') { meta.setDeck([]); deckSlot = -1; renderLobby(); return; }
    if (t.id === 'btnTutorial') { meta.data.tutorial = false; meta.save(); toast('스테이지 1에 출격하면 튜토리얼이 다시 시작됩니다', true); go('home'); return; }
    if (t.id === 'btnTitle') { meta.save(); showTitle(); return; }
    if (t.id === 'btnResetSave') { if (window.confirm(`슬롯 ${meta.slot}의 진행을 모두 지울까요? 되돌릴 수 없습니다.`)) { Meta.erase(meta.slot); meta = null; showTitle(); toast('슬롯을 지웠습니다', true); } return; }
    if (t.dataset.info) B.showCard(t.dataset.info, 1);
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && phase === 'lobby' && $('story').hidden && page !== 'home') go('home'); });

  // =====================================================================================
  // stage play
  // =====================================================================================
  // ---------- story scenes (js/talk.js: the original novel screen) ----------
  // a scene: its lines, the dialogue background behind them and the place caption that opens it
  const sceneIntro = (ch) => ({ lines: ch.intro, bg: ch.introBg, place: [`CHAPTER ${ch.id}`, ch.title] });
  const sceneStage = (a) => ({ lines: a.stage.lines, bg: a.chapter.stageBg, place: [a.code, a.stage.name] });
  const sceneOutro = (ch) => ({ lines: ch.outro, bg: ch.outroBg, place: ['EPILOGUE', ch.title] });
  // new game plus scenes (js/story_ng.js, written for the 2nd cycle on)
  const NG = () => (meta && meta.data.cycle >= 2 && window.STORY_NG) || null;
  const sceneNG = (x, place) => (x && x.lines && x.lines.length ? { lines: x.lines, bg: x.bg, place } : null);
  function playStory(scenes, title, done) {
    scenes = scenes.filter((x) => x && x.lines && x.lines.length);
    if (!scenes.length) { if (done) done(); return; }
    TALK.playScenes(scenes, title).then(() => { if (done) done(); });
  }
  function replay(key) {
    const kind = key[0], n = +key.slice(1);
    if (kind === 'c' || kind === 'o') { const ch = S.CHAPTERS[n - 1]; playStory([kind === 'c' ? sceneIntro(ch) : sceneOutro(ch)], `챕터 ${ch.id} · ${ch.title}`); return; }
    const a = S.at(n); playStory([sceneStage(a)], `${a.code} ${a.stage.name}`);
  }

  function startStage(g) {
    const a = S.at(g);
    const scenes = [], ng = NG(), ngc = ng && ng.chapters && ng.chapters[a.chapter.id];
    if (ng && g === 1 && !meta.data.seen.ngp) { scenes.push(sceneNG(ng.prologue, ['NEW GAME+', `${meta.data.cycle}회차`])); meta.data.seen.ngp = 1; }
    if (a.si === 0 && !meta.data.seen['c' + a.chapter.id]) {
      const party = meta.party();
      if (party.length) { meta.setDeck(meta.partyDeck()); toast(`이번 작전 부대: ${party.map((id) => RO.BY_ID[id].name).join(', ')}`, true); }
      scenes.push(sceneIntro(a.chapter));
      if (ngc) scenes.push(sceneNG(ngc.intro, [`CHAPTER ${a.chapter.id}`, `${a.chapter.title} — 2회차`]));
      meta.data.seen['c' + a.chapter.id] = 1;
    }
    if (!meta.data.seen['s' + g]) { scenes.push(sceneStage(a)); meta.data.seen['s' + g] = 1; }
    meta.save();
    $('lobby').hidden = true;
    if (scenes.length) playStory(scenes, `${a.code} ${a.stage.name}`, () => beginStage(g)); else beginStage(g);
  }
  function beginStage(g) {
    const n = g;
    const plan = meta.plan(g);
    B.setBg(plan.bg);
    // the tutorial's first stage: three ★2 units already stand one per lane (front column), so the first waves are short
    // and nothing gets through while the player learns the shop
    const starters = T.active() && n === 1 && meta.data.cycle === 1 ? [['valkyrie', 0, 0, 2], ['leona', 0, 1, 2], ['nymph', 0, 2, 2]] : null;
    st = Stage.create({ roster: RO, stage: n, plan, seed: (Date.now() >>> 0) % 1000000, deck: meta.data.deck, pool: meta.data.unlocked, baseHp: meta.baseHp(), bonusGold: meta.bonusGold(), starters });
    $('lobby').hidden = true;
    document.body.classList.remove('lobby', 'fighting'); // straight from a result ("다음 작전"): the last fight is over
    relayout();
    phase = 'prep';
    B.hideInfo();
    A.sfx('start');
    stageBgm();
    changed();
    T.signal('stage', { stage: n });
  }
  function stageBgm() { A.bgm(st.wave >= st.waves && st.plan.final !== 'elite' ? 'boss' : st.stage % 2 ? 'battle' : 'battle2'); }

  function chipHtml(u) {
    const d = RO.BY_ID[u.id];
    return `<div class="chip t${d.tier}" data-key="${u.key}"><div class="pic" style="background-image:url(${card(u.id, u.star)})"></div>` +
      `<div class="nm">${d.name}</div>${Stars.html(u.star)}` +
      ((u.items || []).length ? `<span class="cg">${u.items.map((it) => `<img src="${Items.icon(it)}" alt="">`).join('')}</span>` : '') + '</div>';
  }
  function itemChip(it, i) {
    return `<div class="ichip md-${Stars.medal(it.tier)}" data-item="${i}" title="${Items.label(it)} · ${Items.describe(it)}"><img src="${Items.icon(it)}" alt="">${Stars.html(it.tier)}</div>`;
  }
  function renderItems() {
    const slots = [];
    for (let i = 0; i < st.RULES.maxItems; i++) slots.push(st.items[i] ? itemChip(st.items[i], i) : '<div class="ichip empty"></div>');
    $('items').innerHTML = '<span class="ilbl">장비</span>' + slots.join('');
  }

  function renderHud() {
    $('rHp').textContent = st.baseHp;
    $('rRound').textContent = st.plan.code;
    $('rStageName').textContent = S.at(st.stage).stage.name;
    $('rWave').textContent = st.wave;
    $('rRounds').textContent = st.waves;
    $('rGold').textContent = st.gold;
    $('rLv').textContent = st.level;
    const need = st.RULES.xpNeed[st.level];
    $('rXp').style.width = need ? (st.xp / need * 100) + '%' : '100%';
    $('rCap').textContent = st.boardCount() + '/' + st.cap();
    $('btnReroll').disabled = phase !== 'prep' || st.gold < st.RULES.reroll;
    $('btnXp').disabled = phase !== 'prep' || st.gold < st.RULES.xpCost || st.level >= st.RULES.maxLevel;
    $('btnFight').disabled = phase !== 'prep';
  }
  function renderBench() {
    $('bench').innerHTML = st.bench.map((u, i) => `<div class="slot" data-bench="${i}">${u ? chipHtml(u) : ''}</div>`).join('');
  }
  function synergyGain(id) {
    const now = st.lineup();
    if (now.some((x) => x[0] === id)) return [];
    const before = {};
    for (const x of Synergy.compute(now, RO)) before[x.key] = x.level;
    return Synergy.compute(now.concat([[id, 0, 0, 1]]), RO).filter((x) => x.level > (before[x.key] || 0)).map((x) => x.name + ' ' + x.steps[x.level - 1]);
  }
  function renderShop() {
    const owned = {};
    for (const x of st.units()) if (x.u.star === 1) owned[x.u.id] = (owned[x.u.id] || 0) + 1;
    $('shop').innerHTML = st.shop.map((id, i) => {
      if (!id) return '<div class="card sold"></div>';
      const d = RO.BY_ID[id];
      const cls = ['card', 't' + d.tier];
      if (st.gold < d.tier) cls.push('poor');
      if ((owned[id] || 0) >= 2) cls.push('pair');
      const gain = synergyGain(id);
      const squad = Synergy.hasSquad(d.squad) ? d.squadName : '';
      return `<div class="${cls.join(' ')}" data-shop="${i}" data-id="${id}"><div class="pic" style="background-image:url(${card(id)})"></div>` +
        `<span class="cost">${d.tier}</span>${gain.length ? `<span class="gain">▲ ${gain.join(', ')}</span>` : ''}` +
        `<div class="meta"><div class="nm"><img class="ricon" src="${B.roleIcon(d)}" alt=""><span class="tier t${d.tier}">${RO.TIER_NAME[d.tier]}</span>${d.name}${meta.level(id) > 1 ? ' <span class="lv">Lv' + meta.level(id) + '</span>' : ''}</div>` +
        `<div class="tg">${RO.CLASS_NAME[d.cls]} ${RO.ROLE_NAME[d.role]}${squad ? ' · ' + squad : ''}</div></div></div>`;
    }).join('');
  }
  // invisible drop zones over the cells; the tiles themselves are drawn on the field (BATTLE.setCells colours them)
  function renderZones() {
    let h = '';
    const states = {};
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const r = B.cellRect(0, col, row);
        const filled = !!st.board[col + ',' + row];
        states[col + ',' + row] = filled ? 'filled' : 'empty';
        h += `<div class="zone${filled ? ' filled' : ''}" data-col="${col}" data-row="${row}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>`;
      }
    }
    $('zones').innerHTML = h;
    B.setCells(states);
  }
  // tile colours while dragging: the dragged unit's own cell gold, the cell under the pointer blue (drop allowed)
  // or red (not allowed), every other free cell the unit may go to a soft pulsing blue
  function dragStates(d, to) {
    const states = {};
    const full = d.u && d.from.at === 'bench' && st.boardCount() >= st.cap();
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) {
      const key = col + ',' + row, has = !!st.board[key];
      let s = has ? 'filled' : 'empty';
      if (d.u && !has && !full) s = 'can';
      if (d.u && d.from.at === 'board' && d.from.col === col && d.from.row === row) s = 'sel';
      else if (to && to.at === 'board' && to.col === col && to.row === row) s = (d.u ? has || !full : has) ? 'hot' : 'blocked';
      states[key] = s;
    }
    return states;
  }
  function renderAll() { renderHud(); renderBench(); renderShop(); renderZones(); renderItems(); }

  let showTimer = 0;
  function waveOpts() {
    return { lineup: st.lineup(), plan: st.plan, stage: st.stage, wave: st.wave, baseHp: st.baseHp, upgrades: meta.upgrades(), seed: st.stage * 1000 + st.wave * 7 + 1 };
  }
  function preview() { // what the next wave holds, shown in the status line
    const sim = B.sim;
    if (!sim || phase !== 'prep') return;
    const kinds = { elite: 0, boss: 0 };
    for (const r of sim.rigs) { const k = window.LAO_ENEMIES[r].kind; if (k !== 'normal') kinds[k]++; }
    const b = kinds.boss && bossOf(st.stage);
    if (b) $('status').textContent = `보스 ${b.name} · ${b.gimNames.join(' · ')} — ${b.tip}`;
    else if (st.wave === st.waves) $('status').textContent = `마지막 웨이브: 철충 ${sim.total}기 · 스테이지 대장 등장`;
    else $('status').textContent = `다음 웨이브: 철충 ${sim.total}기${kinds.elite ? ' · 엘리트 등장' : ''}`;
  }
  function refreshField() {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => { B.showWave(waveOpts(), ['오르카 방어선', `${st.plan.code} ${S.at(st.stage).stage.name}`]).then(preview); }, 30);
  }
  function changed() { renderAll(); refreshField(); }

  // ---------- drag and drop ----------
  let drag = null;
  // the drop target under a point: unit bars and effects can sit on top of a cell, so look through every layer
  function locAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) { const l = locFromEl(el); if (l) return l; }
    return null;
  }
  function locFromEl(el) {
    if (!el || !el.closest) return null;
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
    if (card) { e.preventDefault(); buy(+card.dataset.shop); return; }
    const ic = e.target.closest('[data-item]');
    if (ic) { e.preventDefault(); drag = { item: +ic.dataset.item, x0: e.clientX, y0: e.clientY, moved: false, ghost: null }; return; }
    let from = locFromEl(e.target);
    // pressing on an SD over the field grabs that unit, wherever its body reaches (rows stand close together, so a
    // body can rise over the cell behind it, whose drop zone would otherwise take the press)
    if ((!from || from.at === 'board') && e.target.closest && e.target.closest('#field')) {
      const gp = window.toStage(e.clientX, e.clientY), hit = B.pickAt(gp.x, gp.y);
      if (hit) from = { at: 'board', col: hit.col, row: hit.row };
    }
    if (!from || from.at === 'sell') return;
    const u = st.unitAt(from);
    if (!u) return;
    e.preventDefault();
    drag = { from, u, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
      drag.moved = true;
      const g = document.createElement('div');
      g.className = 'ghost' + (drag.u ? '' : ' item');
      g.innerHTML = drag.u ? chipHtml(drag.u) : itemChip(st.items[drag.item], drag.item);
      $('stage').appendChild(g); // design pixels: turns with the stage on a portrait screen
      drag.ghost = g;
      if (drag.u) {
        document.body.classList.add('dragging'); $('sellZone').textContent = `판매 ●${st.cost(drag.u.id) * st.RULES.starCost[drag.u.star]}`;
        // the SD itself follows the pointer over the field; the chip only shows over the panels, which hide the field
        B.dragBegin(drag.from.at === 'board' ? { col: drag.from.col, row: drag.from.row } : { id: drag.u.id, star: drag.u.star });
      }
      B.hideInfo();
    }
    if (!drag.moved) return;
    const gp = window.toStage(e.clientX, e.clientY);
    drag.ghost.style.left = gp.x + 'px';
    drag.ghost.style.top = gp.y + 'px';
    if (drag.u) {
      const top = document.elementFromPoint(e.clientX, e.clientY);
      const overField = !!(top && top.closest('#field')) && !(top && top.closest('#sellZone'));
      drag.ghost.style.visibility = overField ? 'hidden' : '';
      B.dragMove(gp.x, gp.y, overField);
    }
    document.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
    const tgt = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && (el.closest('[data-bench]') || el.closest('.zone') || el.closest('#sellZone'))).find(Boolean);
    if (tgt) tgt.classList.add('hot');
    B.setCells(dragStates(drag, locFromEl(tgt)));
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    const to = d.moved ? locAt(e.clientX, e.clientY) : null; // read while the sell zone is shown
    document.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
    document.body.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    if (d.u && d.moved) B.dragEnd(); // a carried SD goes back to its cell (a move rebuilds the field right after)
    if (d.moved) renderZones(); // the tiles back to plain empty / filled
    if (d.item != null) { // gear: drop on a unit to equip it, a click shows what it does
      const it = st.items[d.item];
      if (!d.moved) { if (it) toast(`${Items.label(it)} · ${Items.describe(it)}`, true); return; }
      if (!to || to.at === 'sell') return;
      const u = st.unitAt(to);
      if (!u) { toast('대원 위에 놓아야 장착됩니다'); return; }
      if (!st.equip(d.item, to)) { toast(`장비는 대원당 ${st.RULES.itemSlots}개까지`); return; }
      A.sfx('reinforce');
      toast(`${RO.BY_ID[u.id].name}에게 ${Items.label(it)} 장착`, true);
      changed();
      return;
    }
    if (!d.moved) { B.showCard(d.u.id, d.u.star, d.u.items, d.from.at === 'board' ? d.from : null); return; }
    if (!to) return;
    if (to.at === 'sell') {
      const v = st.cost(d.u.id) * st.RULES.starCost[d.u.star];
      const before = st.log.length;
      st.sell(d.from);
      itemMerged(before);
      A.sfx('coin');
      toast(`${RO.BY_ID[d.u.id].name} 판매 +${v}`, true);
      changed();
      return;
    }
    if (!st.move(d.from, to)) {
      if (to.at === 'board' && d.from.at === 'bench' && st.boardCount() >= st.cap()) toast(`배치 인원 초과: 레벨 ${st.level}에서는 ${st.cap()}명까지`);
      return;
    }
    A.sfx('click');
    if (to.at === 'board' && d.from.at === 'bench') A.voice(d.u.id, 'SortiePick');
    changed();
    T.signal('move');
  }

  function buy(i) {
    const id = st.shop[i];
    if (!id) return;
    const before = st.log.length;
    if (!st.buy(i)) { toast(st.gold < st.cost(id) ? '골드가 부족합니다' : '대기석이 가득 찼습니다'); return; }
    const merged = st.log.slice(before).filter((l) => l.type === 'merge');
    if (merged.length) {
      const star = merged[merged.length - 1].star;
      toast(`${RO.BY_ID[id].name} ★${star} 합성!`, true);
      A.sfx(star >= 5 ? 'rankUpSS' : 'rankUp');
      A.voice(id, 'Reinforce', true);
      T.signal('merge');
    } else {
      A.sfx('purchase');
      if (st.units().filter((x) => x.u.id === id).length === 1) A.voice(id, 'Join');
    }
    autoPlace();
    changed();
    T.signal('buy');
  }
  // a bought unit goes onto a free cell while there is room: tanks / short reach in front, the rest behind
  function autoPlace() {
    while (st.boardCount() < st.cap()) {
      const i = st.bench.findIndex(Boolean);
      if (i < 0) return;
      const d = RO.BY_ID[st.bench[i].id];
      const front = d.role === 'tank' || d.basic.range <= 2;
      const F = [[0, 1], [0, 0], [0, 2]], M = [[1, 1], [1, 0], [1, 2]], Bk = [[2, 1], [2, 0], [2, 2]];
      const order = front ? [...F, ...M, ...Bk] : [...Bk, ...M, ...F];
      const cell = order.find(([c, r]) => !st.board[c + ',' + r]);
      if (!cell || !st.move({ at: 'bench', i }, { at: 'board', col: cell[0], row: cell[1] })) return;
    }
  }

  function fight() {
    if (phase !== 'prep') return;
    if (!$('itemModal').hidden) return;
    if (!st.boardCount()) { toast('진형에 대원을 배치하세요'); return; }
    phase = 'fight';
    document.body.classList.add('fighting');
    B.hideInfo();
    renderHud();
    clearTimeout(showTimer);
    stageBgm();
    A.sfx('start');
    const field = st.lineup();
    if (field.length) A.voice(field[Math.floor(Math.random() * field.length)][0], 'StageStart', true);
    B.showWave(waveOpts(), null).then(() => { $('status').textContent = `웨이브 ${st.wave} 방어 중`; B.start(); });
    T.signal('fight');
  }

  B.onEnd = (e, sim) => {
    if (phase !== 'fight') return;
    phase = 'result';
    const res = st.finishWave(e.result, sim.baseHp);
    if (st.over) {
      const wavesCleared = st.cleared ? st.waves : res.wave - 1;
      const r = meta.finishStage(st.stage, st.cleared, wavesCleared);
      lastResult = r;
      const t = $('rrTitle');
      t.className = st.cleared ? 'win' : 'lose';
      t.textContent = st.cleared ? `${st.plan.code} 클리어` : '기지 함락';
      $('rrSub').innerHTML = (st.cleared ? `${st.waves}웨이브를 모두 막았습니다` : `${res.wave}웨이브에서 기지가 무너졌습니다`) +
        (r.chapterDone ? `<br><b class="rrBonus">챕터 ${r.chapterDone} 클리어 보상</b> 전 대원 공격력·체력 +${Math.round(meta.RULES.bonusAtk * 100)}%, 기지 체력 +${meta.RULES.bonusBase}` : '') +
        (r.joined.length ? `<br><b class="rrJoin">합류</b> ${r.joined.map((id) => RO.BY_ID[id].name).join(', ')}` : '');
      if (r.joined.length) setTimeout(() => A.voice(r.joined[0], 'Join', true), 1600);
      const more = st.stage < S.total();
      $('btnNext').textContent = r.ending ? '계속' : st.cleared ? (more ? `다음 작전 ${S.at(st.stage + 1).code} ▶` : '계속') : '다시 도전';
      $('btnMap').hidden = !!r.ending;
      $('roundResult').hidden = false;
      renderHud();
      A.sfx(st.cleared ? 'win' : 'fail');
      if (st.cleared) { // the unit that dealt the most damage gets the MVP line
        const mvp = sim.units.filter((u) => u.side === 0).sort((a, b) => b.dealt - a.dealt)[0];
        if (mvp) setTimeout(() => A.voice(mvp.id, 'MVP', true), 600);
      }
      T.signal('stageEnd', { cleared: st.cleared });
      return;
    }
    A.sfx('clear', 0.7);
    // between waves: straight back to the shop with a short summary
    toast(`웨이브 ${res.wave} 방어 · 수입 ●${res.gold}${sim.breached ? ` · 기지 피해 ${sim.breached}` : ''}`, true);
    phase = 'prep';
    document.body.classList.remove('fighting');
    stageBgm();
    changed();
    T.signal('waveEnd', { wave: res.wave, next: st.wave, elite: st.wave === st.plan.eliteWave, boss: st.wave === st.waves });
    if (st.reward) openReward(); else if (st.itemShop) openItemShop();
  };

  // ---------- supply shop (shop time) and elite reward ----------
  function itemCard(it, i, mode) {
    const can = mode === 'reward' || (st.gold >= Items.price(it.tier) && st.fits(it));
    const pair = st.fits(it) && (st.items.some((b) => b.key === it.key && b.tier === it.tier) || st.units().some(({ u }) => (u.items || []).some((b) => b.key === it.key && b.tier === it.tier)));
    return `<div class="imCard md-${Stars.medal(it.tier)}${can ? '' : ' poor'}">${pair ? '<span class="imPair">합성 가능</span>' : ''}<img src="${Items.icon(it)}" alt="">${Stars.html(it.tier)}<div class="imName">${Items.label(it)}</div>` +
      `<div class="imDesc">${Items.describe(it)}</div><button class="primary" data-im="${i}" ${can ? '' : 'disabled'}>${mode === 'reward' ? '선택' : '●' + Items.price(it.tier)}</button></div>`;
  }
  let modal = null;
  function itemMerged(before) { // gear merges logged since `before`: a toast for the best one
    const m = st.log.slice(before).filter((l) => l.type === 'itemMerge');
    if (!m.length) return;
    const top = m[m.length - 1];
    toast(`${Items.CATALOG[top.key].name} ★${top.star} 합성!${top.unit ? ' (' + RO.BY_ID[top.unit].name + ' 장착 중)' : ''}`, true);
    A.sfx(top.star >= 5 ? 'rankUpSS' : 'rankUp');
  }
  function openItemShop() {
    modal = 'shop';
    $('imTitle').textContent = '보급 상점';
    $('imSub').textContent = `장비를 사서 대원에게 끌어다 장착하세요 · 보유 골드 ●${st.gold} · 보관함 ${st.items.length}/${st.RULES.maxItems}`;
    $('imList').innerHTML = st.itemShop.map((it, i) => (it ? itemCard(it, i, 'shop') : '<div class="imCard sold"></div>')).join('');
    $('imReroll').style.display = '';
    $('imReroll').disabled = st.gold < st.RULES.itemReroll;
    $('imClose').textContent = '나가기';
    $('itemModal').hidden = false;
    A.sfx('coin', 0.8);
  }
  function openReward() {
    modal = 'reward';
    $('imTitle').textContent = '엘리트 격파 보상';
    $('imSub').textContent = '장비 하나를 고르세요';
    $('imList').innerHTML = st.reward.map((it, i) => itemCard(it, i, 'reward')).join('');
    $('imReroll').style.display = 'none';
    $('imClose').textContent = '건너뛰기';
    $('itemModal').hidden = false;
    A.sfx('pickSS', 0.8);
  }
  function closeModal() {
    $('itemModal').hidden = true;
    if (modal === 'reward') { st.reward = null; modal = null; if (st.itemShop) { openItemShop(); return; } }
    if (modal === 'shop') st.closeItemShop();
    modal = null;
    renderAll();
  }
  $('itemModal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-im]');
    if (!b) return;
    const i = +b.dataset.im;
    const before = st.log.length;
    if (modal === 'shop') { if (st.buyItem(i)) { A.sfx('purchase'); itemMerged(before); openItemShop(); renderAll(); } }
    else if (modal === 'reward') { const it = st.reward[i]; st.takeReward(i); toast(`${Items.label(it)} 획득`, true); A.sfx('rankUp'); itemMerged(before); modal = null; $('itemModal').hidden = true; if (st.itemShop) openItemShop(); renderAll(); }
  });
  $('imClose').onclick = closeModal;
  $('imReroll').onclick = () => { if (st.rerollItems()) { A.sfx('coin'); openItemShop(); renderAll(); } };

  // ---------- wiring ----------
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); B.dragEnd(); drag = null; document.body.classList.remove('dragging'); if (st && phase === 'prep') renderZones(); });
  $('btnReroll').onclick = () => { if (phase === 'prep' && st.reroll()) { A.sfx('coin', 0.8); renderShop(); renderHud(); } };
  $('btnXp').onclick = () => {
    if (phase !== 'prep') return;
    const lv = st.level;
    if (st.buyXp()) { A.sfx('reinforce', 0.8); if (st.level > lv) { toast(`레벨 ${st.level}: 배치 ${st.cap()}명`, true); autoPlace(); changed(); T.signal('levelUp'); } else renderAll(); }
  };
  $('btnFight').onclick = fight;
  // after a stage: the epilogue when a chapter ends, then the ending, the next stage, a retry or the map
  function afterStage(toMap) {
    $('roundResult').hidden = true;
    const a = st && S.at(st.stage), r = lastResult, ending = !!(r && r.ending), cleared = !!(st && st.cleared), g = st ? st.stage : 1;
    const next = () => {
      if (ending) showEnding();
      else if (toMap) openLobby();
      else startStage(cleared ? Math.min(g + 1, S.total()) : g); // the story runs on, like a packaged game
    };
    if (cleared && a.last && !meta.data.seen['o' + a.chapter.id]) {
      meta.data.seen['o' + a.chapter.id] = 1; meta.save();
      const ng = NG(), ngc = ng && ng.chapters && ng.chapters[a.chapter.id];
      const scenes = [sceneOutro(a.chapter)];
      if (ngc) scenes.push(sceneNG(ngc.outro, ['EPILOGUE', `${a.chapter.title} — 2회차`]));
      if (ending && ng) scenes.push(sceneNG(ng.trueEnding, ['TRUE ENDING', '진엔딩']));
      playStory(scenes, `챕터 ${a.chapter.id} · ${a.chapter.title} — 에필로그`, next);
      return;
    }
    next();
  }
  $('btnNext').onclick = () => afterStage(false);
  $('btnMap').onclick = () => afterStage(true);
  $('btnRetreat').onclick = () => {
    if (phase === 'prep' && window.confirm('작전을 포기하고 작전 지도로 돌아갈까요?')) {
      meta.finishStage(st.stage, false, st.wave - 1);
      openLobby();
    }
  };
  $('shop').addEventListener('pointerover', (e) => {
    const c = e.target.closest('[data-id]');
    if (!c) { B.highlightSynergy(null); return; }
    const d = RO.BY_ID[c.dataset.id];
    B.highlightSynergy(['c:' + d.cls, 's:' + d.squad]);
  });
  $('shop').addEventListener('pointerleave', () => B.highlightSynergy(null));
  window.addEventListener('keydown', (e) => {
    if (phase !== 'prep') return;
    if (e.key === 'd' || e.key === 'D') $('btnReroll').click();
    if (e.key === 'f' || e.key === 'F') $('btnXp').click();
    if (e.code === 'Enter') fight();
  });
  B.onLayout = () => { if (st && phase !== 'lobby') renderZones(); };

  // =====================================================================================
  // title (three save slots) and the ending
  // =====================================================================================
  let lastResult = null;
  function playTime(sec) { const m = Math.floor((sec || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; }
  function slotWhere(sl) {
    if (sl.stageCleared >= S.total()) return sl.endings >= 2 ? '진엔딩 도달' : '엔딩 도달';
    const a = S.at(sl.stageCleared + 1);
    return `CHAPTER ${a.chapter.id} · ${a.chapter.title} — ${a.code}`;
  }
  function showTitle() {
    phase = 'title';
    st = null;
    if (meta) { meta.save(); meta = null; } // a slot is only held while it is played (an erased slot must not be saved again)
    $('lobby').hidden = true; $('ending').hidden = true; $('roundResult').hidden = true; $('story').hidden = true;
    document.body.classList.add('lobby');
    if (L) L.pause(true);
    B.setBg(S.CHAPTERS[0].bg);
    const slots = Meta.slots(RO);
    $('title').innerHTML = '<div class="tiShade"></div><div class="tiLogo"><small>LAST ORIGIN · ORCA DEFENSE</small><b>오르카 방어전</b><span>사령관의 열두 시간</span></div>' +
      '<div class="tiSlots">' + slots.map((sl) => {
        if (sl.empty) return `<div class="tiSlot empty"><span class="tiN">SLOT ${sl.n}</span><span class="tiE">비어 있음</span><div class="tiBtns"><button class="primary" data-new="${sl.n}">새 게임</button></div></div>`;
        const done = sl.stageCleared >= S.total();
        return `<div class="tiSlot${sl.cycle >= 2 ? ' ng' : ''}"><span class="tiN">SLOT ${sl.n}</span><span class="tiC" data-cycle="${sl.cycle}">${sl.cycle}회차${sl.endings ? ` · 엔딩 ${sl.endings}` : ''}</span>` +
          `<div class="tiW">${slotWhere(sl)}</div><div class="tiM"><span>진행 ${Math.min(sl.stageCleared, S.total())}/${S.total()}</span><span>플레이 ${playTime(sl.playSec)}</span><span>${new Date(sl.updated).toLocaleDateString('ko-KR')}</span></div>` +
          '<div class="tiBtns">' + (done && sl.endings >= sl.cycle ? `<button class="primary" data-ng="${sl.n}" data-next="${sl.cycle + 1}">${sl.cycle + 1}회차 시작</button>` : '') +
          `<button class="${done ? '' : 'primary'}" data-load="${sl.n}">이어하기</button><button class="quiet" data-erase="${sl.n}">삭제</button></div></div>`;
      }).join('') + '</div>' + (window.GAME_VERSION ? `<div class="tiVer">${GAME_VERSION.v}</div>` : '') + '<div class="tiFoot">스토리를 끝까지 깨면 같은 슬롯에서 2회차가 열립니다. 2회차는 모든 대원이 합류한 채 시작하고, 철충이 강해지며, 추가 이야기와 진엔딩이 있습니다.</div>';
    $('title').hidden = false;
    A.bgm('title');
  }
  function loadSlot(n, mode) {
    if (mode === 'new') Meta.erase(n);
    meta = Meta.load(RO, n);
    if (mode === 'new') meta.save();
    if (mode === 'ng' && !meta.newCycle()) { toast('아직 엔딩에 도달하지 않았습니다'); return; }
    B.setHeadIcons(meta.data.headIcons !== false);
    if (!meta.data.deck || !meta.data.deck.length) meta.setDeck(meta.deck());
    if (window.TUTORIAL) TUTORIAL.bind(meta);
    $('title').hidden = true;
    openLobby();
    if (mode === 'ng') toast(`${meta.data.cycle}회차 시작 · 모든 대원 합류, 철충 강화`, true);
  }
  $('title').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    A.sfx('click');
    if (t.dataset.new) loadSlot(+t.dataset.new, 'new');
    else if (t.dataset.load) loadSlot(+t.dataset.load, 'load');
    else if (t.dataset.ng) { if (window.confirm(`${t.dataset.next}회차를 시작할까요? 스테이지 진행은 처음부터 다시 하고, 대원과 챕터 보상은 모두 이어받습니다.`)) loadSlot(+t.dataset.ng, 'ng'); }
    else if (t.dataset.erase) { if (window.confirm(`슬롯 ${t.dataset.erase}을 지울까요? 되돌릴 수 없습니다.`)) { Meta.erase(+t.dataset.erase); showTitle(); } }
  });
  function showEnding() {
    phase = 'ending';
    const c = meta.data.cycle, trueEnd = c >= 2;
    $('lobby').hidden = true; $('roundResult').hidden = true;
    $('ending').innerHTML = `<div class="enBox"><small>${trueEnd ? 'TRUE ENDING' : 'ENDING'}</small><b>${trueEnd ? '진엔딩' : '열두 시간'}</b>` +
      `<span>${c}회차 클리어 · 플레이 ${playTime(meta.data.playSec)} · 출격 ${meta.data.stats.runs}회</span>` +
      `<p>${trueEnd ? '모든 이야기를 보았습니다. 같은 슬롯에서 다음 회차를 이어 갈 수 있습니다.' : '같은 슬롯에서 <b>2회차</b>가 열렸습니다.<br>모든 대원이 합류한 채로 시작하고, 철충이 강해지며, 추가 이야기와 진엔딩이 기다립니다.'}</p>` +
      `<div class="enBtns"><button class="primary" id="enNext">${c + 1}회차 시작</button><button id="enTitle">타이틀로</button></div></div>`;
    $('ending').hidden = false;
    A.bgm('title');
    A.sfx('win');
  }
  $('ending').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    A.sfx('click');
    $('ending').hidden = true;
    if (t.id === 'enNext') loadSlot(meta.slot, 'ng'); else showTitle();
  });
  // play time (only while the page is in front)
  setInterval(() => { if (meta && !document.hidden && document.hasFocus()) meta.addTime(5); }, 5000);
  window.addEventListener('pagehide', () => { if (meta) meta.save(); });

  showTitle();
  window.GAME = { get meta() { return meta; }, toast, changed: () => changed(), openLobby, showTitle, showEnding, loadSlot, get stage() { return st; }, get phase() { return phase; } }; // debugging handle
})();
