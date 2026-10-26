// Battle view: plays BattleSim events with the Last Origin SD rigs (js/sd.js) on three.js.
// The simulator decides everything; this file only shows it (clips, dashes, hit effects, bars, numbers).
(function () {
  'use strict';
  const RO = window.ROSTER;
  const DT = 1 / 60; // simulator step
  const SD_K = 0.27; // rig units -> world units
  const VIEW_H = 10; // world units visible vertically (wider when the screen is narrow)
  const BG_ASPECT = 2048 / 912;
  const GROUND = 0.43; // share of the background image (from the bottom) that is floor
  const COL_X = [2.5, 5.5]; // front / back column distance from the centre line
  const ROW_SCALE = [0.9, 1, 1.1]; // far rows a little smaller
  const HEAD = 1.75; // bar height above the feet (world units, before row scale); the lowest, see headHeight
  const HEAD_MAX = 3.0;
  // wave field camera: shifted right so the formation stands in the left third with the spawn edge at the right edge
  const CAM_X = 0.3, VIEW_HALF_W = 9.8; // base line (-7.4) to the spawn edge (9.6)
  const FLOOR = 0.71; // share of the screen height (from the bottom) that is floor on the wave field
  const ROW_SPREAD = 3.0; // world units from the front row to the back row (the three rows are the three lanes)
  const TILE_RX = 0.95, TILE_RY = 0.34; // formation cell tile half sizes (world units, before the row scale)
  const FLIERS = ['sylphid', 'harpy', 'sleipnir', 'undine', 'thetis'];
  // ★2 wears the original NS1 skin, ★3 the NS2 skin (NS1 when there is none); js/skins.js lists what was built
  function skinOf(id, star, kind) {
    const have = ((window.SD_SKINS || {})[kind || 'rigs'] || {})[id] || [];
    if (star >= 5 && have.includes(2)) return id + '_s2'; // gold stars: the second skin
    if (star >= 3 && have.includes(1)) return id + '_s1'; // silver stars: the first skin
    return id;
  }
  const baseOf = (rig) => rig.replace(/_s[12]$/, '');
  // the original role + rank icon (shield = 보호기, sword = 공격기, gear = 지원기; colour / wings = rank)
  const starHtml = (n) => (window.Stars ? Stars.html(n) : '★'.repeat(n));
  const roleIcon = (d) => `assets/ui/role_${d.role}_${Math.max(1, Math.min(4, d.tier || 1))}.webp`;

  const $ = (id) => document.getElementById(id);
  let renderer, scene, camera;
  let view = { halfW: 9, halfH: 5, W: 1, H: 1, groundY: -0.7, bottom: -5, cx: 0 };
  let sim = null, units = [], byUid = {};
  let running = false, speed = 1, acc = 0, ended = false;
  let lineup = { left: RO.PRESETS.left.units.map((x) => x.slice()), right: RO.PRESETS.right.units.map((x) => x.slice()) };
  let teamNames = [RO.PRESETS.left.name, RO.PRESETS.right.name];
  let seed = 1;
  const MODE = /[?&]sandbox(?:[=&]|$)/.test(location.search) ? 'sandbox' : 'run'; // run: js/shop.js drives the battles
  const api = { onEnd: null, onLayout: null };
  let setupToken = 0;
  let waveOpts = null; // set: the field shows a WaveSim (PvE) instead of a BattleSim
  let baseMesh = null, baseLabel = null, baseHit = 0;
  const fx = []; // short-lived three meshes { obj, t, life, update }

  // ---------- setup ----------
  function initGL() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    $('gl').appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-9, 9, 5, -5, -100, 100);
    camera.position.set(0, 0, 50);
    SD.gpuSkin = renderer.capabilities.floatVertexTextures;
    SD.renderer = renderer;
    if (window.FXB) FXB.renderer = renderer; // baked original effects upload their atlases at load time
    SD.crossfade = 0.14;
    SD.pinRoot = true; // attack clips keep their travel near the cell; the game moves melee units itself
    SD.pinRange = 0.9 / SD_K;
    SD.pinSkip = {};
    for (const id of FLIERS) for (const r of [id, id + '_s1', id + '_s2']) SD.pinSkip[r] = ['atk', 'skill'];
    // a victory pose stays on its cell (some rigs step back into their neighbours, a flier swoops off screen, a
    // jump reaches into the row behind); the death clip keeps the soft range like an attack
    SD.pinClipRange = { win: 0 };
    SD.pinRanges = {};
    // units whose attack clip travels to the target: the game carries them, so the clip's own travel stays short
    for (const id in window.ANIM_EV || {}) if (ANIM_EV[id].atk && ANIM_EV[id].atk.mv && !FLIERS.includes(id)) for (const r of [id, id + '_s1', id + '_s2']) SD.pinRanges[r] = 0.3 / SD_K;
    SD.mipmaps = renderer.capabilities.isWebGL2;
    SD.texScale = 0.5; // js/sd/<id>.a50 atlases
    // phones (touch screens): the half-size effect atlases (js/fx/<name>.h.webp), a third of the download and GPU memory
    if (window.FXB && window.matchMedia && matchMedia('(pointer: coarse)').matches) FXB.texScale = 0.5;
    window.addEventListener('resize', resize);
    resize();
  }

  // mobile-style fixed design resolution: the whole game is laid out at 1280x720 and scaled to the screen
  // (letterboxed), so every UI element keeps its place on any landscape device. A portrait screen gets the same
  // landscape game turned a quarter clockwise (no "please rotate" wall): window.toStage / toStageRect map screen
  // coordinates (pointer events, getBoundingClientRect) back to design pixels in either case.
  const DESIGN_W = 1280, DESIGN_H = 720;
  let stageK = 1, stageRot = false, stageTX = 0, stageTY = 0;
  function fitStage() {
    const st = $('stage'), vw = window.innerWidth, vh = window.innerHeight;
    stageRot = vh > vw;
    const W = stageRot ? vh : vw, H = stageRot ? vw : vh; // the screen as the landscape game sees it
    stageK = Math.min(W / DESIGN_W, H / DESIGN_H);
    st.style.width = DESIGN_W + 'px'; st.style.height = DESIGN_H + 'px';
    if (stageRot) { // design (x, y) -> screen (tx - k*y, ty + k*x)
      stageTX = (vw - DESIGN_H * stageK) / 2 + DESIGN_H * stageK; stageTY = (vh - DESIGN_W * stageK) / 2;
      st.style.transform = `translate(${stageTX}px, ${stageTY}px) rotate(90deg) scale(${stageK})`;
    } else {
      stageTX = (vw - DESIGN_W * stageK) / 2; stageTY = (vh - DESIGN_H * stageK) / 2;
      st.style.transform = `translate(${stageTX}px, ${stageTY}px) scale(${stageK})`;
    }
    document.body.classList.toggle('rotated', stageRot);
    window.STAGE_K = stageK;
    window.STAGE_ROT = stageRot;
  }
  // screen pixels -> design pixels of #stage
  window.toStage = (x, y) => {
    const X = x - stageTX, Y = y - stageTY;
    return stageRot ? { x: Y / stageK, y: -X / stageK } : { x: X / stageK, y: Y / stageK };
  };
  window.toStageRect = (r) => {
    const a = window.toStage(r.left, r.top), b = window.toStage(r.right, r.bottom);
    const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  function resize() {
    fitStage();
    const field = $('field');
    const W = field.clientWidth || DESIGN_W, H = field.clientHeight || DESIGN_H;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * stageK); // crisp after the CSS scale
    renderer.setSize(W, H);
    const aspect = W / H;
    let halfH = VIEW_H / 2;
    const needHalfW = MODE === 'run' ? VIEW_HALF_W : COL_X[1] + 2.6;
    if (halfH * aspect < needHalfW) halfH = needHalfW / aspect;
    const halfW = halfH * aspect;
    const cx = MODE === 'run' ? CAM_X : 0;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.position.x = cx;
    camera.updateProjectionMatrix();
    const bottom = -halfH;
    const px = W / (2 * halfW);
    // the bottom controls cover part of the field (game UI over a full-screen battlefield): the floor of the
    // background starts a third of the way down, so the formation stands between the top bar and the controls
    const panelPx = parseFloat(getComputedStyle(document.body).getPropertyValue('--panel-h')) || 0;
    let bgW, bgH;
    if (MODE === 'run') {
      bgH = (H * FLOOR) / GROUND / px; // world units: floor from 29% of the height down
      bgW = Math.max(2 * halfW, bgH * BG_ASPECT); bgH = bgW / BG_ASPECT;
    } else { bgW = Math.max(2 * halfW, 2 * halfH * BG_ASPECT); bgH = bgW / BG_ASPECT; }
    view = { halfW, halfH, W, H, bottom, groundY: bottom + bgH * GROUND, panel: panelPx / px, cx };
    const bg = $('bg');
    bg.style.width = bgW * px + 'px';
    bg.style.height = bgH * px + 'px';
    bg.style.left = (W - bgW * px) / 2 + 'px';
    bg.style.top = (H - bgH * px) + 'px';
    for (const u of units) placeHome(u);
    for (const c of cells) { const h = homeOf(0, c.col, c.row); c.g.position.set(h.x, h.y, 0); }
    if (api.onLayout) api.onLayout();
  }

  function rowY(row) {
    // rows spread over the floor: row 0 just below the far edge, row 2 near the bottom
    // narrow (portrait) screens have more floor than needed: keep the three rows close together under the far edge
    const top = view.groundY - 0.45, low = Math.max(view.bottom + (view.panel || 0) + 1.05, top - ROW_SPREAD);
    return top + (low - top) * (row / 2);
  }
  function homeOf(side, col, row) {
    const s = side === 0 ? -1 : 1;
    const persp = 1 + (row - 1) * 0.07;
    if (MODE === 'run') return { x: WaveSim.FIELD.allyX[col] * persp, y: rowY(row) }; // wave field: 3x3 formation on the left
    return { x: s * COL_X[col] * persp, y: rowY(row) };
  }
  // where a wave enemy stands now (it walks along its lane)
  const laneX = (s) => s.x * (1 + (s.row - 1) * 0.07);
  function placeHome(u) {
    u.home = u.s.enemy ? { x: laneX(u.s), y: rowY(u.row) } : homeOf(u.side, u.col, u.row);
    if (!u.dash) u.holder.position.set(u.home.x, u.home.y, 0);
  }
  function toScreen(x, y) {
    return [(x - view.cx + view.halfW) / (2 * view.halfW) * view.W, (view.halfH - y) / (2 * view.halfH) * view.H];
  }

  // ---------- units ----------
  function ellipse(color, opacity, rx, ry) {
    const g = new THREE.CircleGeometry(1, 40);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.scale.set(rx, ry, 1);
    return mesh;
  }
  function ring(color, opacity, r, w) {
    const g = new THREE.RingGeometry(r - w, r, 48);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, ...ADD_LIGHT });
    const mesh = new THREE.Mesh(g, m);
    mesh.scale.set(1, 0.32, 1);
    return mesh;
  }

  const isWave = () => !!(sim && sim.kind === 'wave');
  // Iron Bug rigs differ wildly in size (a normal Predator is taller than most bosses): each one is scaled to the
  // height of its rank instead, like the defence project (world units, before the row scale)
  const ENEMY_H = { normal: 2.5, elite: 3.4, boss: 4.6 };
  const ENEMY_LABEL = { normal: '철충', elite: '엘리트', boss: '보스' };
  // head icons at the hp bar's right end: class (경장 / 중장 / 기동, Iron Bugs too) and the original squad emblem (allies).
  // Hover (mouse) or long press (touch) shows the names; the lobby setting turns them off (setHeadIcons)
  let tipEl = null, tipOwner = null, tipTimer = 0, tipSwallow = false;
  // where the bars sit (world units above the feet, before the row / star scale): over the top of the sprites hung
  // on the rig's head bone in its current pose, so hovering and tall units are not covered while big weapons, shields
  // and wings held above the head do not push the bar up. Sprite rects run a little past the drawn hair (the trim).
  // Rigs without a head bone use the whole idle-pose box
  const HEAD_RE = [/^(parts_|bone_)?head(_bone)?$/i, /head/i];
  function headHeight(u) {
    const s = u.s, c = u.c;
    if (s.enemy) return ENEMY_H[s.enemy] * 0.92;
    const tpl = c && SD.template(c.tpl.id);
    if (!tpl || !tpl.box) return HEAD;
    let top = tpl.box.max.y;
    const nodes = tpl.data && tpl.data.nodes, P = tpl.parent;
    let h = -1;
    if (nodes && P) for (const re of HEAD_RE) { h = nodes.findIndex((n) => re.test(n.n) && !/set|ring|goggle/i.test(n.n)); if (h >= 0) break; }
    if (h >= 0) {
      const under = (k) => { for (let x = k; x >= 0; x = P[x]) if (x === h) return true; return false; };
      let y1 = -Infinity;
      tpl.rends.forEach((r, k) => {
        const sp = tpl.sprites[c.rKey[k]];
        if (r.kind !== 0 || r.add || !sp || !c.EA[r.node] || !c.rEn[k] || c.rCol[k * 4 + 3] < 0.05 || !under(r.node)) return;
        const o = r.node * 12, W = c.W;
        for (const [lx, ly] of [[sp.x0, sp.y0], [sp.x1, sp.y0], [sp.x0, sp.y1], [sp.x1, sp.y1]]) {
          const fx = c.rFlip[k] ? -lx : lx, fy = c.rFlipY[k] ? -ly : ly;
          y1 = Math.max(y1, W[o + 1] * fx + W[o + 4] * fy + W[o + 10]);
        }
      });
      if (isFinite(y1)) top = y1;
    }
    return Math.max(HEAD, Math.min(HEAD_MAX, c.root.position.y + c.root.scale.y * top - 0.12));
  }
  const headOf = (u) => (u.headH == null ? (u.headH = headHeight(u)) : u.headH); // measured once the rig has posed
  function headTags(s) {
    const d = s.def || {}, t = document.createElement('div'), tip = [];
    t.className = 'htag';
    if (RO.CLASS_NAME[d.cls]) { t.insertAdjacentHTML('beforeend', `<i class="c"><img src="assets/ui/cls_${d.cls}.png" alt=""></i>`); tip.push(RO.CLASS_NAME[d.cls]); }
    if (!s.enemy && d.squad) {
      t.insertAdjacentHTML('beforeend', `<i class="q"><img src="assets/ui/squad_${d.squad}.webp" alt=""></i>`);
      t.lastChild.firstChild.onerror = function () { this.parentNode.remove(); };
      tip.push(d.squadName || d.squad);
    }
    t.dataset.tip = tip.join(' · ');
    t.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showTip(t); });
    t.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
    t.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => { showTip(t); tipSwallow = true; }, 400);
    });
    const up = () => { clearTimeout(tipTimer); if (tipOwner === t) tipTimer = setTimeout(hideTip, 1200); };
    t.addEventListener('pointerup', up);
    t.addEventListener('pointercancel', up);
    t.addEventListener('click', (e) => { if (tipSwallow) { tipSwallow = false; e.stopPropagation(); } }); // a long press is not a tap
    t.addEventListener('contextmenu', (e) => e.preventDefault());
    return t;
  }
  function showTip(t) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'htagTip'; $('stage').appendChild(tipEl); } // design pixels
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    tipOwner = t;
    placeTip();
  }
  function placeTip() {
    if (!tipOwner) return;
    if (!tipOwner.isConnected || tipOwner.closest('.dead') || document.body.classList.contains('noHtag')) { hideTip(); return; }
    const r = window.toStageRect(tipOwner.getBoundingClientRect());
    tipEl.style.left = (r.left + r.width / 2) + 'px';
    tipEl.style.top = r.top + 'px';
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; tipOwner = null; }
  function setHeadIcons(on) { document.body.classList.toggle('noHtag', !on); if (!on) hideTip(); }
  function buildUnits() {
    for (const u of units) disposeUnit(u);
    clearOrigFx();
    units = []; byUid = {};
    $('overlay').innerHTML = '';
    for (const s of sim.units) buildUnit(s);
  }
  function buildUnit(s) {
    {
      const def = s.def;
      const holder = new THREE.Group();
      const k = ROW_SCALE[s.row] * (1 + 0.07 * ((s.star || 1) - 1)); // each star: 7% taller (★7 = 1.42x)
      const order = 100 + s.row * 100 + (1 - s.col) * 10;
      const kr = k * (s.enemy ? ENEMY_H[s.enemy] / ENEMY_H.normal : 1); // footprint of big bugs
      const shadow = ellipse(0x000000, 0.42, 0.85 * kr, 0.24 * kr);
      shadow.renderOrder = order - 5;
      const teamRing = ring((s.star || 1) > 1 ? 0xffd36e : s.side === 0 ? 0x4fb4ff : 0xff5a6a, 0.55, 1.0 * kr, (s.star || 1) > 1 ? 0.12 : 0.07);
      teamRing.renderOrder = order - 4;
      const shieldRing = ring(0xcfe6ff, 0.0, 1.15 * kr, 0.12);
      shieldRing.renderOrder = order - 3;
      holder.add(shadow, teamRing, shieldRing);
      const halo = !s.enemy && (s.star || 1) > 1 ? makeHalo(s.star, k, order) : null; // growth: a halo that grows with the star
      if (halo) holder.add(halo.group);
      const flip = new THREE.Group();
      // bioroid rigs face right (the right-hand team is mirrored); Iron Bug rigs already face left in the original
      flip.scale.set((s.enemy || s.side === 0 ? 1 : -1) * k, k, 1);
      holder.add(flip);
      scene.add(holder);
      const rig = s.enemy ? s.rig : skinOf(s.id, s.star || 1);
      const c = SD.create(rig) || SD.create(s.id);
      const tpl = c && SD.template(c.tpl.id);
      if (c) {
        if (s.enemy && tpl && tpl.height > 0) { // normalised to its rank's height, feet on the ground, centred
          const ek = ENEMY_H[s.enemy] / tpl.height;
          c.root.scale.set(ek, ek, 1);
          c.root.position.set(-(tpl.box.min.x + tpl.box.max.x) / 2 * ek, -tpl.box.min.y * ek, 0);
        } else {
          c.root.scale.set(SD_K, SD_K, 1);
          c.root.position.set(-c.W[9] * SD_K, -c.W[10] * SD_K, 0); // stand on the rig's own ground pivot
        }
        c.setTint(0.92, 0.92, 0.92);
        c.setOrder(order);
        flip.add(c.root);
        c.play('idle');
      }
      // DOM bar
      const bar = document.createElement('div');
      bar.className = 'ubar ' + (s.side === 0 ? 'l' : 'r');
      // over the head: bars only (no rank or name); allies also show their star grade
      bar.innerHTML = (s.enemy ? '' : `<div class="sg">${starHtml(s.star || 1)}</div>`) +
        '<div class="hp"><i></i><b></b></div><div class="mp"><i></i></div><div class="st"></div>';
      bar.addEventListener('click', () => showInfo(s.uid));
      $('overlay').appendChild(bar);
      const u = {
        uid: s.uid, s, side: s.side, col: s.col, row: s.row, k, order, holder, flip, c, shadow, teamRing, shieldRing, bar, halo, rig: c && c.tpl ? c.tpl.id : rig,
        hpI: bar.querySelector('.hp i'), shB: bar.querySelector('.hp b'), mpI: bar.querySelector('.mp i'), mp: bar.querySelector('.mp'), st: bar.querySelector('.st'),
        dash: null, flashT: 0, knock: 0, dieT: -1, fade: 1,
        headH: null,
      };
      if (s.enemy) bar.classList.add('enemy', s.enemy);
      if (s.gear && s.gear.length && window.Items) { // equipped gear: small icons beside the bar
        const g = document.createElement('div');
        g.className = 'gear';
        g.innerHTML = s.gear.map((it) => `<img src="${Items.icon(it)}" alt="">`).join('');
        bar.appendChild(g);
      }
      if (s.def) { bar.appendChild(headTags(s)); bar.classList.add('tagged'); }
      placeHome(u);
      units.push(u); byUid[u.uid] = u;
      fxPrepare(u.rig); // its original attack / skill effects start loading
      return u;
    }
  }

  // ---------- growth halo (★2 soft blue, ★3 gold with turning rays, ★4 shifting rainbow with rising sparks) ----------
  let raysTex = null;
  function rays() {
    if (raysTex) return raysTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.translate(64, 64);
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      const gr = g.createLinearGradient(0, 0, 0, -64);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -64); g.lineTo(5, 0); g.fill();
    }
    raysTex = new THREE.CanvasTexture(cv);
    return raysTex;
  }
  // growth halo by star: bronze glow, silver glow (+rays), gold glow + rays (+gold sparks), ★7 rainbow
  const HALO = {
    2: { color: 0xd08a4a, size: 1.6, op: 0.4 },
    3: { color: 0xcfe4ff, size: 1.9, op: 0.55 },
    4: { color: 0xcfe4ff, size: 2.1, op: 0.62, rays: 0.45 },
    5: { color: 0xffc84a, size: 2.4, op: 0.7, rays: 0.65 },
    6: { color: 0xffc84a, size: 2.7, op: 0.8, rays: 0.85, sparks: true, sparkHue: 0.12 },
    7: { color: 0xffffff, size: 3.0, op: 0.85, rays: 1, rainbow: true, sparks: true },
  };
  function makeHalo(star, k, order) {
    const h = HALO[Math.min(7, star)];
    const group = new THREE.Group();
    const mat = (map, op) => new THREE.MeshBasicMaterial({ map, color: h.color, transparent: true, opacity: op, depthTest: false, depthWrite: false, ...ADD_LIGHT });
    const glowM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(glow(), h.op));
    glowM.scale.set(h.size * k, h.size * k * 1.15, 1);
    glowM.position.y = 1.0 * k;
    glowM.renderOrder = order - 6;
    group.add(glowM);
    let rayM = null;
    if (h.rays) {
      rayM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(rays(), h.rays));
      rayM.scale.set(h.size * 1.1 * k, h.size * 1.1 * k, 1);
      rayM.position.y = 1.0 * k;
      rayM.renderOrder = order - 7;
      group.add(rayM);
    }
    return { group, glowM, rayM, h, k, t: Math.random() * 6, sparkT: 0, order };
  }
  function updateHalo(u, dt) {
    const H = u.halo;
    if (!H) return;
    H.t += dt;
    const pulse = 1 + 0.08 * Math.sin(H.t * 2.4);
    H.glowM.material.opacity = H.h.op * (0.85 + 0.15 * Math.sin(H.t * 3.1)) * (u.s.alive ? 1 : Math.max(0, 1 - u.dieT));
    H.glowM.scale.set(H.h.size * H.k * pulse, H.h.size * H.k * 1.15 * pulse, 1);
    if (H.rayM) { H.rayM.rotation.z += dt * 0.5; H.rayM.material.opacity = H.h.rays * (u.s.alive ? 1 : 0); }
    if (H.h.rainbow) { const c = new THREE.Color().setHSL((H.t * 0.15) % 1, 0.8, 0.65); H.glowM.material.color.copy(c); if (H.rayM) H.rayM.material.color.copy(c); }
    if (H.h.sparks && u.s.alive) { // tiny rising lights
      H.sparkT -= dt;
      if (H.sparkT <= 0) {
        H.sparkT = 0.18;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow(), color: new THREE.Color().setHSL(H.h.sparkHue != null ? H.h.sparkHue + Math.random() * 0.04 : Math.random(), 0.9, 0.7), transparent: true, depthTest: false, depthWrite: false, ...ADD_LIGHT }));
        const x0 = u.holder.position.x + (Math.random() - 0.5) * 1.4 * H.k, y0 = u.holder.position.y + Math.random() * 0.6 * H.k;
        m.position.set(x0, y0, 0);
        m.renderOrder = H.order + 5;
        addFx(m, 1.1, (f, p) => { m.position.y = y0 + p * 2.2 * H.k; const sz = 0.22 * (1 - p * 0.5); m.scale.set(sz, sz, 1); m.material.opacity = 1 - p; });
      }
    }
  }

  function disposeUnit(u) {
    fxStop(u);
    if (u.c) u.c.dispose();
    scene.remove(u.holder);
    for (const m of [u.shadow, u.teamRing, u.shieldRing]) { m.geometry.dispose(); m.material.dispose(); }
    if (u.halo) for (const m of [u.halo.glowM, u.halo.rayM]) if (m) { m.geometry.dispose(); m.material.dispose(); }
  }

  // ---------- effects ----------
  function addFx(obj, life, update) {
    scene.add(obj);
    fx.push({ obj, t: 0, life, update });
  }
  function chest(u) { return { x: u.holder.position.x, y: u.holder.position.y + 1.0 * u.k }; }

  function tracer(from, to, color, width) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 0.01) return; // a target that already left the field
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, ...ADD_LIGHT });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
    mesh.rotation.z = Math.atan2(dy, dx);
    mesh.scale.set(len, width, 1);
    mesh.renderOrder = 900;
    addFx(mesh, 0.14, (f, p) => { m.opacity = 0.9 * (1 - p); mesh.scale.y = width * (1 - p * 0.6); });
  }
  // soft radial glow (a canvas texture: works from file:// too)
  let glowTex = null;
  function glow() {
    if (glowTex) return glowTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(cv);
    return glowTex;
  }
  function burst(at, color, size, life) {
    const m = new THREE.MeshBasicMaterial({ map: glow(), color, transparent: true, opacity: 1, depthTest: false, depthWrite: false, ...ADD_LIGHT });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.position.set(at.x + (Math.random() - 0.5) * 0.3, at.y + (Math.random() - 0.5) * 0.3, 0);
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.renderOrder = 910;
    addFx(mesh, life || 0.25, (f, p) => { const s = size * (0.5 + p * 1.1); mesh.scale.set(s * 1.4, s * 0.9, 1); m.opacity = 1 - p * p; });
  }
  function groundWave(u, color, size) {
    const mesh = ring(color, 0.9, 1, 0.18);
    mesh.position.set(u.holder.position.x, u.holder.position.y, 0);
    mesh.renderOrder = u.order - 2;
    addFx(mesh, 0.6, (f, p) => { const s = size * (0.3 + p); mesh.scale.set(s, s * 0.32, 1); mesh.material.opacity = 0.9 * (1 - p); });
  }
  function screenFlash(color) {
    const d = document.createElement('div');
    d.className = 'flash';
    d.style.background = color;
    $('overlay').appendChild(d);
    setTimeout(() => d.remove(), 400);
  }
  function floatText(u, text, cls, dy) {
    const [x, y] = toScreen(u.holder.position.x, u.holder.position.y + (headOf(u) - 0.2) * u.k);
    const d = document.createElement('div');
    d.className = 'num ' + (cls || '');
    d.textContent = text;
    d.style.left = x + (Math.random() * 30 - 15) + 'px';
    d.style.top = y - (dy || 0) + 'px';
    $('overlay').appendChild(d);
    setTimeout(() => d.remove(), 950);
  }
  function skillBanner(u, name) {
    const [x, y] = toScreen(u.home.x, u.home.y + (headOf(u) + 0.55) * u.k);
    const d = document.createElement('div');
    d.className = 'skillname';
    d.textContent = name;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    $('overlay').appendChild(d);
    setTimeout(() => d.remove(), 1350);
  }

  // ---------- original effects (tools/fxbuild: Unity-baked from the original prefabs, played by js/fxbake.js) ----------
  // Every attack / skill clip replays the original clip's effect timeline (js/fx/_meta.js timelines):
  //   p   EventThrowProjectile*Fire<n>: the projectile flies from the rig's _fire<n> (baked position at that moment)
  //       to the target along the original path (line / curve / howitzer / cannon), its hit effect plays where it lands
  //   h / hg   EventHit / EventHitGround: the hit effect on the target's body / at its feet
  //   e / eg   EventThrowEffect / EventThrowEffectGround: an effect on the target's body / at its feet
  //   b   EventBuffeffect: an effect on the caster
  // and the character's own particles (muzzle flashes, auras) baked along the clip play attached to the rig.
  // Effects are in Unity world units = rig units: they hang under the rig root or use its world scale.
  const FXM = () => window.FX_META || { meta: {}, timelines: {}, fires: {}, clips: [] };
  const ofx = []; // live original effect instances { inst, update(dt) -> bool alive }
  const OFX_MAX = 140;
  let clipSet = null;
  const hasClipFx = (name) => (clipSet || (clipSet = new Set(FXM().clips || []))).has(name);
  function fxPrepare(rig) {
    if (!window.FXB) return;
    const M = FXM(), tl = M.timelines[rig];
    if (!tl) return;
    for (const clip in tl) {
      if (hasClipFx(`C__${rig}__${clip}`)) FXB.prepare(`C__${rig}__${clip}`);
      for (const e of tl[clip].ev) {
        if (!e[3] || !M.meta[e[3]]) continue;
        FXB.prepare(e[3]);
        const h = M.meta[e[3]].hit;
        if (h && M.meta[h]) FXB.prepare(h);
      }
    }
  }
  function fxReady(name) { return !!(name && window.FXB && FXM().meta[name] && FXB.ready(name)); }
  // world scale of one rig unit for this unit (rig root scale x the unit's growth)
  function rigScale(u) { return u.c ? Math.abs(u.c.root.scale.x) * u.k : SD_K * u.k; }
  function face(u) { return u.s.enemy || u.side === 0 ? 1 : -1; }
  function feet(u) { return { x: u.holder.position.x, y: u.holder.position.y }; }
  function spawnAt(name, at, k, fc, order, late = 0) {
    if (ofx.length >= OFX_MAX || !fxReady(name)) return null;
    const inst = FXB.create(name);
    if (!inst) return null;
    inst.root.position.set(at.x, at.y, 0);
    inst.root.scale.set(k * fc, k, 1);
    inst.setOrder(order || 900);
    scene.add(inst.root);
    if (late > 0) inst.update(late); // fired between frames: start where it would be had it spawned on time
    ofx.push({ inst, update(dt) { inst.update(dt); return !inst.done; } });
    return inst;
  }
  // Projectile.cs paths: LINE / CURVE / HOWITZER / CANNON as Bezier curves along the shot (from the Defence port)
  function projPath(b, f) {
    const sx = b.sx, sy = b.sy, ex = b.ex, ey = b.ey, dist = Math.hypot(ex - sx, ey - sy);
    if (b.type <= 0) return [sx + (ex - sx) * f, sy + (ey - sy) * f, ex - sx, ey - sy];
    const fx = (ex - sx) / (dist || 1), fy = (ey - sy) / (dist || 1);
    let nx = -fy, ny = fx;
    if (ny < 0 || (ny === 0 && nx * (ex - sx) < 0)) { nx = -nx; ny = -ny; }
    let a1, h1, a2, h2;
    if (b.type === 1) { a1 = a2 = 0.5; h1 = h2 = b.h; } else { const r = b.type === 2 ? 0.5 : 0.3; a1 = r * 0.7; h1 = h2 = r * 0.7; a2 = b.type === 2 ? a1 : 1 - a1; }
    const c1x = sx + (fx * a1 + nx * h1) * dist, c1y = sy + (fy * a1 + ny * h1) * dist;
    const c2x = sx + (fx * a2 + nx * h2) * dist, c2y = sy + (fy * a2 + ny * h2) * dist;
    const m = 1 - f;
    const x = m * m * m * sx + 3 * m * m * f * c1x + 3 * m * f * f * c2x + f * f * f * ex;
    const y = m * m * m * sy + 3 * m * m * f * c1y + 3 * m * f * f * c2y + f * f * f * ey;
    const dx = 3 * m * m * (c1x - sx) + 6 * m * f * (c2x - c1x) + 3 * f * f * (ex - c2x);
    const dy = 3 * m * m * (c1y - sy) + 6 * m * f * (c2y - c1y) + 3 * f * f * (ey - c2y);
    return [x, y, dx, dy];
  }
  const _v = new THREE.Vector3();
  // run fn with the rig posed at clip time t (an event that fell between frames), then restore this frame's pose
  function poseAt(c, t, fn) {
    if (!c || !c.clip || Math.abs(c.time - t) < 1e-4) return fn();
    const t0 = c.time;
    const pose = () => { c.apply(); if (c.fadeD) c.blend(); c.render(); };
    c.time = Math.max(0, Math.min(t, c.clip.dur - 1e-4)); pose();
    try { return fn(); } finally { c.time = t0; pose(); }
  }
  function nodeByPath(c, path) {
    const t = c.tpl;
    if (!t.byPath) t.byPath = new Map(t.data.nodes.map((x, i) => [x.path, i]));
    const i = t.byPath.get(path);
    return i == null ? -1 : i;
  }
  function firePoint(u, a, ev) {
    const F = FXM().fires[a.rig], at = F && F[a.clip];
    const row = at && (at[String(ev[0])] || at[ev[0].toFixed(4).replace(/0+$/, '').replace(/\.$/, '')]);
    const p = row && (row[ev[2]] || row[1]);
    if (p && u.c) {
      // [dx, dy, bonePath]: an offset from that bone as the web rig poses it now; [x, y]: baked with the root at the origin
      let ox = 0, oy = 0;
      const bi = p[2] != null ? nodeByPath(u.c, p[2]) : -1;
      if (bi >= 0) { const b = u.c.posU(bi); ox = b[0]; oy = b[1]; } else { const r0 = u.c.posU(0); ox = r0[0]; oy = r0[1]; }
      u.holder.updateMatrixWorld(true);
      _v.set(p[0] + ox, p[1] + oy, 0);
      u.c.mesh.localToWorld(_v);
      return { x: _v.x, y: _v.y };
    }
    return { x: u.holder.position.x + 0.7 * face(u) * u.k, y: u.holder.position.y + 1.05 * u.k };
  }
  // tools: in-battle placement probe (window.FX_ANC = { rig: { clip: <C__rig__clip.anc.json> } } from the bake):
  // the live rig's nearest kept ancestor of _fire<n> against Unity's at the event, % of the rig's height
  function ancProbe(u, a, ev) {
    const A = window.FX_ANC && FX_ANC[a.rig] && FX_ANC[a.rig][a.clip];
    const row = A && (A[String(ev[0])] || A[ev[0].toFixed(4).replace(/0+$/, '').replace(/[.]$/, '')]);
    const chain = row && row[String(ev[2] || 1)];
    if (!chain || !u.c) return;
    const nodes = u.c.tpl.data.nodes, anim = (nodes.find((x) => x.path === '') || {}).n;
    const ai = chain.findIndex((x) => x[0] === anim), top = ai < 0 ? chain.length - 1 : ai;
    for (let k = 0; k <= top; k++) {
      const bi = nodeByPath(u.c, chain.slice(k, top).map((x) => x[0]).reverse().join('/'));
      if (bi < 0) continue;
      const g = u.c.posU(bi), r0 = u.c.posU(0), H = u.c.tpl.height > 0 ? u.c.tpl.height : 5;
      FX_SYNC_LOG.push(['place', a.rig, a.clip, ev[0], Math.hypot(g[0] - r0[0] - chain[k][1], g[1] - r0[1] - chain[k][2]) / H * 100, nodes[bi].n, [g[0] - r0[0], g[1] - r0[1]], [chain[k][1], chain[k][2]], u.c.time, u.c.clipName]);
      return;
    }
  }
  function shoot(u, a, ev, dst, late = 0) {
    const M = FXM(), meta = M.meta[ev[3]];
    const from = poseAt(u.c, ev[0], () => { if (window.FX_SYNC_LOG) ancProbe(u, a, ev); return firePoint(u, a, ev); }), to = chest(dst), k = rigScale(u);
    if (!fxReady(ev[3]) || ofx.length >= OFX_MAX) { tracer(from, to, u.side === 0 ? 0x9fe0ff : 0xffb0a0, 0.06); return; }
    const inst = FXB.create(ev[3]);
    if (!inst) return;
    inst.root.scale.set(k, k, 1);
    inst.setOrder(905);
    scene.add(inst.root);
    const b = { sx: from.x, sy: from.y, ex: to.x, ey: to.y, t: 0, T: Math.max(0.08, meta.T), type: meta.type, h: 0.1 + Math.random() * 0.3 };
    const head = late; // advanced on its first update
    ofx.push({
      inst,
      update(dt) {
        if (b.first !== false) { dt += head; b.first = false; }
        b.t += dt;
        if (dst.s.alive) { const c2 = chest(dst); b.ex = c2.x; b.ey = c2.y; }
        const f = Math.min(1, b.t / b.T), [x, y, dx, dy] = projPath(b, f);
        inst.root.position.set(x, y, 0);
        inst.root.rotation.z = Math.atan2(dy, dx);
        inst.update(dt);
        if (f >= 1) { if (meta.hit) spawnAt(meta.hit, { x: b.ex, y: b.ey }, k * (meta.hitScale || 1), 1, 910); inst.dispose(); return false; }
        return true;
      },
      dispose() { inst.dispose(); },
    });
  }
  // a new action: start the clip's original timeline (and its attached particles)
  function fxStart(u, e) {
    if (!window.FXB || !u.c) return false;
    const rig = u.rig, tl = FXM().timelines[rig], clipTl = tl && tl[e.clip];
    fxStop(u);
    const a = { rig, clip: e.clip, ev: clipTl ? clipTl.ev : [], i: 0, t: 0, target: e.target, attached: null };
    const cname = `C__${rig}__${e.clip}`;
    if (hasClipFx(cname) && FXB.ready(cname) && ofx.length < OFX_MAX) {
      const inst = FXB.create(cname);
      if (inst) { const r0 = u.c.posU(0); inst.root.position.set(r0[0], r0[1], 0); inst.setOrder(u.order + 40); u.c.mesh.add(inst.root); a.attached = inst; } // baked with the root at the origin
    }
    u.fxa = a;
    // the sim's hits show the original effects instead of the generic tracer / glow when the clip has any
    u.origFx = a.ev.some((x) => x[1] === 'p' || ((x[1] === 'h' || x[1] === 'hg') && fxReady(x[3])));
    return true;
  }
  function fxStop(u) {
    const a = u.fxa;
    if (!a) return;
    if (window.FX_SYNC_LOG && a.i < a.ev.length) FX_SYNC_LOG.push(['cut', a.rig, a.clip, a.i, a.ev.length, a.t, u.s.alive ? 1 : 0]); // events not reached
    if (a.attached) { a.attached.dispose(); a.attached = null; }
    u.fxa = null;
  }
  function fxUnit(u, dt) {
    const a = u.fxa;
    if (!a) return;
    // the rig left the clip (win / idle / hit / die): the original stops the attack's events with its animation
    if (u.c && u.c.clipName !== a.clip) { fxStop(u); return; }
    const sp = u.c ? u.c.speed || 1 : 1;
    a.t += dt * sp;
    if (a.attached) { a.attached.update(dt * sp); if (a.attached.done) { a.attached.dispose(); a.attached = null; } }
    const dst = byUid[a.target];
    while (a.i < a.ev.length && a.ev[a.i][0] <= a.t) {
      const ev = a.ev[a.i++];
      const late = Math.max(0, (a.t - ev[0]) / sp); // real seconds since the event's moment (frames are discrete)
      // tools: timing check (clip time of the event, the rig's playhead, the playhead the effect starts at)
      if (window.FX_SYNC_LOG && u.c) FX_SYNC_LOG.push([a.rig, a.clip, ev[0], u.c.clipName === a.clip ? u.c.time : -1, ev[1], u.c.clipName === a.clip ? u.c.time - late * sp : -1]);
      if (!u.s.alive) continue;
      const k = rigScale(u), fc = face(u);
      if (ev[1] === 'p') { if (dst) shoot(u, a, ev, dst, late); }
      else if (ev[1] === 'b') spawnAt(ev[3], chest(u), k, fc, u.order + 45, late);
      else if (dst) spawnAt(ev[3], ev[1].endsWith('g') ? feet(dst) : chest(dst), k, fc, 910, late);
    }
    if (!a.attached && a.i >= a.ev.length) u.fxa = null;
  }
  function updateOrigFx(dt) {
    for (let i = ofx.length - 1; i >= 0; i--) if (!ofx[i].update(dt)) { if (ofx[i].inst.root.parent) ofx[i].inst.dispose(); ofx.splice(i, 1); }
  }
  function clearOrigFx() {
    for (const o of ofx) o.inst.dispose();
    ofx.length = 0;
  }

  // ---------- simulator events ----------
  const SKILL_COLOR = { damage: 0xffd36e, mark: 0xd78bff, buff: 0xffa040, shield: 0xcfe6ff, protect: 0x7fc4ff, taunt: 0xff6a6a };

  // js/audio.js loads after this file: look AUDIO up at call time
  const A = { sfx: (...a) => window.AUDIO && AUDIO.sfx(...a), attack: (id) => window.AUDIO && AUDIO.attack(id), voice: (...a) => window.AUDIO && AUDIO.voice(...a) };
  const ENEMY_SFX = { normal: 'gun', elite: 'cannon', boss: 'expM' };
  function onEvent(e) {
    switch (e.type) {
      case 'action': {
        const u = byUid[e.uid];
        if (!u || !u.c) break;
        const cl = u.c.tpl.data.clips[e.clip];
        u.c.speed = cl ? cl.dur / e.dur : e.rate; // skins can have their own clip length
        u.c.play(e.clip, () => { u.c.speed = 1; });
        fxStart(u, e); // the clip's original effects
        const t = byUid[e.target];
        // the original clip moves the unit (dash / slash): the game carries it to its target and back on those frames
        u.actMelee = !!(e.mv && t && !FLIERS.includes(u.s.id));
        if (u.actMelee) {
          const dir = u.side === 0 ? 1 : -1;
          u.dash = { t: 0, mv: e.mv, to: { x: t.home.x - dir * 1.35, y: t.home.y + 0.02 } };
          u.c.setOrder(u.order + 60); // in front of the unit it attacks
        }
        if (e.skill) {
          if (u.side === 0) { A.voice(u.s.id, Math.random() < 0.5 ? 'SpSkill' : 'BattleFocus'); A.sfx('charge', 0.7); } else A.sfx('energy', 0.6);
          skillBanner(u, e.skillName);
          groundWave(u, SKILL_COLOR[e.kind] || 0xffffff, 2.4 * u.k);
        }
        break;
      }
      case 'hit': {
        const src = byUid[e.src], dst = byUid[e.dst];
        if (!dst || !src) break;
        if (e.kind !== 'splash') { if (src.s.enemy) A.sfx(ENEMY_SFX[src.s.enemy], src.s.enemy === 'normal' ? 0.5 : 0.8); else A.attack(src.s.id); }
        const def = src.s.def;
        const isSkill = e.kind === 'skill';
        if (!src.actMelee && !src.origFx) {
          const from = { x: src.holder.position.x + (src.side === 0 ? 0.7 : -0.7) * src.k, y: src.holder.position.y + 1.05 * src.k };
          tracer(from, chest(dst), isSkill ? (SKILL_COLOR[def.skill.kind] || 0xffffff) : (src.side === 0 ? 0x9fe0ff : 0xffb0a0), isSkill ? 0.16 : 0.06);
        }
        if (!src.origFx) burst(chest(dst), isSkill ? 0xffd36e : 0xffffff, isSkill ? 0.75 : 0.42);
        dst.flashT = 0.12;
        dst.knock = 0.12 * (dst.side === 0 ? -1 : 1);
        let cls = e.crit ? 'crit' : e.adv > 0 ? 'adv' : '';
        if (e.kind === 'splash') cls += ' small';
        floatText(dst, (e.crit ? '치명 ' : '') + e.amount + (e.adv > 0 ? '▲' : e.adv < 0 ? '▼' : ''), cls);
        if (e.crit && isSkill) screenFlash('rgba(255,220,140,0.6)');
        break;
      }
      case 'heal': {
        const dst = byUid[e.dst];
        if (!dst || e.amount <= 0) break;
        floatText(dst, '+' + e.amount, 'heal');
        groundWave(dst, 0x8dff9a, 1.6 * dst.k);
        break;
      }
      case 'shield': {
        const dst = byUid[e.dst];
        if (!dst) break;
        floatText(dst, '보호막 ' + e.amount, 'shield', 14);
        groundWave(dst, 0xcfe6ff, 1.6 * dst.k);
        break;
      }
      case 'protect': {
        const dst = byUid[e.dst];
        if (!dst) break;
        floatText(dst, e.taunt ? '도발' : '전원 보호', 'shield', 14);
        groundWave(dst, e.taunt ? 0xff6a6a : 0x7fc4ff, 3.2 * dst.k);
        break;
      }
      case 'buff': {
        const dst = byUid[e.dst];
        if (!dst) break;
        floatText(dst, '강화', 'buff', 14);
        groundWave(dst, 0xffa040, 1.6 * dst.k);
        break;
      }
      case 'mark': {
        const dst = byUid[e.dst];
        if (!dst) break;
        floatText(dst, '표식', 'mark', 30);
        break;
      }
      case 'miss': {
        const dst = byUid[e.dst];
        if (dst) floatText(dst, '회피', 'miss');
        break;
      }
      case 'wait': {
        const u = byUid[e.uid];
        if (u) floatText(u, '사거리 밖', 'small', 20);
        break;
      }
      case 'guard': {
        const g = byUid[e.guard];
        if (g && !g.guardShown) { g.guardShown = 0.6; floatText(g, '보호', 'guard', 26); }
        break;
      }
      case 'die': {
        const u = byUid[e.uid];
        if (!u) break;
        if (u.s.enemy) A.sfx(u.s.enemy === 'normal' ? 'expS' : 'expB', u.s.enemy === 'normal' ? 0.6 : 1);
        else A.voice(u.s.id, 'Retreat', true);
        u.dash = null;
        fxStop(u);
        u.dieT = 0;
        if (u.c) { u.c.speed = 1; u.c.play('die'); }
        u.bar.classList.add('dead');
        break;
      }
      case 'spawn': {
        const s = sim.units.find((x) => x.uid === e.uid);
        if (s) { const u = buildUnit(s); if (u.c) u.c.play('move', null, true); }
        break;
      }
      case 'walk': { const u = byUid[e.uid]; if (u && u.c) { u.c.speed = 1; u.c.play('move', null, true); } break; }
      case 'stop': { const u = byUid[e.uid]; if (u && u.c && u.c.clipName === 'move') u.c.play('idle'); break; }
      case 'breach': {
        const u = byUid[e.uid];
        if (u) { u.dieT = 999; u.bar.classList.add('dead'); floatText(u, '기지 피해 -' + e.amount, 'crit'); }
        screenFlash('rgba(255,60,60,0.45)');
        baseHit = 0.6;
        A.sfx('quake');
        break;
      }
      case 'gimmick': { // boss trick: banner over the boss, a warning strip and a flash
        const u = byUid[e.uid];
        const color = { summon: 'rgba(255,70,90,0.35)', shield: 'rgba(120,170,255,0.35)', silence: 'rgba(200,80,255,0.35)', regen: 'rgba(110,255,150,0.3)' }[e.kind];
        if (u) { skillBanner(u, e.text); groundWave(u, { summon: 0xff4a5a, shield: 0x8fb4ff, silence: 0xc070ff, regen: 0x7dff9a }[e.kind] || 0xffffff, 3.4 * u.k); }
        screenFlash(color);
        gimAlert(`${u ? u.s.def.name : '보스'} · ${e.text}`, e.kind);
        A.sfx('warning');
        break;
      }
      case 'seal': {
        const u = byUid[e.dst];
        if (u) { floatText(u, '봉인 ' + e.dur + '초', 'mark', 24); groundWave(u, 0xc070ff, 1.8 * u.k); }
        break;
      }
      case 'end': endBattle(e); break;
    }
  }
  function gimAlert(text, kind) {
    const d = document.createElement('div');
    d.className = 'gimAlert ' + kind;
    d.textContent = text;
    $('overlay').appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  function endBattle(e) {
    ended = true; running = false;
    for (const u of units) {
      if (u.s.alive && u.c && (!isWave() || u.side === 0)) { u.c.speed = 1; u.c.play(u.c.has('win') && (!isWave() || e.result === 'clear') ? 'win' : 'idle', null, true); }
      u.dash = null;
    }
    if (isWave()) { // the stage UI (js/shop.js) shows the result
      $('status').textContent = e.result === 'clear' ? '웨이브 방어 성공' : '기지 함락';
      if (api.onEnd) setTimeout(() => api.onEnd(e, sim), 1100);
      return;
    }
    const t = $('resultText');
    t.className = e.winner === 0 ? 'win' : e.winner === 1 ? 'lose' : '';
    t.textContent = e.winner === 0 ? '승리' : e.winner === 1 ? '패배' : '무승부';
    const left = sim.units.filter((u) => u.side === 0 && u.alive).length, right = sim.units.filter((u) => u.side === 1 && u.alive).length;
    $('resultSub').textContent = `${sim.time.toFixed(1)}초 · 생존 ${left} : ${right}${e.reason === 'time' ? ' · 시간 초과 (남은 체력 비교)' : ''}`;
    if (api.onEnd) setTimeout(() => api.onEnd(e, sim), 1400);
    else setTimeout(() => { $('result').hidden = false; }, 1400);
    $('status').textContent = '전투 종료';
    $('btnStart').disabled = true;
  }

  // ---------- per frame ----------
  function updateUnits(dt) {
    if (baseMesh) { baseHit = Math.max(0, baseHit - dt); baseMesh.material.opacity = 0.3 + baseHit; baseMesh.material.color.setHex(baseHit > 0 ? 0xff5050 : 0x4fb4ff); }
    for (let i = units.length - 1; i >= 0; i--) { // wave enemies that have faded out leave the scene
      const u = units[i];
      if (u.s.enemy && u.fade <= 0) { disposeUnit(u); u.bar.remove(); units.splice(i, 1); delete byUid[u.uid]; }
    }
    for (const u of units) {
      if (u.s.enemy && u.s.alive) u.home.x = laneX(u.s);
      if (u.s.enemy && u.dieT === 999) { u.fade = Math.max(0, u.fade - dt * 3); if (u.c) u.c.setOpacity(u.fade); if (u.fade <= 0) u.holder.visible = false; continue; } // breached
      // melee trip to the target and back, on the clip's own movement frames
      let x = u.home.x, y = u.home.y;
      if (u.drag) { // prep: picked up by the player, eased towards the pointer
        const d = u.drag, f = Math.min(1, dt * 18);
        d.x += (d.tx - d.x) * f; d.y += (d.ty - d.y) * f;
        x = d.x; y = d.y;
      } else if (u.dash) {
        const d = u.dash, m = d.mv;
        d.t += dt;
        const ease = (p) => p * p * (3 - 2 * p);
        let p = 0;
        if (d.t < m[0]) p = 0;
        else if (d.t < m[1]) p = ease((d.t - m[0]) / Math.max(0.01, m[1] - m[0]));
        else if (d.t < m[2]) p = 1;
        else if (d.t < m[3]) p = 1 - ease((d.t - m[2]) / Math.max(0.01, m[3] - m[2]));
        else { u.dash = null; u.c && u.c.setOrder(u.order); }
        x += (d.to.x - u.home.x) * p; y += (d.to.y - u.home.y) * p;
      }
      if (u.knock) { x += u.knock; u.knock *= Math.pow(0.0001, dt); if (Math.abs(u.knock) < 0.002) u.knock = 0; }
      u.holder.position.set(x, y, 0);
      if (u.c) {
        u.c.update(dt);
        if (u.flashT > 0) { u.flashT -= dt; u.c.setTint(1, u.flashT > 0 ? 0.45 : 0.92, u.flashT > 0 ? 0.45 : 0.92); if (u.flashT <= 0) u.c.setTint(0.92, 0.92, 0.92); }
        else if (u.s.sealedT > 0) { u.c.setTint(0.42, 0.38, 0.55); u.wasSealed = true; } // 봉인: greyed out, not acting
        else if (u.wasSealed) { u.c.setTint(0.92, 0.92, 0.92); u.wasSealed = false; }
        if (u.dieT >= 0) {
          u.dieT += dt;
          const dur = u.c.clip ? u.c.clip.dur : 1;
          if (u.c.clipName === 'die' && u.c.time > dur - 0.05) u.c.speed = 0; // hold the last frame
          if (u.dieT > dur + 0.2) { u.fade = Math.max(0, u.fade - dt * 1.5); u.c.setOrder(u.order - 50); u.c.setOpacity(u.fade); }
          u.shadow.material.opacity = 0.42 * Math.max(0, 1 - u.dieT);
          u.teamRing.material.opacity = 0.55 * Math.max(0, 1 - u.dieT * 2);
          if (u.fade <= 0) u.holder.visible = false;
        }
      }
      if (u.guardShown) { u.guardShown -= dt; if (u.guardShown <= 0) u.guardShown = 0; }
      updateHalo(u, dt);
      // shield ring
      const s = u.s;
      u.shieldRing.material.opacity = s.alive && (s.shield > 0 || s.barrierT > 0) ? 0.45 + 0.15 * Math.sin(performance.now() / 150) + (s.barrierT > 0 ? 0.3 : 0) : 0;
      u.shieldRing.material.color.setHex(s.barrierT > 0 ? 0x9f8cff : s.tauntT > 0 ? 0xff6a6a : 0xcfe6ff);
    }
  }

  // tall and flying units carry their bars higher, so bars of one column could sit on each other: a farther row's
  // bar stays at least BAR_GAP px above the nearer one (allies, by their home cells; fallen units make room)
  const BAR_GAP = 30;
  function barLifts() {
    const cols = {}, lift = {};
    for (const u of units) if (!u.s.enemy && u.home && u.s.alive) (cols[u.side + ':' + u.col] = cols[u.side + ':' + u.col] || []).push(u);
    for (const k in cols) {
      let cur = Infinity;
      for (const u of cols[k].sort((a, b) => b.row - a.row)) {
        const y = toScreen(u.home.x, u.home.y + headOf(u) * u.k)[1], to = Math.min(y, cur - BAR_GAP);
        lift[u.uid] = y - to;
        cur = to;
      }
    }
    return lift;
  }
  function updateBars() {
    let hp = [0, 0], max = [0, 0];
    const lift = barLifts();
    for (const u of units) {
      const s = u.s;
      hp[s.side] += s.hp; max[s.side] += s.maxHp;
      if (!s.alive && u.bar.classList.contains('dead')) continue;
      const [x, y] = toScreen(u.holder.position.x, u.holder.position.y + headOf(u) * u.k);
      u.bar.style.left = x + 'px';
      u.bar.style.top = y - 30 - (lift[u.uid] || 0) + 'px';
      u.hpI.style.width = (s.hp / s.maxHp * 100) + '%';
      const sh = Math.min(s.shield, s.maxHp);
      u.shB.style.left = (s.hp / s.maxHp * 100) + '%';
      u.shB.style.width = Math.min(100 - s.hp / s.maxHp * 100, sh / s.maxHp * 100) + '%';
      u.mpI.style.width = (s.mana / BattleSim.MANA_MAX * 100) + '%';
      u.mp.classList.toggle('full', s.mana >= BattleSim.MANA_MAX);
      u.st.textContent = (s.sealedT > 0 ? '🔒' : '') + (s.barrierT > 0 || s.protectT > 0 || s.tauntT > 0 ? '🛡' : '') + (s.regenOn ? '♻' : '') + (s.buffT > 0 ? '⬆' : '') + (s.markT > 0 ? '🎯' : '') + (s.waiting ? '…' : '');
    }
    placeTip(); // the name bubble follows its unit and goes with it
    $('hpL').style.width = (hp[0] / (max[0] || 1) * 100) + '%';
    if (isWave()) { // right bar: Iron Bugs left in this wave; centre: the wave
      $('hpR').style.width = (sim.remaining() / (sim.total || 1) * 100) + '%';
      $('timer').textContent = `${sim.wave}/${sim.waves || WaveSim.WAVES}`;
      if (baseLabel) {
        const [bx, by] = toScreen(baseMesh.position.x, rowY(2) - 0.75); // under the barrier, clear of the synergy list
        baseLabel.style.left = bx + 'px'; baseLabel.style.top = by + 'px';
        baseLabel.textContent = '기지 ♥ ' + sim.baseHp;
      }
      return;
    }
    $('hpR').style.width = (hp[1] / max[1] * 100) + '%';
    $('timer').textContent = Math.max(0, Math.ceil(sim.TIME_LIMIT - sim.time));
  }

  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      f.update(f, p);
      if (p >= 1) { scene.remove(f.obj); f.obj.geometry.dispose(); f.obj.material.dispose(); fx.splice(i, 1); }
    }
  }

  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepWorld(real * (running || ended ? speed : 1));
    requestAnimationFrame(frame);
  }
  // one world step of dt game seconds (also BATTLE.tick: tools step the field without the browser's frame clock)
  function stepWorld(dt) {
    dragStep(dt);
    if (running) {
      acc += dt;
      while (acc >= DT && running) {
        acc -= DT;
        for (const e of sim.step(DT)) onEvent(e);
      }
    }
    updateUnits(dt);
    for (const u of units) fxUnit(u, dt);
    updateOrigFx(dt);
    updateFx(dt);
    if (sim) updateBars();
    updateCells(dt);
    renderer.render(scene, camera);
  }

  // ---------- info panel ----------
  // the original 3x3 area as a mini grid (left column = the side facing the attacker)
  function gridHtml(sk) {
    const g = sk.grid || [];
    let h = '<span class="mini' + (sk.fixed ? ' fixed' : '') + '">';
    for (let i = 0; i < 9; i++) h += '<i class="' + (g[i] ? 'on' : '') + '"></i>';
    return h + '</span>';
  }
  function areaName(sk) {
    const n = (sk.grid || []).reduce((a, b) => a + b, 0);
    if (sk.fixed) return n >= 9 ? '적 전체' : '고정 범위';
    if (n <= 1) return '단일';
    if (n >= 9) return '적 전체';
    return '범위 ' + n + '칸';
  }
  const KIND_DESC = {
    damage: (sk) => `공격력 ${Math.round(sk.rate * 100)}% 피해 · ${areaName(sk)}`,
    mark: (sk) => `표식: 8초간 받는 피해 +25% · ${areaName(sk)}`,
    buff: () => '아군 전원 6초간 공격력 +30%, 행동 속도 +20%',
    shield: () => '아군 전원에게 공격력 120% 보호막 (8초)',
    protect: () => '6초간 아군 전원이 받는 피해의 50%를 대신 받고 방어력 +50%',
    taunt: () => '6초간 도발, 방어력 +50%',
  };
  function skillHtml(label, sk, kind) {
    const tags = [`사거리 ${sk.range}`];
    if (sk.pierce) tags.push('보호 무시');
    return `<div class="sk"><div class="skh">${gridHtml(sk)}<div><span class="lbl">${label}</span> <b>${sk.name || '-'}</b><br>` +
      `<span class="desc">${KIND_DESC[kind](sk)}</span><br><span class="tg">${tags.join(' · ')}</span></div></div></div>`;
  }
  let infoCell = null; // the formation cell whose unit the info panel shows (its tile turns gold)
  function showInfo(uid) {
    const u = byUid[uid];
    if (!u) return;
    infoCell = u.s.enemy ? null : { col: u.col, row: u.row };
    if (u.s.enemy) { // Iron Bug
      const d = u.s.def, box = $('info');
      if (!box.hidden && box.dataset.key === 'e' + uid) { box.hidden = true; return; }
      box.dataset.key = 'e' + uid;
      box.innerHTML = `<h3><span class="tier e${u.s.enemy}">${ENEMY_LABEL[u.s.enemy]}</span> ${d.name}</h3><div class="sub">${RO.CLASS_NAME[d.cls]} ${RO.ROLE_NAME[d.role]} · 사거리 ${d.basic.range}</div>` +
        `<div class="grid"><span>체력</span><span>${Math.round(u.s.hp)} / ${d.hp}</span><span>공격력</span><span>${d.atk}</span><span>방어력</span><span>${d.def}</span><span>기지 피해</span><span>${d.breach}</span></div>` +
        (d.skill ? `<div class="sk"><b>${d.skill.name}</b><br><span class="desc">게이지가 차면 넓은 범위 포격 (보호 무시)</span></div>` : '');
      box.hidden = false;
      return;
    }
    renderInfo('u' + uid, u.s.def, Math.round(u.s.hp), u.s.star || 1, u.s.gear);
  }
  // d: the unit's definition (stars already applied for battle units)
  function gearHtml(gear) {
    if (!gear || !gear.length || !window.Items) return '';
    return '<div class="sk"><span class="lbl">장비</span>' + gear.map((it) => `<div class="gearRow"><img src="${Items.icon(it)}" alt=""><b>${Items.label(it)}</b> <span class="desc">${Items.describe(it)}</span></div>`).join('') + '</div>';
  }
  function renderInfo(key, d, hpNow, star, gear) {
    const box = $('info');
    if (!box.hidden && box.dataset.key === key) { box.hidden = true; return; }
    const adv = { light: '중장', heavy: '기동', air: '경장' }[d.cls];
    box.dataset.key = key;
    box.innerHTML = `<h3><img class="ricon" src="${roleIcon(d)}" alt=""><span class="tier t${d.tier}">${RO.TIER_NAME[d.tier]}</span> ${d.name} ${starHtml(star)}</h3>` +
      `<div class="sub">${d.fullName || ''} · ${RO.CLASS_NAME[d.cls]} ${RO.ROLE_NAME[d.role]} · ${adv}에게 강함${d.squadName ? '<br>부대: ' + d.squadName + (window.Synergy && Synergy.hasSquad(d.squad) ? '' : ' (시너지 없음)') : ''}</div>` +
      `<div class="grid"><span>체력</span><span>${hpNow == null ? d.hp : hpNow + ' / ' + d.hp}</span><span>공격력</span><span>${d.atk}</span><span>방어력</span><span>${d.def}</span>` +
      `<span>공격 간격</span><span>${d.aspd}초</span><span>치명타</span><span>${Math.round(d.crit * 100)}%</span><span>회피</span><span>${Math.round(d.eva * 100)}%</span></div>` +
      skillHtml('기본', d.basic, 'damage') + skillHtml('스킬', d.skill, d.skill.kind) + gearHtml(gear) +
      (d.role === 'tank' ? '<div class="sk note">보호기: 같은 줄 후열 아군이 받는 피해의 50%를 대신 받습니다.</div>' : '') +
      '<div class="sk note">사거리: 내 열 + 대상 열 + 1 (전열 0, 후열 1). 수치는 원작 데이터 기준.</div>';
    box.hidden = false;
  }

  // ---------- synergies ----------
  let synData = [[], []];
  function renderSynergies() {
    synData = ((sim && sim.synergies) || [[], []]).map((list) => list.filter((x) => x.count > 0)); // hide classes nobody has
    ['synL', 'synR'].forEach((elId, side) => {
      const el = $(elId);
      el.innerHTML = synData[side].map((x, i) => {
        const next = x.steps.find((st) => st > x.count);
        const pips = x.steps.map((st, j) => (j < x.level ? `<b>${st}</b>` : st)).join('·');
        return `<div class="row ${x.kind}${x.active ? ' on' : ''}" data-side="${side}" data-i="${i}" data-key="${x.key}">` +
          `<span class="cnt">${x.count}</span><span class="nm">${x.name}</span><span class="pips">${next ? x.count + '/' + next : pips}</span></div>`;
      }).join('');
    });
  }
  function synTip(row) {
    const tip = $('synTip');
    if (!row) { tip.hidden = true; return; }
    const x = synData[+row.dataset.side][+row.dataset.i];
    if (!x) return;
    const names = x.members.map((id) => RO.BY_ID[id].name).join(', ');
    tip.innerHTML = `<h4>${x.name} <span class="lv">${x.kind === 'class' ? '분류' : '부대'} · ${x.count}명</span></h4>` +
      x.steps.map((st, j) => `<div class="lv${j === x.level - 1 ? ' cur' : ''}">(${st}) ${x.desc[j]}</div>`).join('') +
      `<div class="mem">${names}</div>` + (x.kind === 'class' ? '' : '<div class="lv">서로 다른 대원 수로 셉니다</div>');
    const r = window.toStageRect(row.getBoundingClientRect()); // design pixels
    tip.hidden = false;
    const left = +row.dataset.side === 0 ? r.right + 8 : r.left - 8 - tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(DESIGN_W - tip.offsetWidth - 4, left)) + 'px';
    tip.style.top = Math.max(4, Math.min(DESIGN_H - tip.offsetHeight - 4, r.top)) + 'px';
  }
  ['synL', 'synR'].forEach((id) => {
    const el = $(id);
    el.addEventListener('pointerover', (e) => synTip(e.target.closest('.row')));
    el.addEventListener('pointerleave', () => synTip(null));
    el.addEventListener('click', (e) => synTip(e.target.closest('.row')));
  });

  // the base line of the wave field: a glowing barrier with the base's hp over it
  function buildBase() {
    if (baseMesh) { scene.remove(baseMesh); baseMesh.geometry.dispose(); baseMesh.material.dispose(); baseMesh = null; }
    if (baseLabel) { baseLabel.remove(); baseLabel = null; }
    if (!isWave()) return;
    const top = rowY(0) + 1.4, bot = rowY(2) - 0.5;
    if (!(top - bot > 0)) return; // the field has not been measured yet
    baseMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, top - bot), new THREE.MeshBasicMaterial({ map: glow(), color: 0x4fb4ff, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, ...ADD_LIGHT }));
    baseMesh.position.set(WaveSim.FIELD.baseX, (top + bot) / 2, 0);
    baseMesh.renderOrder = 50;
    scene.add(baseMesh);
    baseLabel = document.createElement('div');
    baseLabel.className = 'baseLabel';
    $('overlay').appendChild(baseLabel);
  }

  // ---------- formation cell tiles (wave field) ----------
  // flat hexagonal tiles on the floor under the player's 3x3 formation, like the original battle grid: a thin
  // outline with bright corners over a faint fill, concentric with the unit's shadow and team ring. js/shop.js
  // sets each cell's state while it drags (BATTLE.setCells); the tiles fade away once the wave runs
  const CELL_LOOK = {
    empty: { line: 0x9cc4ea, lo: 0.34, fill: 0x9cc4ea, fo: 0.05 },
    filled: { line: 0x5fc0ff, lo: 0.6, fill: 0x5fc0ff, fo: 0.1 },
    can: { line: 0x5fc0ff, lo: 0.85, fill: 0x5fc0ff, fo: 0.16, pulse: 0.15 }, // a free cell the dragged unit may go to
    hot: { line: 0xc4f0ff, lo: 1.0, fill: 0x8fd8ff, fo: 0.32 }, // under the pointer: the drop is allowed
    blocked: { line: 0xff7a7a, lo: 0.9, fill: 0xff6a6a, fo: 0.11 }, // under the pointer: the drop is not allowed
    sel: { line: 0xffd36e, lo: 1.0, fill: 0xffd36e, fo: 0.12 }, // the dragged unit's own cell / the unit in the info panel
  };
  let cells = [], cellTex = null, cellGeo = null, cellFade = 1;
  function tileTex() {
    if (cellTex) return cellTex;
    const W = 512, H = 184, pad = 6;
    const pts = [[pad, H / 2], [W * 0.26, pad], [W * 0.74, pad], [W - pad, H / 2], [W * 0.74, H - pad], [W * 0.26, H - pad]];
    const path = (g) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
    const make = (draw) => { const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };
    const line = make((g) => {
      path(g); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) { // bright corners: a short tick along both edges of every vertex
        const p = pts[i];
        for (const q of [pts[(i + 5) % 6], pts[(i + 1) % 6]]) { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + (q[0] - p[0]) * 0.16, p[1] + (q[1] - p[1]) * 0.16); g.stroke(); }
      }
    });
    const fill = make((g) => {
      const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.3)');
      path(g); g.fillStyle = gr; g.fill();
    });
    cellTex = { line, fill };
    return cellTex;
  }
  function buildCells() {
    const prev = {}; // the field is rebuilt between waves and after every move: the cells keep their states
    for (const c of cells) { prev[c.col + ',' + c.row] = c.state; scene.remove(c.g); c.fill.material.dispose(); c.line.material.dispose(); }
    cells = []; cellFade = 1; infoCell = null;
    if (!isWave()) return;
    const tex = tileTex();
    if (!cellGeo) cellGeo = new THREE.PlaneGeometry(2, 2);
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) {
      const h = homeOf(0, col, row), k = ROW_SCALE[row];
      const g = new THREE.Group();
      g.position.set(h.x, h.y, 0);
      g.scale.set(TILE_RX * k, TILE_RY * k, 1); // far rows smaller, like the units on them
      const fill = new THREE.Mesh(cellGeo, new THREE.MeshBasicMaterial({ map: tex.fill, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      const line = new THREE.Mesh(cellGeo, new THREE.MeshBasicMaterial({ map: tex.line, transparent: true, opacity: 0, depthTest: false, depthWrite: false, ...ADD_LIGHT }));
      fill.renderOrder = 60; line.renderOrder = 61; // under every unit's shadow (their orders start at 95)
      g.add(fill, line);
      scene.add(g);
      cells.push({ col, row, g, fill, line, state: prev[col + ',' + row] || 'empty', lo: 0, fo: 0 });
    }
  }
  // { 'col,row': 'empty' | 'filled' | 'can' | 'hot' | 'blocked' | 'sel' }; cells left out keep their state
  function setCells(states) {
    for (const c of cells) { const s = states && states[c.col + ',' + c.row]; if (s && CELL_LOOK[s]) c.state = s; }
  }
  function updateCells(dt) {
    if (!cells.length) return;
    cellFade = Math.max(0, Math.min(1, cellFade + (running || ended ? -dt * 2.5 : dt * 3))); // gone while the wave runs
    const sel = infoCell && !$('info').hidden ? infoCell : null;
    const pulse = Math.sin(performance.now() / 180);
    for (const c of cells) {
      const st = sel && sel.col === c.col && sel.row === c.row && c.state !== 'hot' && c.state !== 'blocked' ? 'sel' : c.state;
      const L = CELL_LOOK[st], p = L.pulse ? L.pulse * pulse : 0, e = Math.min(1, dt * 12);
      c.lo += (L.lo + p - c.lo) * e;
      c.fo += (L.fo + p * 0.4 - c.fo) * e;
      c.line.material.opacity = c.lo * cellFade; c.fill.material.opacity = c.fo * cellFade;
      c.line.material.color.setHex(L.line); c.fill.material.color.setHex(L.fill);
      c.g.visible = cellFade > 0.01;
    }
  }

  // ---------- flow ----------
  async function setup() {
    const token = ++setupToken;
    if (!sim) $('loading').classList.remove('done');
    $('result').hidden = true;
    $('info').hidden = true;
    running = false; ended = false; acc = 0;
    sim = waveOpts ? WaveSim.create(Object.assign({ roster: RO, enemies: window.LAO_ENEMIES, animEv: window.ANIM_EV || {}, clipMeta: window.CLIP_META || {}, synergy: window.Synergy }, waveOpts))
      : BattleSim.create({ left: lineup.left, right: lineup.right, seed, roster: RO, animEv: window.ANIM_EV || {}, clipMeta: window.CLIP_META || {}, synergy: window.Synergy });
    const ids = [...new Set(sim.units.map((u) => skinOf(u.id, u.star || 1)).concat(sim.rigs || []))];
    let done = 0;
    await Promise.all(ids.map((id) => SD.prepare(id).then((t) => (t || id === baseOf(id) ? t : SD.prepare(baseOf(id)))).then(() => { done++; $('loading').textContent = `SD 불러오는 중… ${done}/${ids.length}`; })));
    if (token !== setupToken) return; // a newer line-up arrived while this one loaded
    buildUnits();
    renderSynergies();
    buildBase();
    buildCells();
    $('nameL').textContent = teamNames[0];
    $('nameR').textContent = teamNames[1];
    $('status').textContent = '배치 완료';
    $('btnStart').disabled = false;
    $('loading').classList.add('done');
  }

  function start() {
    if (running || ended) return;
    running = true;
    $('status').textContent = '전투 중';
    $('btnStart').disabled = true;
  }

  function randomTeams() {
    const ids = RO.ROSTER.map((r) => r.id).sort(() => Math.random() - 0.5);
    const build = (pick) => {
      // tanks in front of supports, other melee in front, ranged behind
      const tanks = pick.filter((id) => RO.BY_ID[id].role === 'tank');
      const supports = pick.filter((id) => RO.BY_ID[id].role === 'support');
      const others = pick.filter((id) => !tanks.includes(id) && !supports.includes(id));
      const front = [], back = [];
      const short = (id) => RO.BY_ID[id].basic.range <= 2; // short reach: must stand in front
      for (const id of [...tanks, ...others.filter(short), ...supports.filter(short)]) (front.length < 3 ? front : back).push(id);
      for (const id of [...supports.filter((id) => !short(id)), ...others.filter((id) => !short(id))]) (back.length < 3 ? back : front).push(id);
      return [...front.map((id, i) => [id, 0, i]), ...back.map((id, i) => [id, 1, i])];
    };
    lineup = { left: build(ids.slice(0, 6)), right: build(ids.slice(6, 12)) };
    teamNames = ['오르카 무작위 소대', '적 무작위 소대'];
  }

  function bindUI() {
    $('btnStart').onclick = start;
    $('btnReset').onclick = () => { seed++; setup(); };
    $('btnAgain').onclick = () => { seed++; setup(); };
    $('btnShuffle').onclick = () => { seed++; randomTeams(); setup(); };
    document.querySelectorAll('.speed button').forEach((b) => {
      b.onclick = () => {
        speed = +b.dataset.speed;
        document.querySelectorAll('.speed button').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && MODE === 'sandbox') { e.preventDefault(); start(); }
      if (e.key === '1' || e.key === '2' || e.key === '4') document.querySelector(`.speed button[data-speed="${e.key}"]`).click();
    });
  }

  // ---------- drag (prep): the picked-up SD walks after the pointer ----------
  // a unit on the formation is lifted off its cell; a bench card gets a temporary SD of the same rig and star.
  // Positions come in stage (design) pixels: #field covers the stage, so they are field pixels too.
  let dragSD = null; // { u } or { temp: { holder, flip, c, k, x, y, tx, ty } }
  const DRAG_ORDER = 5000; // over every unit while carried
  function fieldToWorld(px, py) {
    return { x: view.cx - view.halfW + px / view.W * 2 * view.halfW, y: view.halfH - py / view.H * 2 * view.halfH };
  }
  function dragBegin(o) {
    dragEnd();
    if (o.col != null) {
      const u = units.find((x) => x.side === 0 && !x.s.enemy && x.col === o.col && x.row === o.row);
      if (!u) return;
      u.drag = { x: u.holder.position.x, y: u.holder.position.y, tx: u.holder.position.x, ty: u.holder.position.y, show: true };
      u.dash = null;
      if (u.c) { u.c.speed = 1; u.c.play(u.c.has('move') ? 'move' : 'idle', null, true); u.c.setOrder(DRAG_ORDER); }
      u.bar.style.visibility = 'hidden';
      dragSD = { u };
      return;
    }
    const star = o.star || 1, rig = skinOf(o.id, star), k = ROW_SCALE[1] * (1 + 0.07 * (star - 1));
    const t = { holder: new THREE.Group(), flip: new THREE.Group(), c: null, k, x: 0, y: 0, tx: 0, ty: 0, placed: false, show: false };
    const shadow = ellipse(0x000000, 0.42, 0.85 * k, 0.24 * k);
    shadow.renderOrder = DRAG_ORDER - 5;
    t.shadow = shadow;
    t.flip.scale.set(k, k, 1);
    t.holder.add(shadow, t.flip);
    t.holder.visible = false;
    scene.add(t.holder);
    dragSD = { temp: t };
    const attach = () => {
      if (!dragSD || dragSD.temp !== t) return; // dropped before the rig was ready
      const c = SD.create(rig) || SD.create(o.id);
      if (!c) return;
      c.root.scale.set(SD_K, SD_K, 1);
      c.root.position.set(-c.W[9] * SD_K, -c.W[10] * SD_K, 0);
      c.setTint(0.92, 0.92, 0.92);
      c.setOrder(DRAG_ORDER);
      t.flip.add(c.root);
      c.play(c.has('move') ? 'move' : 'idle', null, true);
      t.c = c;
    };
    Promise.resolve(SD.prepare(rig)).then(attach, attach);
  }
  // the ally whose SD body is under the pointer (stage pixels): the rig's drawn extent, narrowed to the body so wings
  // and long weapons do not reach into the next cell; nearer rows (drawn in front) win an overlap
  function pickAt(px, py) {
    const p = fieldToWorld(px, py);
    let best = null;
    for (const u of units) {
      if (u.side !== 0 || u.s.enemy || !u.c || !u.holder.visible || u.dieT >= 0) continue;
      const tpl = SD.template(u.c.tpl.id);
      if (!tpl || !tpl.box) continue;
      const fx = u.flip.scale.x, fy = u.flip.scale.y, rp = u.c.root.position, rs = u.c.root.scale.x, h = u.holder.position;
      const xa = h.x + fx * (rp.x + rs * tpl.box.min.x), xb = h.x + fx * (rp.x + rs * tpl.box.max.x);
      const ya = h.y + fy * (rp.y + rs * tpl.box.min.y), yb = h.y + fy * (rp.y + rs * tpl.box.max.y);
      const mid = h.x, half = Math.min(Math.abs(xb - xa) / 2, 0.85 * u.k); // centred on the feet
      const top = Math.min(Math.max(ya, yb), h.y + 2.6 * u.k), bottom = h.y - 0.3 * u.k; // feet to head (and the ring)
      if (p.x < mid - half || p.x > mid + half || p.y < bottom || p.y > top) continue;
      const score = u.order * 10 - Math.abs(p.x - mid);
      if (!best || score > best.score) best = { score, col: u.col, row: u.row };
    }
    return best && { col: best.col, row: best.row };
  }
  // px, py: the pointer in stage pixels; show: false while it is over a panel (the shop / bench draws its own chip)
  function dragMove(px, py, show) {
    if (!dragSD) return;
    const w = fieldToWorld(px, py);
    const d = dragSD.u ? dragSD.u.drag : dragSD.temp;
    d.tx = w.x; d.ty = w.y - 0.1; // feet just under the pointer: the body stays visible above a finger
    if (dragSD.temp && !d.placed) { d.x = d.tx; d.y = d.ty; d.placed = true; }
    d.show = show;
  }
  function dragStep(dt) {
    if (!dragSD) return;
    const u = dragSD.u, t = dragSD.temp, d = u ? u.drag : t, flip = u ? u.flip : t.flip, k = u ? u.k : t.k;
    if (t) { const f = Math.min(1, dt * 18); t.x += (t.tx - t.x) * f; t.y += (t.ty - t.y) * f; t.holder.position.set(t.x, t.y, 0); t.holder.visible = t.placed && d.show; if (t.c) t.c.update(dt); }
    if (u) u.holder.visible = d.show;
    // face where it is being carried (allies face right at rest)
    const vx = d.tx - d.x;
    if (Math.abs(vx) > 0.04) flip.scale.x = (vx < 0 ? -1 : 1) * k;
  }
  function dragEnd() {
    if (!dragSD) return;
    const { u, temp } = dragSD;
    dragSD = null;
    if (u) {
      u.drag = null;
      u.holder.visible = true;
      u.flip.scale.x = u.k;
      u.bar.style.visibility = '';
      if (u.c) { u.c.play('idle', null, true); u.c.setOrder(u.order); }
      placeHome(u);
    }
    if (temp) {
      if (temp.c) temp.c.dispose();
      scene.remove(temp.holder);
      temp.shadow.geometry.dispose(); temp.shadow.material.dispose();
    }
  }

  // screen rectangle of a formation cell: the tile plus the body standing on it (invisible drop zones for the
  // shop's drag and drop; the tile itself is drawn by buildCells)
  function cellRect(side, col, row) {
    const h = homeOf(side, col, row), k = ROW_SCALE[row];
    const gap = Math.abs(rowY(0) - rowY(1)); // rows can sit closer than a unit is tall: zones must not overlap
    const [x0, y0] = toScreen(h.x - TILE_RX * k, h.y - TILE_RY * k + Math.min(2.1 * k, gap * 0.98));
    const [x1, y1] = toScreen(h.x + TILE_RX * k, h.y - TILE_RY * k);
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  }

  initGL();
  bindUI();
  if (MODE === 'sandbox') setup();
  else document.body.classList.add('run-mode');
  requestAnimationFrame(frame);
  Object.assign(api, {
    MODE, start, cellRect, setCells, skinOf, roleIcon, setHeadIcons, dragBegin, dragMove, dragEnd, pickAt,
    tick(sec, fps = 30) { for (let i = 0; i < Math.round(sec * fps); i++) stepWorld(1 / fps); },
    cellStates: () => ({ fade: cellFade, states: Object.fromEntries(cells.map((c) => [c.col + ',' + c.row, c.state])) }), // debugging
    fxStats: () => ({ live: ofx.length, loaded: window.FXB ? FXB.loaded().length : 0, attached: units.filter((u) => u.fxa && u.fxa.attached).length, timelines: units.filter((u) => u.fxa).length }), // debugging
    setBg(url) { const bg = $('bg'); if (url && !bg.src.endsWith(url)) bg.src = url; }, // chapter backgrounds share one layout
    // info panel for a card that is not on the field (shop / bench)
    showCard(id, star = 1, gear, cell) { // cell: { col, row } when the card stands on the formation (its tile turns gold)
      const k = WaveSim.STAR[star] || 1, b = RO.BY_ID[id];
      infoCell = cell || null;
      renderInfo('c' + id + star, Object.assign({}, b, { hp: Math.round(b.hp * k), atk: Math.round(b.atk * k) }), null, star, gear);
    },
    hideInfo() { $('info').hidden = true; },
    // outline the player's synergy rows a card would add to (keys from Synergy.compute)
    highlightSynergy(keys) { document.querySelectorAll('#synL .row').forEach((r) => r.classList.toggle('hl', !!keys && keys.includes(r.dataset.key))); },
    units: () => units,
    // show two line-ups ([[id, col, row, star]]); resolves once the rigs are on the field
    // wave defence: o = { lineup, stage, wave, baseHp, upgrades, seed }
    showWave(o, names) {
      waveOpts = o;
      if (names) teamNames = names;
      return setup();
    },
    show(left, right, names, battleSeed) {
      waveOpts = null;
      lineup = { left: left.map((x) => x.slice()), right: right.map((x) => x.slice()) };
      if (names) teamNames = names;
      if (battleSeed != null) seed = battleSeed;
      return setup();
    },
  });
  // live getters (Object.assign would copy their current values instead)
  Object.defineProperty(api, 'sim', { get: () => sim });
  Object.defineProperty(api, 'running', { get: () => running });
  window.BATTLE = api;
})();
