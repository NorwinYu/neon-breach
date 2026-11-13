/* ============================================================
   NEON BREACH — scene composition, 2D tactical overlay, loop
   ============================================================ */
'use strict';

const FOG_COLOR = [.048, .040, .068];
let fx2d = null;
let fxDpr = 1;
let lastFrameTime = performance.now();
let smoothedFps = 60;
let readyFrames = 0;
let radarTimer = 0;
let scratchMatrix = M4.create();
const aimEyeTmp = [0,0,0];

/* ---------------- cameras ---------------- */
function getMenuCamera() {
  const a = G.menuCamAngle;
  const eye = [Math.sin(a) * 22.5, 5.8 + Math.sin(G.menuTime * .17) * .7, Math.cos(a) * 22.5];
  const target = [0, 2.9, 0];
  const dx = target[0]-eye[0], dy = target[1]-eye[1], dz = target[2]-eye[2];
  const len = Math.hypot(dx,dy,dz);
  const yaw = Math.atan2(dx, -dz);
  const pitch = Math.asin(dy / len);
  return { eye, yaw, pitch, fov: 68 };
}
function getGameCamera() {
  const p = G.player;
  const speed = Math.hypot(p.vel[0], p.vel[2]);
  const speedT = clamp(speed / PLAYER_SPEED, 0, 1.3);
  const bobWeight = p.onGround && !p.dead ? speedT : 0;
  const bobY = Math.sin(p.walkPhase) * .026 * bobWeight * (1 - p.adsT * .65);
  const bobX = Math.cos(p.walkPhase * .5) * .016 * bobWeight * (1 - p.adsT * .65);
  let eyeY = p.pos[1] + EYE + bobY - p.landDip;
  let yaw = p.yaw + p.recoilYaw;
  let pitch = clamp(p.pitch + p.recoilPitch, -1.48, 1.48);
  if (G.state === 'dying') {
    const t = clamp(1 - G.deathTimer / 1.7, 0, 1);
    const e = smoothstep(0, 1, t);
    eyeY = lerp(p.pos[1] + EYE, p.pos[1] + .32, e);
    pitch = lerp(pitch, -.28, e * .82);
    yaw += e * .12;
  }
  if (G.state === 'victory') {
    pitch = lerp(pitch, clamp(pitch - .06, -1.4, 1.4), .4);
  }
  const basis = cameraBasis(yaw, pitch);
  const shake = G.shake;
  const t = G.time + G.visualTime * .37;
  const shX = Math.sin(t * 77.1) * shake * .025 + Math.sin(t * 23.7) * shake * .01;
  const shY = Math.cos(t * 61.3) * shake * .022 + Math.cos(t * 19.1) * shake * .008;
  const eye = [
    p.pos[0] + basis.right[0] * (shX + bobX) + basis.up[0] * shY,
    eyeY + basis.up[1] * shY,
    p.pos[2] + basis.right[2] * (shX + bobX) + basis.up[2] * shY
  ];
  yaw += Math.sin(t * 51.7) * shake * .0045;
  pitch = clamp(pitch + Math.cos(t * 46.3) * shake * .004, -1.48, 1.48);
  return { eye, yaw, pitch, fov: p.fov };
}
function activeCamera() {
  if (G.state === 'menu' || G.state === 'boot') return getMenuCamera();
  return getGameCamera();
}

/* ---------------- lights ---------------- */
function gatherLights(cam) {
  const lights = WORLD.lights.slice(0, 4);
  const p = G.player;
  if (G.boss && !G.boss.dead) {
    lights.push({ pos: [G.boss.pos[0], G.boss.pos[1] + .3, G.boss.pos[2]], color: [1.4, .18, .7], range: 23, intensity: 1.35 });
  } else {
    lights.push(WORLD.lights[4]);
  }
  if (p.muzzleFlash > 0 && G.state !== 'menu') {
    const b = aimBasis();
    const intensity = (p.muzzleFlash / .06) * 2.1;
    lights.push({
      pos: [p.pos[0] + b.right[0]*.16 + b.forward[0]*.95,
            p.pos[1] + EYE - .18 + b.forward[1]*.95,
            p.pos[2] + b.right[2]*.16 + b.forward[2]*.95],
      color: [.8, 1.25, 1.4], range: 8.5, intensity
    });
  }
  return lights.slice(0, 6);
}

