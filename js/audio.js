// Sound: BGM (looped, cross-faded), effects (throttled so a big fight does not turn into noise) and the original
// character voice lines (one at a time, with cooldowns). HTML audio elements, so it also works from file://.
//
//   AUDIO.bgm('battle')  AUDIO.sfx('rifle')  AUDIO.voice('brownie', 'SpSkill')  AUDIO.attack(unitId)
//   AUDIO.settings -> { bgm, sfx, voice, mute }   AUDIO.set(key, value)
(function () {
  'use strict';
  const KEY = 'lao_autobattler_audio_v1';
  const BGM = { title: 'assets/bgm/title.mp3', battle: 'assets/bgm/battle.mp3', battle2: 'assets/bgm/battle2.mp3', boss: 'assets/bgm/boss.mp3' };
  // attack sound per unit (the defence project's choices for the same rigs)
  const ATTACK = {
    daphne: 'laser', impet: 'spray', leprechaun: 'mg', brownie: 'rifle', gnome: 'cannon', banshee: 'laser', sylphid: 'gun',
    raven: 'handgun', nymph: 'laser', amy: 'handgun', andvari: 'cannon', phoenix: 'expS', thetis: 'elec', hraesvelgr: 'laserBig',
    undine: 'ice', valkyrie: 'rifle', zero: 'slash', hela: 'elec', azazel: 'energy', saraqael: 'energy', leona: 'laserBig',
    ullr: 'laserBig', harpy: 'missile', eternity: 'mg', lemonadealpha: 'elec', sleipnir: 'missile', blacklilith: 'slash',
    cyclopsprincess: 'slash', blindprincess: 'energy', brunhild: 'expM', tiamat: 'laserBig', khan: 'rifle', labiata: 'swing',
    lrl: 'energy', constantia: 'laserBig', titania: 'ice', mercury: 'slash', empress: 'expM', fafnir: 'elec', ramiel: 'energy',
  };
  // per-effect loudness (rapid-fire weapons and routine hits sit lower than UI cues and warnings)
  const SFX_VOL = {
    click: 0.45, coin: 0.55, purchase: 0.6, mg: 0.28, rifle: 0.35, gun: 0.32, handgun: 0.4, laser: 0.32, spray: 0.28, elec: 0.4,
    slash: 0.45, swing: 0.45, energy: 0.4, expS: 0.35, expM: 0.5, expB: 0.7, cannon: 0.45, missile: 0.45, laserBig: 0.45, ice: 0.4,
    charge: 0.5, warning: 0.75, quake: 0.6, start: 0.7, clear: 0.6, win: 0.8, fail: 0.8, rankUp: 0.75, rankUpSS: 0.85, reinforce: 0.6,
  };
  const MIN_GAP = 0.12; // seconds between two plays of the same effect
  const MAX_LIVE = 6; // effects playing at once
  const UNIT_GAP = 0.35; // one unit's attack sound at most this often (multi-hit clips would rattle)
  const DUCK = 0.55; // BGM and effects drop to this share while a voice line plays

  let settings = { bgm: 0.45, sfx: 0.55, voice: 1, mute: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage refused */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  // browsers only allow sound after a user gesture: everything waits for the first one
  let unlocked = false;
  const pending = [];
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    while (pending.length) pending.shift()();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { once: false, capture: true }));
  const whenUnlocked = (fn) => (unlocked ? fn() : pending.push(fn));

  // ---------- BGM ----------
  let bgmEl = null, bgmName = '', fadeTimer = 0;
  function bgm(name) {
    if (name === bgmName) return;
    bgmName = name;
    whenUnlocked(() => {
      if (bgmName !== name) return;
      const old = bgmEl;
      const el = new Audio(BGM[name]);
      el.loop = true;
      el.volume = 0;
      bgmEl = el;
      if (!away) el.play().catch(() => {}); // away: starts on focus (setAway)
      clearInterval(fadeTimer);
      let t = 0;
      fadeTimer = setInterval(() => { // 0.8 s cross-fade
        t = Math.min(1, t + 0.05);
        el.volume = vol('bgm') * t;
        if (old) old.volume = Math.max(0, old.volume * (1 - t));
        if (t >= 1) { clearInterval(fadeTimer); if (old) { old.pause(); old.src = ''; } }
      }, 40);
    });
  }
  let ducked = false;
  // the page lost focus (another tab or app, the window behind another one, a phone's home screen): silent until it
  // comes back. BGM pauses and resumes where it was; effects and voices are dropped, not queued
  let away = !document.hasFocus() && document.visibilityState !== 'visible';
  function vol(kind) { return settings.mute || away ? 0 : settings[kind] * (ducked && kind !== 'voice' ? DUCK : 1); }
  function setAway(on) {
    if (on === away) return;
    away = on;
    if (on) {
      if (bgmEl) bgmEl.pause();
      if (voiceEl) { voiceEl.pause(); voiceEl.src = ''; voiceEl = null; ducked = false; }
    } else if (bgmEl && unlocked) {
      clearInterval(fadeTimer);
      bgmEl.volume = vol('bgm');
      bgmEl.play().catch(() => {});
    }
  }
  window.addEventListener('blur', () => setAway(true));
  window.addEventListener('focus', () => setAway(false));
  document.addEventListener('visibilitychange', () => setAway(document.visibilityState !== 'visible' || !document.hasFocus()));
  function duck(on) {
    ducked = on;
    if (bgmEl) bgmEl.volume = vol('bgm');
  }

  // ---------- effects ----------
  // each effect file is fetched once and replayed from memory (a blob URL); file:// cannot fetch, so it uses the path
  const blobs = {};
  function srcOf(name) {
    const path = 'assets/sfx/' + name + '.mp3';
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(path);
    if (!blobs[name]) blobs[name] = fetch(path).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => URL.createObjectURL(b)).catch(() => path);
    return blobs[name];
  }
  const lastPlay = {};
  let live = 0;
  function sfx(name, k = 1) {
    if (!name || settings.mute || away || !settings.sfx) return;
    const now = performance.now() / 1000;
    if (now - (lastPlay[name] || 0) < MIN_GAP || live >= MAX_LIVE) return;
    lastPlay[name] = now;
    live++;
    whenUnlocked(() => srcOf(name).then((src) => {
      const el = new Audio(src);
      el.volume = Math.min(1, vol('sfx') * (SFX_VOL[name] || 0.7) * k);
      const done = () => { live = Math.max(0, live - 1); el.removeAttribute('src'); };
      el.addEventListener('ended', done, { once: true });
      el.addEventListener('error', done, { once: true });
      el.play().catch(done);
    }));
  }
  const unitAttack = {};
  function attack(id) {
    const now = performance.now() / 1000;
    if (now - (unitAttack[id] || 0) < UNIT_GAP) return;
    unitAttack[id] = now;
    sfx(ATTACK[id] || 'gun', 0.8);
  }

  // ---------- voice ----------
  // one line at a time; a unit speaks at most every 15 s, anyone at most every 4 s (priority lines skip the queue);
  // skill lines only half the time, so a long fight is not a stream of shouts
  let voiceEl = null, voiceUntil = 0;
  const unitLast = {};
  function voice(id, line, prio) {
    if (settings.mute || away || !settings.voice) return false;
    const lines = (window.LAO_VOICES || {})[id] || [];
    if (!lines.includes(line)) {
      const alt = { SpSkill: 'BattleFocus', BattleFocus: 'SpSkill', SortiePick: 'Join', StageStart: 'SortiePick' }[line];
      if (!alt || !lines.includes(alt)) return false;
      line = alt;
    }
    const now = performance.now() / 1000;
    if (!prio && (line === 'SpSkill' || line === 'BattleFocus') && Math.random() < 0.5) return false;
    if (!prio && (now < voiceUntil || now - (unitLast[id] || -99) < 15)) return false;
    unitLast[id] = now;
    voiceUntil = now + 4;
    whenUnlocked(() => {
      if (voiceEl) { voiceEl.pause(); voiceEl.src = ''; }
      const el = new Audio(`assets/voice/${id}/${line}.mp3`);
      el.volume = vol('voice');
      voiceEl = el;
      duck(true);
      const end = () => { if (voiceEl === el) duck(false); };
      el.addEventListener('ended', end, { once: true });
      el.addEventListener('error', end, { once: true });
      el.play().catch(end);
    });
    return true;
  }

  function set(key, value) {
    settings[key] = value;
    save();
    if (bgmEl) bgmEl.volume = vol('bgm');
    if (voiceEl) voiceEl.volume = vol('voice');
  }

  window.AUDIO = { bgm, sfx, attack, voice, set, get settings() { return settings; }, get away() { return away; }, ATTACK };
})();
