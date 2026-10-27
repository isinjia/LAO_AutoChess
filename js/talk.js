// Story dialogue: the original LAO novel screen, ported from LAO_RPG_01 (12_LAO_Sim_RPG js/talk.js).
// Background cross-fade, full-body characters standing left / right (the speaker lit, the others dimmed) with the
// original appear / leave moves, a place caption at each scene start, typing with a voice blip per letter pair,
// AUTO / FAST >> / HISTORY, and SKIP (asks first; Esc skips at once).
//
//   TALK.playScenes([{ lines: [[who, text], ...], bg: 'BG_Lobby', place: ['CHAPTER 1', '서른 날'] }, ...], title)
//     -> Promise, resolves when the scenes end or are skipped
//   who: a roster unit id (stands in assets/story/stand/<id>.webp, tools/build_story_art.py), 'commander' or 'narr'
//   ['scene', { bg, place: [small, large], fx: 'rain' }] in the lines: a cut to another place ("한편, 등대에서"):
//     dip to black, the new background, the place caption, the stage cleared; fx: 'rain' (rain over the scene, outdoors) / 'overcast' (a grey rainy-day light, indoors)
//
// Time runs on its own requestAnimationFrame clock (paused while the tab is hidden).
(function () {
  const $ = (id) => document.getElementById(id);
  const root = $('story');
  const layers = [...root.querySelectorAll('.tbg')], stage = root.querySelector('.tstage'), fxEl = root.querySelector('.tfx');
  const box = root.querySelector('.tbox'), nameEl = root.querySelector('.tname'), textEl = root.querySelector('.ttext');
  const placeEl = root.querySelector('.tplace'), logEl = root.querySelector('.tlog'), titleEl = $('storyChapter');
  let front = 0;

  // ---------- clock ----------
  let now = 0, last = 0, raf = 0;
  const timers = [], tweens = [];
  const tw = (ms) => new Promise((r) => timers.push({ t: now + ms / 1000, r }));
  const tween = (dur, fn) => new Promise((r) => tweens.push({ t: 0, dur: Math.max(0.001, dur), fn, r }));
  function frame(ts) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    update(dt);
    raf = cur || timers.length || tweens.length ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // ---------- state ----------
  let nodes = null, idx = -1, cur = null, done = null, busy = false, gen = 0;
  let autoOn = false, fastOn = false, typing = null, autoWait = 0, log = [];

  // ---------- voice blip (WebAudio; quiet, follows the effects volume, silent while the page is away) ----------
  let ac = null, lastBlip = 0;
  const NAME_PITCH = { constantia: 640, labiata: 520, leona: 470, brownie: 760, lemonadealpha: 560, raven: 700, lrl: 880 };
  function blipFreq(who) {
    if (!who || who === 'narr') return 330;
    if (who === 'commander') return 300;
    if (NAME_PITCH[who]) return NAME_PITCH[who];
    let h = 0;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 560 + (h % 7) * 50;
  }
  function blip(freq) {
    const A = window.AUDIO;
    if (!A || A.away || A.settings.mute || !A.settings.sfx) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = freq;
      const v = 0.035 * A.settings.sfx, t = ac.currentTime;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.05);
    } catch (e) { /* no audio */ }
  }

  // ---------- scenes -> nodes: who stands where ----------
  // a unit takes the free side, or the side of whoever did not speak last; the commander and narration dim everyone
  function fromScenes(scenes) {
    const out = [];
    for (const sc of scenes) {
      let slots = { L: null, R: null };
      let lastSide = null, first = true, cut = null, fx = sc.fx || '';
      for (const [who, text] of sc.lines || []) {
        if (who === 'scene') { cut = text || {}; continue; } // the next line opens the new place
        const n = { who, t: text || '', app: {}, cast: [] };
        if (first) { n.bg = sc.bg || ''; n.place = sc.place || null; n.newScene = true; n.fx = fx; first = false; }
        if (cut) {
          slots = { L: null, R: null }; lastSide = null; fx = cut.fx || '';
          n.bg = cut.bg || ''; n.place = cut.place || null; n.newScene = true; n.cut = true; n.fx = fx;
          cut = null;
        }
        const unit = window.ROSTER && ROSTER.BY_ID[who];
        if (unit) {
          let side = slots.L === who ? 'L' : slots.R === who ? 'R' : null;
          if (!side) {
            side = !slots.L ? 'L' : !slots.R ? 'R' : lastSide === 'L' ? 'R' : 'L';
            slots[side] = who;
            n.app[side] = side === 'L' ? 'l' : 'r';
            n.voice = who;
          }
          lastSide = side;
          n.spk = side;
          n.name = unit.name;
        } else {
          n.spk = 'C';
          n.name = who === 'commander' ? '사령관' : who === 'narr' ? '' : who;
          n.dimAll = true;
        }
        for (const s of ['L', 'R']) if (slots[s]) n.cast.push([s, slots[s], slots[s] === who]);
        out.push(n);
      }
    }
    return out;
  }

  function preload(list) {
    const seen = new Set();
    for (const n of list) {
      if (n.bg) seen.add(`assets/story/bg/${n.bg}.webp`);
      for (const c of n.cast) seen.add(`assets/story/stand/${c[1]}.webp`);
    }
    for (const u of seen) { const im = new Image(); im.src = u; }
  }

  function playScenes(scenes, title) {
    return new Promise((res) => {
      const list = fromScenes(scenes || []);
      if (!list.length) { res(); return; }
      gen++;
      nodes = list; idx = -1; done = res; log = []; typing = null; busy = false; autoWait = 0;
      preload(list);
      titleEl.textContent = title || '';
      layers.forEach((l) => { l.style.backgroundImage = ''; l.style.opacity = 0; l.dataset.k = ''; });
      stage.innerHTML = '';
      fxEl.style.opacity = 1; // scenes open from black
      root.classList.remove('logon', 'asking', 'ready', 'nar');
      root.dataset.fx = '';
      root.classList.add('nobox');
      placeEl.classList.remove('on');
      setBtn();
      root.hidden = false;
      wake();
      go(0);
    });
  }

  function setBtn() {
    root.querySelector('[data-k="auto"]').classList.toggle('on', autoOn);
    root.querySelector('[data-k="fast"]').classList.toggle('on', fastOn);
  }

  // background: two layers cross-fading
  function setBg(name) {
    if (!name || layers[front].dataset.k === name) return Promise.resolve();
    const back = 1 - front;
    layers[back].style.backgroundImage = `url(assets/story/bg/${name}.webp)`; layers[back].dataset.k = name;
    layers[back].style.zIndex = 1; layers[front].style.zIndex = 0;
    const a = layers[back], b = layers[front];
    front = back;
    return tween(fastOn ? 0.1 : 0.45, (k) => { a.style.opacity = k; if (k >= 1) b.style.opacity = 0; });
  }

  // characters (original Char_AppearEffect: slide in from their side; Char_OffEffect: fade)
  function setCast(n, clear) {
    const want = new Map(n.cast.map(([p, s, lit]) => [p, [s, lit]]));
    stage.querySelectorAll('.stand').forEach((im) => {
      if (im.classList.contains('leaving')) return;
      const w = want.get(im.dataset.p);
      if (!clear && w && w[0] === im.dataset.s) return;
      im.classList.add('leaving', 'off-fade');
      tw(420).then(() => im.remove());
    });
    for (const [p, [s, lit]] of want) {
      let im = stage.querySelector(`.stand[data-p="${p}"]:not(.leaving)`);
      if (!im) {
        im = document.createElement('img');
        im.className = 'stand'; im.dataset.p = p; im.dataset.s = s; im.alt = ''; im.draggable = false;
        im.src = `assets/story/stand/${s}.webp`;
        stage.appendChild(im);
        const eff = n.app[p] === 'l' ? 'ap-l' : n.app[p] === 'r' ? 'ap-r' : 'ap-fade';
        void im.offsetWidth;
        im.classList.add(eff);
      }
      im.classList.toggle('dim', n.dimAll || !lit);
      im.classList.toggle('talking', !n.dimAll && !!lit);
    }
  }

  async function place(p) {
    placeEl.querySelector('.pn').textContent = p[0] || '';
    placeEl.querySelector('.pd').textContent = p[1] || '';
    root.classList.add('nobox');
    placeEl.classList.add('on');
    await tw(fastOn ? 300 : 1700);
    placeEl.classList.remove('on');
    await tw(fastOn ? 100 : 350);
  }

  async function show(n) {
    const g = gen;
    cur = n; busy = true; typing = null; autoWait = 0;
    root.classList.remove('ready');
    if (n.newScene && idx > 0) { // a new scene: dip to black, swap, come back (a cut to another place: a longer dip)
      root.classList.add('nobox');
      await tween(fastOn ? 0.1 : n.cut ? 0.6 : 0.35, (k) => { fxEl.style.opacity = k; });
      if (g !== gen) return;
      if (n.cut && !fastOn) { await tw(250); if (g !== gen) return; }
    }
    if (n.newScene) root.dataset.fx = n.fx || '';
    const bgP = setBg(n.bg);
    setCast(n, n.newScene);
    if (+fxEl.style.opacity > 0) { await bgP; await tween(fastOn ? 0.12 : 0.45, (k) => { fxEl.style.opacity = 1 - k; }); if (g !== gen) return; }
    if (n.place) { await place(n.place); if (g !== gen) return; }
    root.classList.remove('nobox');
    root.classList.toggle('nar', n.who === 'narr');
    root.classList.toggle('cmd', n.who === 'commander');
    nameEl.textContent = n.name || '';
    box.dataset.p = n.spk;
    textEl.textContent = '';
    typing = { full: n.t, n: 0 };
    log.push([n.name || '', n.t, n.who]);
    busy = false;
  }

  function finishTyping() {
    if (!typing) return;
    textEl.textContent = typing.full;
    typing = null;
    afterTyped();
  }
  function afterTyped() {
    root.classList.add('ready');
    autoWait = fastOn ? 0.12 : 1.1 + Math.min(2.5, cur.t.length * 0.035);
  }

  function go(i) {
    idx = i;
    if (nodes && i < nodes.length) show(nodes[i]); else end();
  }
  function next() {
    if (!cur || busy || root.classList.contains('logon') || root.classList.contains('asking')) return;
    if (typing) { finishTyping(); return; }
    go(idx + 1); // no touch sound in the dialogue: the letters' blips are its sound
  }
  function end() {
    gen++;
    const cb = done;
    nodes = null; cur = null; done = null; typing = null; busy = false;
    root.hidden = true;
    root.classList.remove('logon', 'asking', 'ready');
    stage.innerHTML = '';
    if (cb) cb();
  }
  const skip = () => { if (cur || nodes) end(); };

  function update(dt) {
    now += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= now) { const r = timers[i].r; timers.splice(i, 1); r(); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const a = tweens[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) { tweens.splice(i, 1); a.r(); }
    }
    if (!cur) return;
    if (typing) {
      const cps = fastOn ? 400 : 38;
      const before = Math.floor(typing.n);
      typing.n = Math.min(typing.full.length, typing.n + dt * cps);
      const shown = Math.floor(typing.n);
      textEl.textContent = typing.full.slice(0, shown);
      if (!fastOn) for (let i = before; i < shown; i++) { // a blip every other letter, not on spaces / punctuation
        if (i % 2 || !/[0-9A-Za-zㄱ-힣]/.test(typing.full[i]) || now - lastBlip < 0.045) continue;
        lastBlip = now;
        blip(blipFreq(cur.who));
      }
      if (typing.n >= typing.full.length) { typing = null; afterTyped(); }
    } else if ((autoOn || fastOn) && autoWait > 0 && !busy && !root.classList.contains('logon') && !root.classList.contains('asking')) {
      autoWait -= dt;
      if (autoWait <= 0) { autoWait = 0; go(idx + 1); }
    }
  }

  function openLog() {
    const list = logEl.querySelector('.tloglist');
    list.innerHTML = log.map(([w, t, who]) => `<div class="li ${who === 'narr' ? 'nar' : ''}"><b>${w}</b><p>${t.replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' })[c])}</p></div>`).join('');
    root.classList.add('logon');
    list.scrollTop = list.scrollHeight;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b) {
      e.stopPropagation();
      const k = b.dataset.k;
      if (k === 'auto') { autoOn = !autoOn; fastOn = false; setBtn(); if (!typing && cur && !busy) autoWait = 0.6; }
      else if (k === 'fast') { fastOn = !fastOn; setBtn(); if (!typing && cur && !busy) autoWait = 0.1; }
      else if (k === 'log') openLog();
      else if (k === 'skip') root.classList.add('asking');
      else if (k === 'skipY') { root.classList.remove('asking'); skip(); }
      else if (k === 'skipN') root.classList.remove('asking');
      return;
    }
    if (root.classList.contains('logon')) { root.classList.remove('logon'); return; }
    if (e.target.closest('.task')) return;
    next();
  });
  window.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); if (root.classList.contains('logon')) root.classList.remove('logon'); else next(); }
    else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (root.classList.contains('logon')) root.classList.remove('logon'); else skip(); }
  }, true);

  // tick(sec): step the dialogue clock by hand (tools / tests: a hidden tab gets no animation frames)
  const tick = (sec, fps = 30) => { for (let i = 0; i < Math.round(sec * fps); i++) update(1 / fps); };
  window.TALK = { playScenes, fromScenes, next, skip, tick, get active() { return !!cur; } };
})();