/* ---------------- enemy / pickup rendering ---------------- */
function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;
    MODELS.draw(e, G.visualTime);
  }
}
function drawPickupsOpaque() {
  for (const pk of G.pickups) {
    const y = pk.baseY + Math.sin(pk.age * 2.4 + pk.seed) * .06;
    const spin = pk.age * (pk.type === 'health' ? 1.1 : 1.7);
    const m = (mesh, pos, scale, mat, rot) => {
      M4.compose(scratchMatrix, [pk.pos[0]+pos[0], y+pos[1], pk.pos[2]+pos[2]], rot || [0,spin,0], scale);
      R.drawMesh(mesh, scratchMatrix, mat);
    };
    if (pk.type === 'health') {
      const healthMat = DYN_MATS.health;
      m('torus', [0, 0, 0], [.58,.58,.58], healthMat, [Math.PI/2, spin, 0]);
      m('box', [0, .02, 0], [.11, .38, .11], healthMat);
      m('box', [0, .02, 0], [.38, .11, .11], healthMat);
      m('sphere', [0, 0, 0], [.26,.26,.26], DYN_MATS.healthDark);
      m('box', [0, .02, -.12], [.08,.24,.02], healthMat);
    } else {
      m('sphere', [0, 0, 0], [.34,.4,.34], DYN_MATS.grenade);
      m('torus', [0, 0, 0], [.42,.42,.42], DYN_MATS.grenadePack, [Math.PI/2, spin, 0]);
      m('box', [0, .25, 0], [.08,.12,.08], DYN_MATS.grenadeBand);
      m('box', [0, .31, 0], [.16,.025,.08], DYN_MATS.grenadeBand);
    }
  }
}
function drawGrenadesOpaque() {
  for (const g of G.grenades) {
    M4.compose(scratchMatrix, g.pos, [g.spin, g.spin * 1.2, 0], [.18,.22,.18]);
    R.drawMesh('sphere', scratchMatrix, DYN_MATS.grenade);
    M4.compose(scratchMatrix, g.pos, [Math.PI/2, g.spin, 0], [.42,.42,.42]);
    R.drawMesh('torus', scratchMatrix, DYN_MATS.grenadeBand);
  }
}

