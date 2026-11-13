/* ============================================================
   NEON BREACH — first-person weapon view model
   ============================================================ */
const VIEWMODEL = (() => {
  const parts = [];
  const group = M4.create();
  const model = M4.create();
  const local = M4.create();
  let initialized = false;
  let anim = { sprint: 0, reload: 0, throw: 0 };
  let mats = null;
  const sightGlow = [0, 0, 0];
  const muzzleGlow = [0, 0, 0];
  const laserGlow = [0, 0, 0];

  function add(mesh, pos, scale, material, rot) {
    M4.compose(local, pos, rot || [0,0,0], scale);
    parts.push({ mesh, material, matrix: new Float32Array(local), pos: pos.slice() });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    mats = {
      body:  { color:[.13,.155,.175], specular:1.35, rim:.2 },
      body2: { color:[.185,.215,.235], specular:1.15, rim:.16 },
      panel: { color:[.10,.12,.14], specular:.8, rim:.12 },
      edge:  { color:[.32,.39,.43], specular:1.35, rim:.1 },
      rubber:{ color:[.045,.05,.058], specular:.25, rim:.04 },
      glove: { color:[.105,.125,.14], specular:.6, rim:.12 },
      sleeve:{ color:[.10,.145,.16], specular:.38, rim:.09 },
      cyan:  { color:[.1,.9,1.0], emissive:[.22,1.4,1.65], emissiveStrength:1.35, unlit:true },
      orange:{ color:[1,.46,.10], emissive:[1.4,.55,.08], emissiveStrength:1.05, unlit:true },
      glass: { color:[.02,.08,.10], specular:1.8, rim:.3 }
    };
    // receiver + stock
    add('box', [0, 0, -.06], [.115, .13, .34], mats.body);
    add('box', [0, .072, -.08], [.10, .062, .4], mats.body2);
    add('box', [0, -.055, .04], [.09, .05, .22], mats.panel);
    add('box', [0, .015, .25], [.09, .105, .2], mats.body2, [.04,0,0]);
    add('box', [0, -.012, .36], [.075, .15, .07], mats.panel, [.05,0,0]);
    add('box', [0, .08, .18], [.045, .035, .16], mats.edge);
    // barrel assembly
    add('box', [0, .022, -.39], [.085, .078, .3], mats.panel);
    add('box', [0, .074, -.39], [.055, .028, .24], mats.edge);
    add('cylinder', [0, .028, -.6], [.03, .24, .03], mats.edge, [Math.PI/2, 0, 0]);
    add('cylinder', [0, .028, -.68], [.055, .065, .055], mats.body2, [Math.PI/2, 0, 0]);
    add('torus', [0, .028, -.715], [.072, .072, .072], mats.edge, [Math.PI/2, 0, 0]);
    add('box', [0, .028, -.71], [.022,.018,.02], mats.cyan);
    for (let i = 0; i < 3; i++) {
      add('box', [0, .045, -.43 - i * .047], [.1, .02, .018], mats.panel);
    }
    // top rail and optic
    add('box', [0, .122, -.05], [.06, .027, .28], mats.edge);
    for (let i = 0; i < 7; i++) add('box', [0, .138, .07 - i*.038], [.072, .012, .014], mats.panel);
    add('box', [0, .168, -.055], [.08, .045, .14], mats.body);
    add('torus', [0, .207, -.14], [.092, .092, .092], mats.edge, [Math.PI/2, 0, 0]);
    add('torus', [0, .207, -.143], [.071, .071, .071], mats.glass, [Math.PI/2, 0, 0]);
    add('box', [0, .207, -.139], [.026, .026, .012], mats.cyan);
    add('box', [0, .16, -.13], [.055, .03, .08], mats.edge);
    add('box', [0, .185, -.2], [.028, .035, .03], mats.edge);
    // grip and trigger guard
    add('box', [0, -.14, .06], [.074, .19, .09], mats.rubber, [.34, 0, .02]);
    add('box', [0, -.105, -.02], [.03, .06, .06], mats.edge, [.2,0,0]);
    add('torus', [0, -.10, -.03], [.10,.09,.10], mats.edge, [0,0,Math.PI/2]);
    // magazine
    add('box', [0, -.17, -.115], [.072, .22, .1], mats.body2, [-.08, 0, .01]);
    add('box', [0, -.20, -.062], [.076, .045, .085], mats.panel, [-.08, 0, .01]);
    add('box', [0, -.14, -.165], [.078, .018, .075], mats.orange, [-.08, 0, .01]);
    // side panels and energy strips
    for (const side of [-1, 1]) {
      add('box', [side*.06, .0, -.18], [.012, .065, .23], mats.panel);
      add('box', [side*.067, -.045, -.11], [.006, .014, .19], mats.cyan);
      add('box', [side*.066, .03, .01], [.006, .012, .09], mats.orange);
    }
    // rear accent
    add('box', [0, -.04, .205], [.095, .018, .018], mats.orange);
    add('box', [0, .07, .31], [.06, .012, .028], mats.cyan);
    // hands: visible gloves and sleeves framing the receiver
    add('box', [.01, -.10, .075], [.145, .13, .17], mats.glove, [.22, 0, -.11]);
    add('box', [-.05, -.115, -.295], [.15, .13, .18], mats.glove, [.14, .18, .12]);
    add('box', [-.055, -.145, -.35], [.14, .055, .11], mats.glove, [.18, .15, .1]);
    add('box', [.075, -.255, .23], [.15, .37, .17], mats.sleeve, [.42, -.15, -.32]);
    add('box', [-.125, -.29, -.25], [.15, .34, .16], mats.sleeve, [.48, .1, .52]);
    add('box', [.048, -.095, .055], [.06, .022, .12], mats.cyan, [.1,0,0]);
    add('box', [-.055, -.08, -.285], [.075, .018, .1], mats.orange, [.2,0,0]);
    // a tiny floating holo readout above the receiver
    add('box', [.0, .265, -.04], [.032, .002, .028], mats.cyan, [0,0,0]);
  }

  function draw(player, dt) {
    if (!initialized) init();
    const aim = player.adsT;
    // smoothed secondary anim states
    anim.sprint = damp(anim.sprint, player.sprinting && aim < .2 ? 1 : 0, 9, dt);
    anim.reload = damp(anim.reload, player.reloading ? 1 : 0, 14, dt);
    anim.throw = damp(anim.throw, player.throwAnim > 0 ? 1 : 0, 16, dt);

    const speed = Math.hypot(player.vel[0], player.vel[2]);
    const speedT = clamp(speed / PLAYER_SPEED, 0, 1.45);
    const bobAmt = (player.onGround ? Math.min(speedT, 1.2) : .12) * (1 - aim * .72);
    const bobX = Math.sin(player.walkPhase) * .011 * bobAmt;
    const bobY = Math.abs(Math.cos(player.walkPhase)) * .012 * bobAmt;

    const hip = [0.235, -0.177, -0.475];
    const adsPos = [0.0, -0.104, -0.455];
    const px = lerp(hip[0], adsPos[0], aim) + bobX;
    const py = lerp(hip[1], adsPos[1], aim) + bobY - anim.sprint * .055 - anim.reload * .095;
    const pz = lerp(hip[2], adsPos[2], aim) + player.muzzleFlash * .014;
    const kick = player.weaponKick;
    const swayX = G.lookSwayX * (1 - aim * .65);
    const swayY = G.lookSwayY * (1 - aim * .65);
    const reloadCurve = Math.sin(clamp(1 - player.reloadTimer / RELOAD_TIME, 0, 1) * Math.PI);
    const rz = anim.sprint * -.14 + reloadCurve * .28 + swayX * .48 - aim * .008;
    const rx = .006 + anim.sprint * .12 + reloadCurve * -.15 + kick * .046 + swayY * .4;
    const ry = swayX * .38 + anim.sprint * .13 + (1 - aim) * .037 + kick * (player.weaponKickY || 0) * .6;
    const ws = .5;
    M4.compose(group, [px, py, pz], [rx, ry, rz], [ws, ws, ws]);

    for (const p of parts) {
      M4.multiply(model, group, p.matrix);
      R.drawMesh(p.mesh, model, p.material);
    }

    // compute glow anchor points in eye space
    const toEye = (pos) => M4.transformPoint(group, pos);
    const s = toEye([0, .207, -.145]);
    sightGlow[0] = s[0]; sightGlow[1] = s[1]; sightGlow[2] = s[2];
    const mu = toEye([0, .028, -.746]);
    muzzleGlow[0] = mu[0]; muzzleGlow[1] = mu[1]; muzzleGlow[2] = mu[2];
    const la = toEye([0, -.02, -.02]);
    laserGlow[0] = la[0]; laserGlow[1] = la[1]; laserGlow[2] = la[2];

    if (R.currentPass === 'viewmodel') {
      // glows are drawn by drawGlows() after the opaque weapon
    }
  }

  function drawGlows(player) {
    if (R.currentPass !== 'glowvm') return;
    R.drawViewGlow(sightGlow, .024, [.2, 1.2, 1.4], .75, R.textures.glow);
    R.drawViewGlow(sightGlow, .009, [.8, 1.7, 1.8], 1.0, R.textures.star);
    if (player.muzzleFlash > 0) {
      const f = clamp(player.muzzleFlash / .06, 0, 1);
      R.drawViewGlow(muzzleGlow, .2 * f + .055, [.45, 1.25, 1.55], 1.3, R.textures.glow, player.muzzleAngle);
      R.drawViewGlow(muzzleGlow, .145 * f + .045, [1.6, 1.25, .48], 1.5, R.textures.star, player.muzzleAngle + .4);
      R.drawViewGlow(muzzleGlow, .09, [1.8, .7, .2], 1.0, R.textures.glow);
    }
    // emitter glints when the mag is nearly empty
    if (player.mag <= 5 && !player.reloading) {
      R.drawViewGlow(laserGlow, .065, [1.7,.28,.08], .22 + .12*Math.sin(G.time*16), R.textures.glow);
    }
  }

  function getMuzzleWorld(camera) {
    // eye-space -> world, for muzzle light placement
    const c = camera;
    const b = cameraBasis(c.yaw, c.pitch);
    const m = muzzleGlow;
    return [
      c.eye[0] + b.right[0]*m[0] + b.up[0]*m[1] + b.forward[0]*(-m[2]),
      c.eye[1] + b.right[1]*m[0] + b.up[1]*m[1] + b.forward[1]*(-m[2]),
      c.eye[2] + b.right[2]*m[0] + b.up[2]*m[1] + b.forward[2]*(-m[2])
    ];
  }

  return { init, draw, drawGlows, getMuzzleWorld, get muzzle() { return muzzleGlow; } };
})();
