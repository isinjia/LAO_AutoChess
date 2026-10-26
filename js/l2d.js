// Lobby secretary: the original Spine 4.2 lobby models (tools/build_l2d.py -> assets/l2d/<id>/), drawn with spine-player.
//   L2D.show(id)   load / switch the model in #l2d      L2D.touch()  play a touch motion, then back to idle
// The lobby skin = base body + the censored body variant + decorations + the idle face (the originals split them).
(function () {
  'use strict';
  // view: the part of the skeleton (setup-pose bounds, tools/l2d_test.html) shown in the #l2d box
  const MODELS = {
    harpy: { name: '하르페이아', view: [-1000, -650, 1800, 2500] },
    banshee: { name: '밴시', view: [-930, -700, 1800, 2500] },
    khan: { name: '칸', view: [-1400, -260, 4200, 2900] },
  };
  let player = null, cur = null, busy = false, idleName = 'idle', touchNames = [];

  function lobbySkin(data) {
    const sk = new spine.Skin('lobby');
    for (const s of data.skins) {
      const n = s.name;
      if (n === 'default' || n === 'skin_base' || n.startsWith('decorations/') || /censorship/i.test(n) || /^face\/.*_Idle$/i.test(n)) sk.addSkin(s);
    }
    return sk;
  }

  function show(id) {
    if (!window.spine || !MODELS[id]) return;
    if (cur === id && player) return;
    const box = document.getElementById('l2d');
    if (player) { try { player.dispose(); } catch (e) { /* already gone */ } player = null; }
    box.innerHTML = '';
    box.dataset.model = id;
    cur = id;
    const m = MODELS[id], [x, y, width, height] = m.view;
    const p = new spine.SpinePlayer(box, {
      skeleton: `assets/l2d/${id}/model.json`, atlas: `assets/l2d/${id}/model.atlas`,
      premultipliedAlpha: true, alpha: true, backgroundColor: '#00000000', showControls: false, showLoading: false,
      viewport: { x, y, width, height, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0, transitionTime: 0 },
      success: (pl) => {
        if (cur !== id) return;
        const data = pl.skeleton.data, names = data.animations.map((a) => a.name);
        idleName = names.find((n) => /^idle$/i.test(n)) || names[0];
        touchNames = names.filter((n) => /^touch/i.test(n));
        pl.skeleton.setSkin(lobbySkin(data));
        pl.skeleton.setSlotsToSetupPose();
        pl.animationState.setAnimation(0, idleName, true);
        box.classList.add('on');
      },
      error: () => { box.classList.remove('on'); },
    });
    player = p;
    box.classList.remove('on');
  }

  function touch() {
    if (!player || !player.animationState || busy || !touchNames.length) return false;
    busy = true;
    const n = touchNames[Math.floor(Math.random() * touchNames.length)];
    const st = player.animationState;
    st.setAnimation(0, n, false);
    st.addAnimation(0, idleName, true, 0);
    setTimeout(() => { busy = false; }, 1200);
    return true;
  }
  function pause(on) { if (player) { if (on) player.pause(); else player.play(); } }

  window.L2D = { MODELS, ids: Object.keys(MODELS), show, touch, pause, get current() { return cur; } };
})();