/* ---------------- glow pass ---------------- */
function drawWorldEntitiesGlow() {
  const time = G.visualTime;
  // ambient motes
  for (const d of G.dust) {
    const col = d.size > .05 ? [.3,.65,.7] : [.5,.6,.68];
    R.drawGlowWorld(d.pos, d.size * 5.2, col, .22, { tex: R.textures.glow });
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    const spawnPulse = clamp(1 - e.spawnScale, 0, 1);
    const hover = ENEMY_BODY[e.type].yBob || 0;
    R.drawShadow(e.pos[0], e.pos[2], e.def.shadow * (e.modelScale || 1) * (e.type==='boss'?1.2:1), e.type === 'boss' ? .5 : .36);
    if (spawnPulse > 0) {
      R.drawGroundRing(e.pos[0], e.pos[2], 2.5 + spawnPulse * 2, [1.3,.15,.6], spawnPulse * .85, time * .4);
    }
    if (e.invuln > 0) {
      R.drawGlowWorld([e.pos[0], e.pos[1], e.pos[2]], 2.6, [.4,.9,1.2], .25, { tex: R.textures.ring });
    }
    let corePos, coreCol, coreSize, coreIntensity;
    if (e.type === 'sentinel') {
      corePos = localToWorld(e, [0, .05, -.34]);
      coreCol = [2, .52, .1];
      coreSize = .85; coreIntensity = .8 + (e.windup > 0 ? .8 : 0) + Math.sin(e.animTime*4)*.12;
      R.drawGlowWorld(localToWorld(e, [0, -.17, -.02]), 1.4, [1.5,.36,.06], .18);
    } else if (e.type === 'weaver') {
      corePos = localToWorld(e, [0, .03, -.2]);
      coreCol = [2,.16,.62]; coreSize = .7; coreIntensity = .8 + (e.windup > 0 ? .8 : 0);
    } else if (e.type === 'brute') {
      corePos = localToWorld(e, [0, .3, -.48]);
      coreCol = [2,.42,.08]; coreSize = 1.5; coreIntensity = .5 + (e.windup > 0 ? .75 : 0) + Math.sin(e.animTime*2.3)*.08;
      R.drawGlowWorld(localToWorld(e, [.95, .68, -.62]), .6, [1.8,.35,.06], .35);
      R.drawGlowWorld(localToWorld(e, [-.95, .68, -.62]), .6, [1.8,.35,.06], .35);
    } else if (e.type === 'turret') {
      corePos = localToWorld(e, [0, .62, -.35]);
      coreCol = [2,.1,.2]; coreSize = .7; coreIntensity = .8 + (e.windup>0 ? .9 : 0);
    } else {
      corePos = localToWorld(e, [0, .7, -1.08]);
      coreCol = [2,.3,.8]; coreSize = 5.2; coreIntensity = 1.2 + Math.sin(time*3.4)*.12;
      R.drawGlowWorld([e.pos[0], e.pos[1], e.pos[2]], 9, [1.3,.1,.6], .26 + (e.bossWindup>0 ? .28 : 0), { tex: R.textures.ring, roll: time * .1 });
      R.drawGlowWorld(corePos, 2.6, [1.8,.9,1.3], 1.1);
      R.drawGlowWorld(localToWorld(e, [2.25,.45,0]), 1.4, [1.8,.2,.7], .5);
      R.drawGlowWorld(localToWorld(e, [-2.25,.45,0]), 1.4, [1.8,.2,.7], .5);
    }
    R.drawGlowWorld(corePos, coreSize, coreCol, Math.max(.15, coreIntensity), { tex: R.textures.star });
    if (e.windup > 0) {
      R.drawGlowWorld(corePos, coreSize * (2.1 + Math.sin(time * 30) * .18), coreCol, .35, { tex: R.textures.ring, roll: time * .7 });
    }
    if (e.type !== 'boss') {
      R.drawGroundRing(e.pos[0], e.pos[2], e.radius * 1.5, coreCol, .12, time * .15);
    }
    if (e.type === 'boss') {
      const q = G.bossPhase;
      if (q >= 2) {
        R.drawGroundRing(e.pos[0], e.pos[2], 4.5 + Math.sin(time*1.7)*.25, [1.8,.12,.62], .18, time*.12);
      }
    }
  }
  // pickups
  for (const pk of G.pickups) {
    const col = pk.type === 'health' ? [.3,1.5,.75] : [1.7,.8,.15];
    const y = .12;
    R.drawGroundRing(pk.pos[0], pk.pos[2], .85, col, .28, time * .5);
    R.drawGlowWorld([pk.pos[0], pk.baseY, pk.pos[2]], 1.2, col, .32 + Math.sin(pk.age*3)*.05);
    R.drawShadow(pk.pos[0], pk.pos[2], .6, .25);
  }
  // live grenades
  for (const g of G.grenades) {
    R.drawGlowWorld([g.pos[0],g.pos[1],g.pos[2]], .7, [1.7,.65,.15], .6 + Math.sin(g.fuse*25)*.2);
    R.drawShadow(g.pos[0], g.pos[2], .55, .2);
  }
  // projectiles
  for (const pr of G.projectiles) {
    const speed = V3.len(pr.vel) || 1;
    const back = [pr.pos[0]-pr.vel[0]/speed*.55, pr.pos[1]-pr.vel[1]/speed*.55, pr.pos[2]-pr.vel[2]/speed*.55];
    R.drawGlowWorld(back, pr.size * .5, pr.color, .32, { tex: R.textures.glow });
    R.drawGlowWorld(pr.pos, pr.size, pr.color, .9);
    R.drawGlowWorld(pr.pos, pr.size * .38, [1.8,.95,.75], .9, { tex: R.textures.star, roll: G.visualTime * 3 });
  }
  // danger telegraphs
  for (const z of G.dangerZones) {
    if (z.exploded) continue;
    const pulse = .6 + .4 * Math.sin((1 - z.timer / Math.max(.01, z.delay)) * Math.PI * 5);
    const urgency = 1 - clamp(z.timer / Math.max(.01, z.delay), 0, 1);
    R.drawGroundRing(z.pos[0], z.pos[2], z.radius, [1.9,.18,.15], .45 + urgency * .65, G.visualTime * .2);
    R.drawGroundRing(z.pos[0], z.pos[2], z.radius * .62, [2,.4,.1], .18 + urgency * .4, -G.visualTime * .15);
    R.drawGroundRing(z.pos[0], z.pos[2], z.radius * .95, [2,.55,.1], .2 * pulse, 0, R.textures.glow);
  }
  // particles and transient rings
  for (const p of G.particles) {
    const fade = clamp(p.life / p.maxLife, 0, 1);
    const s = Math.max(.025, p.size * (p.star ? 3.4 : 2.2));
    R.drawGlowWorld(p.pos, s, p.color, .5 + fade * .8, { tex: p.star ? R.textures.star : R.textures.glow, roll: (p.pos[0]+p.pos[2]) * 1.3 });
  }
  for (const rg of G.rings) {
    const t = 1 - clamp(rg.life / rg.maxLife, 0, 1);
    const radius = lerp(rg.startR, rg.endR, smoothstep(0, 1, t));
    const alpha = (1 - t) * .75;
    const y = rg.pos[1] || .045;
    R.drawGroundRing(rg.pos[0], rg.pos[2], radius, rg.color, alpha, t * 2.4, R.textures.ring, y);
  }
  // boss area light flares when charging
  if (G.boss && !G.boss.dead && G.boss.bossWindup > 0) {
    const b = G.boss;
    const charge = 1 - clamp(b.bossWindup / .85, 0, 1);
    R.drawGlowWorld(bossMuzzle(b), 1.2 + charge * 3.0, [2,.2,.7], .4 + charge * 1.2, { tex: R.textures.star, roll: G.visualTime * 2 });
  }
}

/* ---------------- 2D overlay ---------------- */
function setupFxCanvas() {
  if (!dom.fx) return;
  fxDpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(window.innerWidth * fxDpr));
  const h = Math.max(1, Math.floor(window.innerHeight * fxDpr));
  if (dom.fx.width !== w || dom.fx.height !== h) {
    dom.fx.width = w; dom.fx.height = h;
  }
  fx2d = dom.fx.getContext('2d');
}
function projectToScreen(pos) {
  const v = M4.transformPoint4(R.viewProj, [pos[0], pos[1], pos[2]]);
  if (v[3] <= .08) return null;
  const x = (v[0] / v[3] * .5 + .5) * window.innerWidth;
  const y = (-v[1] / v[3] * .5 + .5) * window.innerHeight;
  if (x < -160 || x > window.innerWidth + 160 || y < -120 || y > window.innerHeight + 120) return [x, y, v[3], false];
  return [x, y, v[3], true];
}
function playerHasLineOfSightTo(point) {
  const p = G.player;
  const eye = [p.pos[0], p.pos[1] + EYE, p.pos[2]];
  const dx = point[0]-eye[0], dy = point[1]-eye[1], dz = point[2]-eye[2];
  const dist = Math.hypot(dx,dy,dz);
  if (dist < .1) return true;
  const hit = WORLD.raycast(eye[0],eye[1],eye[2],dx/dist,dy/dist,dz/dist);
  return !hit || hit.t > dist - .35;
}
function drawTracers(ctx) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const tr of G.tracers) {
    const fade = tr.life / tr.maxLife;
    const end = projectToScreen(tr.to);
    if (!end || !end[3]) continue;
    const start = projectToScreen(tr.from);
    let sx, sy;
    if (start && start[3] && Math.abs(start[0]-w/2) < w*.5) { sx = start[0]; sy = start[1]; }
    else { sx = w * .68; sy = h * .78; }
    if (Math.hypot(end[0]-sx, end[1]-sy) < 6) continue;
    const grad = ctx.createLinearGradient(sx, sy, end[0], end[1]);
    if (tr.hit) {
      grad.addColorStop(0, `rgba(160,255,255,${fade*.22})`);
      grad.addColorStop(.8, `rgba(200,255,255,${fade*.8})`);
      grad.addColorStop(1, tr.head ? `rgba(255,70,150,${fade})` : `rgba(255,217,160,${fade})`);
    } else {
      grad.addColorStop(0, `rgba(140,235,255,${fade*.16})`);
      grad.addColorStop(1, `rgba(165,245,255,${fade*.45})`);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.1;
    ctx.shadowColor = tr.hit ? 'rgba(140,250,255,.8)' : 'rgba(120,240,255,.5)';
    ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(end[0], end[1]); ctx.stroke();
    ctx.restore();
  }
}
function drawDamageNumbers(ctx) {
  ctx.save();
  for (const d of G.damageNumbers) {
    const sc = projectToScreen(d.pos);
    if (!sc || !sc[3]) continue;
    const t = 1 - d.life / d.maxLife;
    const x = sc[0] + Math.sin(t * 4 + d.pos[0]) * 4;
    const y = sc[1] - t * 36;
    const alpha = clamp(d.life / (.45 * d.maxLife), 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = d.amount.startsWith('+') ? '600 16px "SFMono-Regular",monospace' : (d.crit ? '700 19px "SFMono-Regular",monospace' : '600 14px "SFMono-Regular",monospace');
    ctx.fillStyle = d.amount.startsWith('+') ? 'rgba(255,205,120,1)' : d.crit ? 'rgba(255,90,160,1)' : 'rgba(235,252,255,.95)';
    ctx.shadowColor = d.amount.startsWith('+') ? 'rgba(255,180,80,.8)' : d.crit ? 'rgba(255,40,110,.8)' : 'rgba(120,240,255,.6)';
    ctx.shadowBlur = d.crit ? 8 : 4;
    ctx.textAlign = 'center';
    ctx.fillText(d.amount, x, y);
    if (d.crit) {
      ctx.font = '7px "SFMono-Regular",monospace';
      ctx.fillStyle = 'rgba(255,130,180,.75)';
      ctx.fillText('CRITICAL', x, y - 14);
    }
  }
  ctx.restore();
}
function drawTargetBrackets(ctx) {
  const e = G.aimTarget;
  if (!e || e.dead) return;
  const center = localToWorld(e, [0, e.type === 'boss' ? .6 : .15, 0]);
  if (!playerHasLineOfSightTo(center)) return;
  const sc = projectToScreen(center);
  if (!sc || !sc[3]) return;
  const distance = V3.dist(G.player.pos, e.pos);
  const size = clamp(340 / Math.max(2, distance) * (e.type === 'boss' ? 2 : 1), 16, 150);
  const color = e.type === 'boss' ? 'rgba(255,70,150,.9)' : 'rgba(120,245,255,.8)';
  const x = sc[0], y = sc[1];
  const half = size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  const arm = Math.min(8, size * .3);
  for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    ctx.beginPath();
    ctx.moveTo(x + half*sx, y + half*sy - arm*sy);
    ctx.lineTo(x + half*sx, y + half*sy);
    ctx.lineTo(x + half*sx - arm*sx, y + half*sy);
    ctx.stroke();
  }
  ctx.restore();
}
function drawEnemyHealthBars(ctx) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.hp >= e.maxHp - .5) continue;
    if (e.type === 'boss') continue;
    const center = localToWorld(e, [0, e.type === 'brute' ? 1.45 : e.type === 'sentinel' ? .8 : .55, 0]);
    if (!playerHasLineOfSightTo(center)) continue;
    const sc = projectToScreen(center);
    if (!sc || !sc[3]) continue;
    const dist = V3.dist(G.player.pos, e.pos);
    const width = clamp(110 / Math.max(1, dist * .25), 28, 54);
    const alpha = clamp(1.4 - dist / 55, .25, 1);
    const x = sc[0] - width/2, y = sc[1] - 20;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(3,9,14,.72)';
    ctx.fillRect(x, y, width, 4);
    ctx.fillStyle = e.type === 'brute' ? 'rgba(255,120,50,.95)' : e.type === 'weaver' ? 'rgba(255,60,145,.95)' : 'rgba(255,160,60,.95)';
    ctx.fillRect(x, y, width * clamp(e.hp / e.maxHp, 0, 1), 4);
    ctx.strokeStyle = 'rgba(160,230,245,.22)';
    ctx.lineWidth = .5;
    ctx.strokeRect(x-.5, y-.5, width+1, 5);
    ctx.restore();
  }
}
function damageArc(ctx) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const a of G.hurtArcs) {
    const fade = a.life / a.maxLife;
    const r = Math.min(w, h) * (.18 + (1 - fade) * .025);
    const start = a.angle - Math.PI/2 - .2;
    const end = a.angle - Math.PI/2 + .2;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(255,52,80,.9)';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(255,30,60,.9)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(w/2, h/2, r, start, end);
    ctx.stroke();
    ctx.restore();
  }
}
function drawOverlay() {
  if (!fx2d) return;
  const w = window.innerWidth, h = window.innerHeight;
  fx2d.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
  fx2d.clearRect(0, 0, w, h);
  if (!['playing', 'paused', 'dying', 'victory'].includes(G.state)) return;
  drawTracers(fx2d);
  drawEnemyHealthBars(fx2d);
  drawTargetBrackets(fx2d);
  drawDamageNumbers(fx2d);
  damageArc(fx2d);
}

/* ---------------- radar ---------------- */
function drawRadar() {
  const canvas = dom.radar;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S = 158;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(3,10,15,.66)';
  ctx.fillRect(0, 0, S, S);
  const cx = S/2, cy = S/2, R = 74;
  const p = G.player;
  const yaw = p.yaw;
  const range = 31;
  const scale = R / range;
  const toRadar = (x, z) => {
    const dx = x - p.pos[0], dz = z - p.pos[2];
    const rx = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
    const fw = Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    return [cx + rx * scale, cy - fw * scale, rx, fw];
  };
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  // grid
  ctx.strokeStyle = 'rgba(105,230,255,.12)';
  ctx.lineWidth = .5;
  for (let r = 22; r <= R; r += 26) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, cy-R); ctx.lineTo(cx, cy+R); ctx.moveTo(cx-R, cy); ctx.lineTo(cx+R, cy); ctx.stroke();
  // sweep
  const sweep = (G.visualTime * .55) % TAU;
  if (ctx.createConicGradient) {
    const grad = ctx.createConicGradient(sweep, cx, cy);
    grad.addColorStop(0, 'rgba(90,240,255,.16)');
    grad.addColorStop(.08, 'rgba(90,240,255,.02)');
    grad.addColorStop(1, 'rgba(90,240,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, TAU); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(90,240,255,.2)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep)*R, cy + Math.sin(sweep)*R); ctx.stroke();
  }
  // obstacles
  const boxes = [];
  for (const o of WORLD.obstacles) boxes.push({x:o.x,z:o.z,w:o.w,d:o.d});
  boxes.push({x:0,z:0,w:3.3,d:3.3});
  for (const b of boxes) {
    const corners = [
      [b.x-b.w/2,b.z-b.d/2],[b.x+b.w/2,b.z-b.d/2],
      [b.x+b.w/2,b.z+b.d/2],[b.x-b.w/2,b.z+b.d/2]
    ].map(c => toRadar(c[0], c[1]));
    if (corners.every(c => c[3] < -range - 3)) continue;
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i=1;i<4;i++) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,108,124,.24)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,195,210,.24)';
    ctx.lineWidth = .6;
    ctx.stroke();
  }
  // danger zones
  for (const z of G.dangerZones) {
    const c = toRadar(z.pos[0], z.pos[2]);
    ctx.strokeStyle = 'rgba(255,60,80,.65)';
    ctx.lineWidth = .8;
    ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(2, z.radius * scale), 0, TAU); ctx.stroke();
  }
  // pickups
  for (const pk of G.pickups) {
    const c = toRadar(pk.pos[0], pk.pos[2]);
    if (c[3] < -range) continue;
    ctx.fillStyle = pk.type === 'health' ? 'rgba(100,255,175,.9)' : 'rgba(255,200,80,.9)';
    ctx.fillRect(c[0]-1.5, c[1]-1.5, 3, 3);
  }
  // enemies
  for (const e of G.enemies) {
    if (e.dead) continue;
    const c = toRadar(e.pos[0], e.pos[2]);
    if (c[3] < -range - 1 || Math.hypot(c[2], c[3]) > range + 1) continue;
    const isBoss = e.type === 'boss';
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.fillStyle = isBoss ? 'rgba(255,45,125,.95)' : (e.type === 'weaver' ? 'rgba(255,80,170,.92)' : 'rgba(255,155,62,.92)');
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = isBoss ? 9 : 4;
    if (isBoss) {
      ctx.rotate(Math.PI/4);
      ctx.fillRect(-4,-4,8,8);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, e.type === 'brute' ? 3.2 : 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // player arrow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(110,250,255,.95)';
  ctx.shadowColor = 'rgba(110,250,255,.9)';
  ctx.shadowBlur = 7;
  ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(4.5,5); ctx.lineTo(0,2); ctx.lineTo(-4.5,5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  // border ticks
  ctx.save();
  ctx.strokeStyle = 'rgba(120,225,245,.38)';
  ctx.lineWidth = .7;
  for (let i=0;i<24;i++) {
    const a = i/24*TAU;
    const r1 = R + 1, r2 = R + (i%6===0 ? 5 : 3);
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
    ctx.lineTo(cx+Math.cos(a)*r2, cy+Math.sin(a)*r2);
    ctx.stroke();
  }
  ctx.font = '5px "SFMono-Regular",monospace';
  ctx.fillStyle = 'rgba(126,220,238,.55)';
  ctx.textAlign = 'center';
  ctx.fillText('FWD', cx, 8);
  ctx.restore();
}

/* ---------------- frame ---------------- */
function drawScene(dt) {
  if (!R.isReady) return;
  const cam = activeCamera();
  R.setFrameTime(G.visualTime);
  R.cameraMatrices(cam, cam.fov);
  R.beginFrame();
  R.drawSky(cam, G.visualTime, FOG_COLOR);
  const lights = gatherLights(cam);
  R.beginWorld(cam, lights, G.visualTime, FOG_COLOR);
  WORLD.drawOpaque(G.visualTime);
  if (G.state !== 'menu' && G.state !== 'boot') {
    drawEnemies();
    drawPickupsOpaque();
    drawGrenadesOpaque();
  }
  R.beginGlows(cam);
  WORLD.drawGlow(G.visualTime);
  if (G.state !== 'menu' && G.state !== 'boot') drawWorldEntitiesGlow();
  R.endGlows();

  const showWeapon = (G.state === 'playing' || G.state === 'paused') && !G.player.dead;
  if (showWeapon) {
    R.clearDepth();
    R.beginViewmodel([], G.visualTime, FOG_COLOR);
    VIEWMODEL.draw(G.player, G.state === 'paused' ? 0 : dt);
    R.clearDepth();
    R.beginGlowViewmodel();
    VIEWMODEL.drawGlows(G.player);
    R.endGlows();
  }

  if (G.state !== 'menu' && G.started) syncHUD();
  drawOverlay();
  if (['playing', 'paused', 'dying', 'victory'].includes(G.state)) {
    radarTimer -= dt;
    if (radarTimer <= 0) {
      radarTimer = .05;
      drawRadar();
    }
  }
  window.__STATS.calls = R.stats.calls;
  window.__STATS.triangles = Math.round(R.stats.triangles);
  window.__STATS.fps = Math.round(smoothedFps);
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  const dt = Math.max(0.0001, Math.min(raw, .033));
  if (raw > 0) smoothedFps = lerp(smoothedFps, 1 / raw, .06);
  if (!G.freeze && G.state !== 'paused' && G.state !== 'ended') updateGame(dt, now);
  setupFxCanvas();
  drawScene(dt);
  readyFrames++;
  if (readyFrames === 3) window.__READY = true;
}

/* ---------------- debug hooks ---------------- */
function debugSnapshot() {
  return {
    state: G.state,
    wave: G.wave,
    phase: G.wavePhase,
    enemies: G.enemies.filter(e=>!e.dead).map(e => ({ id:e.id, type:e.type, hp:Math.round(e.hp), x:+e.pos[0].toFixed(1), y:+e.pos[1].toFixed(1), z:+e.pos[2].toFixed(1) })),
    boss: G.boss && !G.boss.dead ? { hp: Math.round(G.boss.hp), x:G.boss.pos[0], z:G.boss.pos[2] } : null,
    player: { hp:+G.player.health.toFixed(1), shield:+G.player.shield.toFixed(1), x:+G.player.pos[0].toFixed(1), y:+G.player.pos[1].toFixed(1), z:+G.player.pos[2].toFixed(1), mag:G.player.mag, kills:G.kills, score:G.score },
    ready: window.__READY
  };
}
function debugLookAt(x, y, z) {
  const p = G.player;
  const eye = [p.pos[0], p.pos[1] + EYE, p.pos[2]];
  const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(dx, -dz);
  p.pitch = Math.asin(clamp(dy/len, -1, 1));
  p.recoilPitch = 0; p.recoilYaw = 0;
}
function setupDebugHooks() {
  window.__GAME = G;
  window.__AUDIO = AUDIO;
  window.__COLLIDERS = WORLD.colliders;
  window.__BOUNDS = { minX: -31.2, maxX: 31.2, minZ: -31.2, maxZ: 31.2 };
  window.__STATS = { calls: 0, triangles: 0, fps: 60 };
  window.__READY = false;
  window.__AUDIT = [
    { name: 'VX-9 view model', kind: 'weapon', parts: 38, textures: 0, meshes: 'box/cylinder/torus' },
    { name: 'Sentinel drone', kind: 'enemy', parts: 20, identity: ['thruster arms', 'equator ring', 'orange optic'] },
    { name: 'Weaver drone', kind: 'enemy', parts: 17, identity: ['blade legs', 'pink core'] },
    { name: 'Brute walker', kind: 'enemy', parts: 25, identity: ['twin leg struts', 'shoulder cannons', 'belly reactor'] },
    { name: 'Warden boss', kind: 'enemy', parts: 31, identity: ['floating ring', 'twin pods', 'white core'] },
    { name: 'Arena kit', kind: 'environment', parts: 170, identity: ['reactor', 'cover', 'spawn gates', 'skyline'] }
  ];
  window.__TEST = (action, arg) => {
    try {
      switch (action) {
        case 'start': startGame(true); return debugSnapshot();
        case 'state': return debugSnapshot();
        case 'pause': pauseGame(); return debugSnapshot();
        case 'resume': resumeGame(); return debugSnapshot();
        case 'menu': goToMenu(); return debugSnapshot();
        case 'freeze': G.freeze = true; return true;
        case 'unfreeze': G.freeze = false; return true;
        case 'teleport': {
          if (Array.isArray(arg)) {
            G.player.pos[0] = arg[0]; G.player.pos[1] = arg[1] || 0; G.player.pos[2] = arg[2];
            G.player.vel[0] = G.player.vel[2] = 0; G.player.vel[1] = 0;
            if (arg.length > 3) G.player.yaw = arg[3];
            if (arg.length > 4) G.player.pitch = arg[4];
          }
          return debugSnapshot();
        }
        case 'lookAt': debugLookAt(arg[0], arg[1], arg[2]); return debugSnapshot();
        case 'spawn': {
          const type = typeof arg === 'string' ? arg : arg.type;
          const opts = typeof arg === 'object' ? arg : {};
          const e = spawnEnemy(type, opts);
          return e ? { id: e.id, type: e.type } : null;
        }
        case 'setupShowcase': {
          if (G.state !== 'playing') startGame(true);
          G.waveQueue = []; G.wavePhase = 'active'; G.wave = 1;
          setWaveHeader(1);
          G.enemies = [];
          G.player.pos = [0, 0, 16.5]; G.player.yaw = 0; G.player.pitch = .07;
          G.player.health = 88; G.player.shield = 34; G.player.mag = 21;
          const types = [['sentinel',-5,-2],['sentinel',4,-7],['weaver',-2,-9],['brute',-11,-3],['turret',8,0]];
          for (const [t,x,z] of types) {
            const e = spawnEnemy(t, { x, z });
            if (e) { e.pos[0] = x; e.pos[2] = z; e.spawnScale = 1; e.invuln = 0; }
          }
          return debugSnapshot();
        }
        case 'spawnAt': {
          const e = spawnEnemy(arg.type, { x: arg.x, z: arg.z });
          if (e) { e.pos[0] = arg.x; e.pos[2] = arg.z; e.spawnScale = 1; e.invuln = 0; }
          return e ? { id:e.id, type:e.type } : null;
        }
        case 'killAll': {
          for (const e of G.enemies.slice()) killEnemy(e, false);
          return debugSnapshot();
        }
        case 'damagePlayer': damagePlayer(arg.amount || arg || 20, null, '测试伤害'); return debugSnapshot();
        case 'win': finishRun(true); return debugSnapshot();
        case 'lose': finishRun(false, '被测试火力击毁'); return debugSnapshot();
        case 'wave': beginWave(arg); return debugSnapshot();
        case 'nextWave': beginWave(Math.min(5, G.wave + 1)); return debugSnapshot();
        case 'fire': performShot(); return debugSnapshot();
        case 'reload': startReload(); return debugSnapshot();
        case 'grenade': throwGrenade(); return debugSnapshot();
        case 'setHealth': G.player.health = arg; G.player.shield = 50; return debugSnapshot();
        case 'reset': startGame(true); return debugSnapshot();
        case 'hideUI': {
          document.body.classList.toggle('shot-debug', arg !== false);
          dom.hud.style.display = arg === false ? '' : 'none';
          dom.start.style.display = 'none';
          dom.end.style.display = 'none';
          dom.pause.style.display = 'none';
          return true;
        }
        case 'boss': {
          if (G.state !== 'playing') startGame(true);
          G.state = 'playing';
          G.wave = 5; G.wavePhase = 'boss'; G.waveQueue = [];
          setWaveHeader(5);
          const e = spawnEnemy('boss', {});
          if (e) { e.spawnScale = 1; e.invuln = 0; e.intro = 0; }
          return debugSnapshot();
        }
        case 'camera': {
          const c = arg || {};
          if (c.pos) { G.player.pos = [c.pos[0], c.pos[1] || 0, c.pos[2]]; }
          if (c.yaw != null) G.player.yaw = c.yaw;
          if (c.pitch != null) G.player.pitch = c.pitch;
          return debugSnapshot();
        }
        default: return { error: 'unknown action' };
      }
    } catch (err) {
      console.error(err);
      return { error: String(err && err.stack || err) };
    }
  };
}

/* ---------------- boot ---------------- */
function initGame() {
  setupDebugHooks();
  if (!R.init()) return;
  WORLD.init();
  NAV.init();
  VIEWMODEL.init();
  initDust();
  setupFxCanvas();
  bindUI();
  bindInput();
  syncSettingsUI();
  applyAudioSettings();
  prepareMenu();
  requestAnimationFrame((t) => {
    lastFrameTime = t;
    requestAnimationFrame(frame);
  });
  setTimeout(() => { dom.boot.classList.add('done'); }, 650);
  // deterministic demo hook for automated capture / visual QA
  const q = new URLSearchParams(location.search);
  if (q.has('autostart')) {
    setTimeout(() => {
      startGame(true);
      if (q.get('showcase') === '1') window.__TEST('setupShowcase');
    }, 720);
  }
  if (q.has('freeze')) setTimeout(() => { G.freeze = true; }, 900);
}
initGame();
