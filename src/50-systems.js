/* ============================================================
   NEON BREACH — gameplay systems
   Movement, shooting, enemies, waves, projectiles and feedback.
   ============================================================ */
'use strict';

/* ---------------- collision helpers ---------------- */
function verticalOverlap(box, bottom, height) {
  return bottom + height > box.minY + .03 && bottom < box.maxY - .025;
}
function moveEntityXZ(entityArrayPos, dx, dz, radius, bottom, height, bounds = 30.55) {
  let hitX = false, hitZ = false;
  const cols = WORLD.colliders;
  let x = entityArrayPos[0] + dx;
  for (const c of cols) {
    if (!verticalOverlap(c, bottom, height)) continue;
    if (x + radius > c.minX && x - radius < c.maxX &&
        entityArrayPos[2] + radius > c.minZ && entityArrayPos[2] - radius < c.maxZ) {
      if (dx > 0) x = Math.min(x, c.minX - radius - .001);
      else if (dx < 0) x = Math.max(x, c.maxX + radius + .001);
      hitX = true;
    }
  }
  x = clamp(x, -bounds, bounds);
  entityArrayPos[0] = x;
  let z = entityArrayPos[2] + dz;
  for (const c of cols) {
    if (!verticalOverlap(c, bottom, height)) continue;
    if (entityArrayPos[0] + radius > c.minX && entityArrayPos[0] - radius < c.maxX &&
        z + radius > c.minZ && z - radius < c.maxZ) {
      if (dz > 0) z = Math.min(z, c.minZ - radius - .001);
      else if (dz < 0) z = Math.max(z, c.maxZ + radius + .001);
      hitZ = true;
    }
  }
  z = clamp(z, -bounds, bounds);
  entityArrayPos[2] = z;
  return { hitX, hitZ };
}

function getSupport(x, z, radius, oldY, newY) {
  let best = 0;
  for (const c of WORLD.colliders) {
    const top = c.maxY;
    if (top <= .01 || top > oldY + .08) continue;
    if (!circleAABB(x, z, radius * .78, c)) continue;
    if (oldY >= top - .035 && newY <= top + .0001 && top > best) best = top;
  }
  return best;
}
function standingOnSomething(x, z, radius, feetY) {
  for (const c of WORLD.colliders) {
    if (Math.abs(feetY - c.maxY) < .08 && circleAABB(x, z, radius * .8, c)) return true;
  }
  return false;
}

function eyePosition() {
  const p = G.player;
  return [p.pos[0], p.pos[1] + EYE, p.pos[2]];
}
function aimBasis() {
  const p = G.player;
  return cameraBasis(p.yaw + p.recoilYaw, clamp(p.pitch + p.recoilPitch, -1.48, 1.48));
}
function computeSpread() {
  const p = G.player;
  const speed = Math.hypot(p.vel[0], p.vel[2]);
  const ads = p.adsT;
  let s = lerp(.0115, .0026, ads);
  s += clamp(speed / PLAYER_SPEED, 0, 1.35) * lerp(.0095, .0035, ads);
  if (!p.onGround) s += .015;
  s += p.bloom * lerp(.013, .0055, ads);
  if (p.sprinting) s += .008;
  return s;
}

/* ---------------- player ---------------- */
function startReload() {
  const p = G.player;
  if (G.state !== 'playing' || p.dead || p.reloading) return;
  if (p.mag >= MAG_SIZE) {
    AUDIO.dryFire();
    return;
  }
  p.reloading = true;
  p.reloadTimer = RELOAD_TIME;
  p.reloadSfxStage = 1;
  p.ads = false;
  AUDIO.reload(1);
  G.input.fire = false;
}
function finishReload() {
  const p = G.player;
  p.reloading = false;
  p.reloadTimer = 0;
  p.mag = MAG_SIZE;
  p.bloom = 0;
  G.lowAmmoWarned = false;
}
function updatePlayer(dt) {
  const p = G.player;
  if (p.dead) return;
  const keys = G.input.keys;
  p.fireTimer = Math.max(0, p.fireTimer - dt);
  p.grenadeCooldown = Math.max(0, p.grenadeCooldown - dt);
  p.iFrames = Math.max(0, p.iFrames - dt);
  p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);
  p.throwAnim = Math.max(0, (p.throwAnim || 0) - dt);
  p.weaponKick = damp(p.weaponKick, 0, 14, dt);
  p.weaponKickY = damp(p.weaponKickY || 0, 0, 11, dt);
  p.recoilPitch = damp(p.recoilPitch, 0, 12, dt);
  p.recoilYaw = damp(p.recoilYaw, 0, 12, dt);
  p.bloom = damp(p.bloom, 0, 6.5, dt);
  G.lookSwayX = damp(G.lookSwayX, 0, 9, dt);
  G.lookSwayY = damp(G.lookSwayY, 0, 9, dt);
  p.landDip = damp(p.landDip, 0, 9, dt);

  if (p.reloading) {
    p.reloadTimer -= dt;
    if (p.reloadSfxStage === 1 && p.reloadTimer < RELOAD_TIME * .58) {
      p.reloadSfxStage = 2; AUDIO.reload(2);
    }
    if (p.reloadSfxStage === 2 && p.reloadTimer < RELOAD_TIME * .22) {
      p.reloadSfxStage = 3; AUDIO.reload(3);
    }
    if (p.reloadTimer <= 0) finishReload();
  }

  // movement input relative to view yaw
  const forward = [Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
  const right = [Math.cos(p.yaw), 0, Math.sin(p.yaw)];
  let wx = 0, wz = 0;
  if (keys['KeyW']) { wx += forward[0]; wz += forward[2]; }
  if (keys['KeyS']) { wx -= forward[0]; wz -= forward[2]; }
  if (keys['KeyD']) { wx += right[0]; wz += right[2]; }
  if (keys['KeyA']) { wx -= right[0]; wz -= right[2]; }
  const wl = Math.hypot(wx, wz);
  if (wl > .001) { wx /= wl; wz /= wl; }
  const wantsMove = wl > .001;

  p.ads = !!G.input.ads && !p.sprinting && !p.reloading;
  p.adsT = damp(p.adsT, p.ads ? 1 : 0, 12, dt);
  const wasSprinting = p.sprinting;
  p.sprinting = (keys['ShiftLeft'] || keys['ShiftRight']) && wantsMove && !p.ads && p.onGround && p.health > 0;
  if (p.sprinting && !wasSprinting) AUDIO.dash();
  const targetSpeed = p.sprinting ? PLAYER_SPRINT : PLAYER_SPEED;
  const accel = p.onGround ? PLAYER_ACCEL : PLAYER_AIR_ACCEL;
  const targetVx = wx * targetSpeed, targetVz = wz * targetSpeed;
  if (wantsMove) {
    p.vel[0] = moveToward(p.vel[0], targetVx, accel * dt);
    p.vel[2] = moveToward(p.vel[2], targetVz, accel * dt);
  } else {
    p.vel[0] = moveToward(p.vel[0], 0, (p.onGround ? 34 : 5) * dt);
    p.vel[2] = moveToward(p.vel[2], 0, (p.onGround ? 34 : 5) * dt);
  }

  // jump + coyote time
  if (p.onGround) p.coyoteTimer = .1;
  else p.coyoteTimer = Math.max(0, (p.coyoteTimer || 0) - dt);
  p.jumpBuffer = Math.max(0, (p.jumpBuffer || 0) - dt);
  if (p.jumpBuffer > 0 && (p.onGround || p.coyoteTimer > 0)) {
    p.vel[1] = JUMP_VELOCITY;
    p.onGround = false;
    p.jumpBuffer = 0;
    p.coyoteTimer = 0;
    AUDIO.jump();
    spawnSparks([p.pos[0], p.pos[1] + .12, p.pos[2]], 4, [.15,.65,.75], .7, 1.3);
  }

  // horizontal collision
  const oldFeet = p.pos[1];
  const beforeX = p.pos[0], beforeZ = p.pos[2];
  const hit = moveEntityXZ(p.pos, p.vel[0] * dt, p.vel[2] * dt, PLAYER_RADIUS, p.pos[1], PLAYER_HEIGHT);
  if (hit.hitX) p.vel[0] = 0;
  if (hit.hitZ) p.vel[2] = 0;

  // vertical physics
  p.vel[1] -= GRAVITY * dt;
  let newY = p.pos[1] + p.vel[1] * dt;
  const support = getSupport(p.pos[0], p.pos[2], PLAYER_RADIUS, oldFeet, newY);
  let landed = false;
  if (p.vel[1] <= 0 && newY <= support) {
    if (!p.onGround && p.vel[1] < -6) {
      AUDIO.land();
      p.landDip = clamp(Math.abs(p.vel[1]) * .012, .02, .12);
      addShake(.1);
    }
    p.pos[1] = support;
    p.vel[1] = 0;
    p.onGround = true;
    landed = true;
  } else {
    p.pos[1] = newY;
    p.onGround = false;
  }
  if (p.pos[1] < 0) { p.pos[1] = 0; p.vel[1] = 0; p.onGround = true; }
  if (!landed && p.pos[1] > 0.02) {
    // if we're resting on a surface without crossing below it this frame
    if (p.vel[1] <= 0 && standingOnSomething(p.pos[0], p.pos[2], PLAYER_RADIUS, p.pos[1])) {
      p.vel[1] = 0; p.onGround = true;
    }
  }

  const planarSpeed = Math.hypot(p.vel[0], p.vel[2]);
  if (p.onGround && planarSpeed > .2) p.walkPhase += dt * planarSpeed * 2.15;
  else p.walkPhase += dt * .8;
  p.stepTimer -= dt;
  if (p.onGround && planarSpeed > 1.1 && p.stepTimer <= 0) {
    p.stepTimer = clamp(.51 - planarSpeed * .025, .23, .44);
    AUDIO.step(p.sprinting);
  }
  if (p.health < 30) {
    p.heartbeatTimer -= dt;
    if (p.heartbeatTimer <= 0) { p.heartbeatTimer = p.health < 15 ? .85 : 1.15; AUDIO.heartbeat(); }
  } else {
    p.heartbeatTimer = .4;
  }
  G.currentSpread = computeSpread();

  // shield regeneration
  const sinceDamage = G.time - (p.lastDamage || -20);
  if (sinceDamage > 4.6 && p.shield < p.maxShield) {
    p.shield = Math.min(p.maxShield, p.shield + 13 * dt);
  }
  // if completely still, keep camera from creeping
  if (p.pos[1] < -.2) p.pos[1] = 0;

  // firing loop
  if (G.input.fire) {
    if (p.mag <= 0 && !p.reloading && !p.dead) startReload();
    else if (p.fireTimer <= 0 && !p.reloading) performShot();
  }

  // fov targets
  let targetFov = BASE_FOV;
  if (p.adsT > .01) targetFov = lerp(BASE_FOV, ADS_FOV, p.adsT);
  if (p.sprinting) targetFov += 3.5;
  p.fov = damp(p.fov, targetFov, 10, dt);

  // low ammo sting
  if (!G.lowAmmoWarned && p.mag <= 5 && !p.reloading && p.mag > 0) {
    G.lowAmmoWarned = true;
    AUDIO.lowAmmo();
  }
  if (p.mag > 7) G.lowAmmoWarned = false;
}

function attemptFire() {
  const p = G.player;
  if (G.state !== 'playing' || p.dead) return;
  if (p.reloading) return;
  if (p.mag <= 0) {
    if (p.fireTimer <= 0) {
      AUDIO.dryFire();
      p.fireTimer = .22;
      startReload();
    }
    return;
  }
  if (p.fireTimer > 0) return;
  performShot();
}
function performShot() {
  const p = G.player;
  if (G.state !== 'playing' || p.reloading || p.dead) return;
  if (p.mag <= 0) { attemptFire(); return; }
  p.mag--;
  p.fireTimer = FIRE_INTERVAL;
  p.shots++;
  p.muzzleFlash = .06;
  p.muzzleAngle = rand(0, TAU);
  p.weaponKick = Math.min(1.45, p.weaponKick + .62);
  p.weaponKickY = rand(-1, 1) * .25;
  p.bloom = Math.min(1.2, p.bloom + .17);
  p.recoilPitch += rand(.0065, .0115) * (1 - p.adsT * .35);
  p.recoilYaw += rand(-.0042, .0042) * (1 - p.adsT * .4);
  G.shake = Math.min(1.3, G.shake + .055);
  AUDIO.shoot();

  const b = aimBasis();
  const spread = Math.max(.0008, computeSpread());
  const angle = rand(0, TAU);
  const radius = Math.sqrt(Math.random()) * spread;
  const dir = V3.norm(V3.add(b.forward, V3.add(V3.scale(b.right, Math.cos(angle) * radius), V3.scale(b.up, Math.sin(angle) * radius))));
  const eye = [p.pos[0], p.pos[1] + EYE - p.adsT * .02, p.pos[2]];
  const worldHit = WORLD.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2]);
  let worldT = worldHit ? worldHit.t : 130;

  let bestEnemy = null, bestT = Infinity, headshot = false, hitPoint = null;
  for (const e of G.enemies) {
    if (e.dead || e.invuln > 0 || e.spawnScale < .35) continue;
    let headT = Infinity, bodyT = Infinity;
    const hsScale = e.hitScale || 1;
    for (const hs of e.def.hit) {
      const center = localToWorld(e, [hs.off[0]*hsScale, hs.off[1]*hsScale, hs.off[2]*hsScale]);
      const t = raySphere(eye[0],eye[1],eye[2],dir[0],dir[1],dir[2],center[0],center[1],center[2],hs.r*hsScale);
      if (t !== null) {
        if (hs.head) headT = Math.min(headT, t);
        else bodyT = Math.min(bodyT, t);
      }
    }
    let t = Infinity, isHead = false;
    if (headT < Infinity) { t = headT; isHead = true; }
    else if (bodyT < Infinity) { t = bodyT; isHead = false; }
    if (t < bestT) {
      bestT = t; bestEnemy = e; headshot = isHead;
      hitPoint = [eye[0]+dir[0]*t, eye[1]+dir[1]*t, eye[2]+dir[2]*t];
    }
  }

  let endPoint, hitEnemy = null;
  if (bestEnemy && bestT < worldT) {
    hitEnemy = bestEnemy;
    endPoint = hitPoint;
    p.hits++;
    const baseDamage = hitEnemy.type === 'boss' && headshot ? 56 : (headshot ? 49 : 27);
    const dmg = Math.round(baseDamage * (1 + Math.max(0, G.wave - 1) * .015));
    if (headshot) p.headshots++;
    hitEnemy.hitFlash = .16;
    hitEnemy.lastDamaged = G.time;
    hitEnemy.hp -= dmg;
    AUDIO.hit(headshot);
    hitMarker(headshot ? 'head' : 'hit');
    spawnHitSparks(endPoint, 6 + (headshot ? 3 : 0), headshot ? [1.9,.32,.7] : [1.7,.52,.12], 1);
    addDamageNumber(endPoint, dmg, headshot);
    if (headshot) {
      addRing([endPoint[0], .04, endPoint[2]], .4, 1.3, .22, [1.8,.22,.55]);
    }
    if (hitEnemy.hp <= 0) killEnemy(hitEnemy, headshot);
    // small camera flinch when landing a hit
    G.shake = Math.min(1.4, G.shake + (headshot ? .09 : .03));
  } else {
    endPoint = worldHit ? worldHit.point : [eye[0]+dir[0]*110, eye[1]+dir[1]*110, eye[2]+dir[2]*110];
    if (worldHit) {
      spawnHitSparks(worldHit.point, 4, [1.2,.75,.28], .8, worldHit.normal);
      const pan = panForPoint(worldHit.point);
      AUDIO.impact(pan);
      if (Math.random() < .35) addRing([worldHit.point[0], worldHit.point[1] - .03, worldHit.point[2]], .08, .5, .18, [1.2,.6,.2]);
    }
  }
  // visual tracer from the weapon muzzle
  const muzzle = V3.add(eye, V3.add(V3.scale(b.right, .23 + (1 - p.adsT) * .1), V3.add(V3.scale(b.up, -.14), V3.scale(b.forward, .65))));
  G.tracers.push({ from: muzzle, to: endPoint, life: .075, maxLife: .075, hit: !!hitEnemy, head: headshot });
  if (G.tracers.length > 24) G.tracers.shift();

  // muzzle smoke sparks
  spawnHitSparks(muzzle, 2, [.6,1.4,1.8], .5, null, .35, .04);
  updateAimTarget();
}

function panForPoint(point) {
  const p = G.player;
  const dx = point[0] - p.pos[0], dz = point[2] - p.pos[2];
  const right = Math.cos(p.yaw) * dx + Math.sin(p.yaw) * dz;
  const dist = Math.hypot(dx, dz) || 1;
  return clamp(right / dist, -1, 1) * .75;
}

/* ---------------- damage / death ---------------- */
function damagePlayer(amount, sourcePos, cause) {
  const p = G.player;
  if (G.state !== 'playing' || p.dead || p.iFrames > 0) return;
  let remain = amount;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, remain);
    p.shield -= absorbed;
    remain -= absorbed;
    if (p.shield <= 0 && absorbed > 0) AUDIO.shieldBreak();
    else if (absorbed > 0) AUDIO.shieldHit();
  }
  if (remain > 0) {
    p.health -= remain;
    if (p.health > 0) AUDIO.hurt(remain);
  }
  p.lastDamage = G.time;
  p.iFrames = .1;
  p.health = clamp(p.health, 0, 100);
  G.damageFlash = Math.min(1, G.damageFlash + .55);
  addShake(clamp(.2 + amount * .01, .2, .65));
  if (sourcePos) {
    const dx = sourcePos[0] - p.pos[0], dz = sourcePos[2] - p.pos[2];
    const angle = Math.atan2(Math.cos(p.yaw)*dx + Math.sin(p.yaw)*dz,
                             Math.sin(p.yaw)*dx - Math.cos(p.yaw)*dz);
    G.hurtArcs.push({ angle, life: 1.1, maxLife: 1.1, amount });
  }
  if (p.health <= 0) {
    p.dead = true;
    G.deathCause = cause || '生命体征归零';
    G.state = 'dying';
    G.deathTimer = 1.7;
    G.input.fire = false;
    G.input.ads = false;
    AUDIO.explosion(true);
    addShake(1.4);
    G.damageFlash = 1;
    addRing([p.pos[0], .05, p.pos[2]], .4, 4.4, .8, [1.8,.12,.2]);
    spawnHitSparks([p.pos[0], p.pos[1]+1.1, p.pos[2]], 24, [1.8,.26,.28], 1.8, null, 1.6);
    releasePointerLock();
    // state is 'dying' so pointerlockchange will not trigger pause
  }
}

function dieNowIfNeeded() {}

/* ---------------- effects ---------------- */
function triggerScreenFlash() {
  const el = dom.screenFlash;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function addShake(amount) {
  G.shake = Math.min(2.0, Math.max(G.shake, amount));
}
function addRing(pos, startR, endR, life, color) {
  G.rings.push({ pos, startR, endR, life, maxLife: life, color });
  if (G.rings.length > 28) G.rings.shift();
}
function addDamageNumber(pos, amount, crit, text) {
  G.damageNumbers.push({
    pos: [pos[0], pos[1] + .2, pos[2]],
    amount: text || ('-' + Math.round(amount)),
    life: 1.0, maxLife: 1.0, crit: !!crit
  });
  if (G.damageNumbers.length > 24) G.damageNumbers.shift();
}
function spawnHitSparks(pos, count, color, scale = 1, normal = null, speed = 3.2, size = null) {
  for (let i = 0; i < count; i++) {
    let dir;
    if (normal) {
      dir = V3.norm([
        normal[0] + rand(-.9,.9),
        normal[1] + rand(-.1,1.2),
        normal[2] + rand(-.9,.9)
      ]);
    } else {
      dir = V3.norm([rand(-1,1), rand(-.2,1.2), rand(-1,1)]);
    }
    const sp = rand(.4, 1) * speed * scale;
    addParticle({
      pos: [pos[0],pos[1],pos[2]],
      vel: [dir[0]*sp, dir[1]*sp, dir[2]*sp],
      life: rand(.18, .52), size: size || rand(.045, .12) * scale,
      color: color.map(c=>c*rand(.8,1.15)), gravity: 6, drag: 2.4,
      star: Math.random() < .25
    });
  }
}
function spawnSparks(pos, count, color, scale = 1, speed = 1.5) {
  spawnHitSparks(pos, count, color, scale, null, speed);
}
function addParticle(p) {
  if (G.particles.length > 380) G.particles.shift();
  p.maxLife = p.life;
  p.gravity = p.gravity == null ? 5 : p.gravity;
  p.drag = p.drag == null ? 1.6 : p.drag;
  if (!p.color) p.color = [1,.7,.3];
  G.particles.push(p);
}
function explosionAt(pos, big = false) {
  const n = big ? 62 : 26;
  const colors = big ? [[2.1,.25,.2],[2,.65,.12],[1.4,.2,.7]] : [[1.8,.5,.1],[1.4,.9,.3],[.9,.3,.08]];
  for (let i = 0; i < n; i++) {
    const dir = V3.norm([rand(-1,1), rand(-.1,1), rand(-1,1)]);
    const speed = big ? rand(2, 12) : rand(1.5, 6.5);
    addParticle({
      pos: [pos[0] + rand(-.3,.3), pos[1] + rand(-.2,.8), pos[2] + rand(-.3,.3)],
      vel: [dir[0]*speed, dir[1]*speed + (big?1:0), dir[2]*speed],
      life: big ? rand(.4,1.2) : rand(.25,.7),
      size: big ? rand(.08,.32) : rand(.04,.16),
      color: choose(colors).map(v=>v*rand(.7,1.2)), gravity: 5, drag: 1.9,
      star: Math.random() < .3
    });
  }
  addRing([pos[0], .055, pos[2]], .4, big ? 8 : 3.4, big ? .85 : .45, big ? [2.2,.28,.3] : [1.9,.56,.12]);
  addRing([pos[0], .06, pos[2]], .2, big ? 4 : 2.1, big ? .6 : .35, [2,.9,.45]);
  G.shake = Math.min(2, G.shake + (big ? 1.2 : .5));
  AUDIO.explosion(big);
}

/* ---------------- aim target (used by overlay brackets) ---------------- */
function updateAimTarget() {
  const p = G.player;
  const b = aimBasis();
  const eye = [p.pos[0], p.pos[1] + EYE, p.pos[2]];
  let best = null, bestDot = .985;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const center = localToWorld(e, [0, e.type==='boss'?.5:.2, 0]);
    const dir = V3.norm(V3.sub(center, eye));
    const dot = V3.dot(dir, b.forward);
    if (dot > bestDot) { bestDot = dot; best = e; }
  }
  G.aimTarget = best;
}

/* ---------------- enemy spawning ---------------- */
let enemyIdCounter = 1;
const ENEMY_BODY = {
  sentinel: { y: 1.72, yBob: .13, bottom: .95, height: 1.45, eye: [0,.05,-.3] },
  weaver: { y: 1.38, yBob: .09, bottom: .95, height: 1.0, eye: [0,.03,-.2] },
  brute: { y: 1.28, yBob: .035, bottom: .08, height: 2.15, eye: [0,.92,-.45] },
  turret: { y: .88, yBob: 0, bottom: .06, height: 1.6, eye: [0,.55,-.55] },
  boss: { y: 4.28, yBob: .17, bottom: 2.85, height: 2.7, eye: [0,.68,-1.2] }
};

function pickGate() {
  const px = G.player.pos[0], pz = G.player.pos[2];
  const options = WORLD.spawnPoints
    .map(g => ({ g, d: Math.hypot(g.x-px, g.z-pz) }))
    .filter(o => o.d > 11)
    .sort((a,b) => b.d - a.d);
  if (!options.length) return choose(WORLD.spawnPoints);
  const pool = options.slice(0, Math.min(4, options.length));
  return choose(pool).g;
}
function spawnEnemy(type, options = {}) {
  const def = ENEMY_DEFS[type];
  if (!def) return null;
  const p = G.player;
  let x, z;
  if (options.x != null && options.z != null) {
    x = options.x;
    z = options.z;
  } else if (type === 'boss') {
    // enter from the heart of the arena, 15 m ahead of the player, never from behind
    let dx = -p.pos[0], dz = -p.pos[2];
    let dl = Math.hypot(dx, dz);
    if (dl < .2) { dx = 0; dz = -1; dl = 1; }
    x = p.pos[0] + dx / dl * 15;
    z = p.pos[2] + dz / dl * 15;
    if (Math.hypot(x, z) < 6.5) {
      // sidestep the central reactor
      x = p.pos[0] - dz / dl * 15;
      z = p.pos[2] + dx / dl * 15;
      if (Math.hypot(x, z) < 6.5) { x = p.pos[0] + dz / dl * 15; z = p.pos[2] - dx / dl * 15; }
    }
  } else if (options.gate) {
    x = options.gate.x + rand(-1.1, 1.1);
    z = options.gate.z + rand(-1.1, 1.1);
  } else {
    const gate = pickGate();
    x = gate.x + rand(-1.2, 1.2);
    z = gate.z + rand(-1.2, 1.2);
  }
  const body = ENEMY_BODY[type];
  // never materialise inside solid cover — walk the spawn point inward if needed
  for (let attempt = 0; attempt < 8; attempt++) {
    let blocked = false;
    for (const c of WORLD.colliders) {
      if (!verticalOverlap(c, body.bottom, body.height)) continue;
      if (x + def.radius + .25 > c.minX && x - def.radius - .25 < c.maxX &&
          z + def.radius + .25 > c.minZ && z - def.radius - .25 < c.maxZ) { blocked = true; break; }
    }
    if (!blocked) break;
    const d = Math.hypot(x, z) || 1;
    x -= x/d * 1.2; z -= z/d * 1.2;
  }
  x = clamp(x, -29.5, 29.5); z = clamp(z, -29.5, 29.5);
  const hpMul = type === 'boss' ? 1 : 1 + (Math.max(0, G.wave - 1)) * .085;
  const e = {
    id: enemyIdCounter++, type, def, name: def.name,
    pos: [x, body.y, z],
    yaw: shipYawTo(p.pos[0]-x, p.pos[2]-z),
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    radius: def.radius, speed: def.speed,
    fireTimer: options.fireTimer != null ? options.fireTimer : rand(.9, 2.1),
    meleeTimer: rand(.8, 1.6),
    windup: 0, attackKind: null,
    spawnScale: .04, invuln: type === 'boss' ? 2.2 : .72,
    hitFlash: 0, animTime: rand(0, 10), seed: rand(0, 20),
    canSee: false, dead: false,
    path: [], pathTimer: 0,
    strafeDir: Math.random() < .5 ? -1 : 1, strafeTimer: rand(.5, 1.8),
    vx: 0, vz: 0, lastSeen: [p.pos[0], p.pos[2]],
    intro: type === 'boss' ? 2.4 : 0,
    bossPhase: type === 'boss' ? 1 : 0,
    attackTimer: type === 'boss' ? 2.7 : 0,
    attackIndex: 0, bossWindup: 0, pendingAttack: null,
    muzzleFlash: 0, isSummon: !!options.summon,
    modelScale: type === 'boss' ? 1.32 : 1,
    hitScale: type === 'boss' ? 1.32 : 1,
    deathMarked: false
  };
  if (type === 'boss') e.radius = 2.1;
  G.enemies.push(e);
  if (type === 'boss') {
    G.boss = e;
    G.bossPhase = 1;
    G.bossSummoned = [false,false];
    G.state = 'playing';
    AUDIO.setScene('boss');
    announce('PRIME THREAT / 核心威胁', '典狱长 <em>降临</em>', 'BEYOND THE BREACH · 摧毁白色核心', 'danger', 3600);
    toast('<b>警告</b> · 巨型单位信号锁定', 3800);
    addShake(.8);
  }
  // portal bloom
  const col = type === 'boss' ? [1.6,.16,.7] : (type === 'brute' ? [1.7,.44,.1] : [1.3,.18,.6]);
  addRing([x,.05,z], .3, type === 'boss' ? 8 : 3.0, .65, col);
  addRing([x,.06,z], .1, type === 'boss' ? 4 : 1.5, .5, [1.2,.7,.9]);
  for (let i = 0; i < (type === 'boss' ? 45 : 12); i++) {
    const a = rand(0, TAU), rr = rand(.2, type === 'boss' ? 3.5 : 1.4);
    addParticle({
      pos: [x + Math.cos(a)*rr, rand(.1, type === 'boss' ? 4 : 1.5), z + Math.sin(a)*rr],
      vel: [rand(-.6,.6), rand(.6, type === 'boss' ? 4 : 2.2), rand(-.6,.6)],
      life: rand(.4,1.0), size: rand(.04,.15), color: col, gravity: -1.5, drag: 1.5, star: Math.random()<.3
    });
  }
  AUDIO.spawn();
  return e;
}

function spawnBossSupport(list) {
  for (const item of list) {
    for (let i = 0; i < item[1]; i++) {
      spawnEnemy(item[0], { summon: true, fireTimer: rand(1.4, 2.4) });
    }
  }
  toast('<b>增援信号</b> · 典狱长正在重构护卫', 2600);
}

/* ---------------- enemy perception & attacks ---------------- */
function enemyCanSee(e) {
  const p = G.player;
  const ex = e.pos[0], ey = e.pos[1] + (e.def.eye ? e.def.eye[1] : 0), ez = e.pos[2];
  const tx = p.pos[0], ty = p.pos[1] + 1.05, tz = p.pos[2];
  const dx = tx-ex, dy = ty-ey, dz = tz-ez;
  const dist = Math.hypot(dx,dy,dz);
  if (dist < .2) return true;
  const hit = WORLD.raycast(ex, ey, ez, dx/dist, dy/dist, dz/dist);
  if (!hit) return true;
  return hit.t > dist - .55;
}
function enemyEyePos(e) {
  const off = e.def.eye || [0,.2,0];
  return localToWorld(e, off);
}
function fireEnemyProjectile(e, origin, dir, def, opts = {}) {
  const pdef = def.projectile;
  const speed = opts.speed || pdef.speed;
  const spread = opts.spread == null ? .022 : opts.spread;
  const adjusted = V3.norm([
    dir[0] + rand(-spread, spread),
    dir[1] + rand(-spread * .55, spread * .55),
    dir[2] + rand(-spread, spread)
  ]);
  G.projectiles.push({
    pos: origin.slice(), prev: origin.slice(),
    vel: V3.scale(adjusted, speed),
    radius: pdef.radius * (opts.scale || 1),
    damage: opts.damage != null ? opts.damage : pdef.damage,
    color: pdef.color || opts.color || [1.8,.4,.1],
    size: (pdef.size || .8) * (opts.scale || 1),
    life: opts.life || 5.2,
    heavy: !!opts.heavy,
    source: e.type
  });
  // keep the projectile count bounded under boss barrages
  if (G.projectiles.length > 90) G.projectiles.splice(0, G.projectiles.length - 90);
  if (G.projectiles.length === 1 || Math.random() < .3) {
    const pan = panForPoint(origin);
    AUDIO.enemyShoot(pan, opts.heavy || e.type === 'brute' || e.type === 'boss');
  }
}
function fireEnemyAim(e, target, opts = {}) {
  const origin = enemyEyePos(e);
  const lead = opts.lead == null ? .35 : opts.lead;
  const pdef = e.def.projectile;
  const dist = Math.hypot(target[0]-origin[0], target[1]-origin[1], target[2]-origin[2]);
  const time = dist / (opts.speed || pdef.speed) * lead;
  const aim = [
    target[0] + G.player.vel[0] * time,
    target[1] + (opts.verticalLead ? G.player.vel[1] * time : 0),
    target[2] + G.player.vel[2] * time
  ];
  const dir = V3.norm(V3.sub(aim, origin));
  fireEnemyProjectile(e, origin, dir, e.def, opts);
  e.muzzleFlash = .1;
}
function playerChest() {
  const p = G.player;
  return [p.pos[0], p.pos[1] + 1.02, p.pos[2]];
}
function damagePlayerFromEnemy(e, amount, cause) {
  const src = e ? [e.pos[0], e.pos[1], e.pos[2]] : null;
  damagePlayer(amount, src, cause || (e ? `被 ${e.def.name} 击毁` : '受到致命伤害'));
}

function resolveEnemyAttack(e) {
  const kind = e.attackKind;
  e.attackKind = null;
  const p = G.player;
  const gapDist = Math.hypot(p.pos[0]-e.pos[0], p.pos[2]-e.pos[2]);
  if (kind === 'ranged') {
    if (e.type === 'brute') {
      const origin = localToWorld(e, [0, .88, -.62]);
      const target = [p.pos[0], p.pos[1] + .9, p.pos[2]];
      const dir = V3.norm(V3.sub(target, origin));
      fireEnemyProjectile(e, origin, dir, e.def, { speed: 12.5, damage: 16, heavy: true, spread: .035, scale: 1.2 });
    } else if (e.type === 'boss') {
      // handled by boss logic
    } else {
      fireEnemyAim(e, playerChest(), { speed: e.def.projectile.speed, spread: e.type === 'turret' ? .014 : .024 });
    }
    e.muzzleFlash = .1;
  } else if (kind === 'melee') {
    const facing = Math.abs(angleDelta(e.yaw, shipYawTo(p.pos[0]-e.pos[0], p.pos[2]-e.pos[2]))) < 1.1;
    if (gapDist < 2.8 && facing) {
      damagePlayerFromEnemy(e, e.def.meleeDamage, `被 ${e.def.name} 近身切割`);
      addRing([p.pos[0], .05, p.pos[2]], .3, 2, .32, [1.9,.18,.58]);
      spawnHitSparks([p.pos[0], p.pos[1]+1.1, p.pos[2]], 10, [1.8,.2,.55], 1.2);
      addShake(.3);
    }
  } else if (kind === 'slam') {
    if (gapDist < e.def.meleeRange + .7) {
      damagePlayerFromEnemy(e, e.def.meleeDamage, `被 ${e.def.name} 的冲击波震碎`);
    }
    addRing([e.pos[0], .05, e.pos[2]], .4, e.def.meleeRadius || 3.5, .4, [2.2,.4,.14]);
    explosionAt([e.pos[0], .25, e.pos[2]], false);
  }
}

function createDangerZone(xz, radius, delay, damage, sourceEnemy, immediate = false) {
  const zone = {
    pos: [xz[0], .04, xz[1]],
    radius, delay, timer: delay, damage,
    source: sourceEnemy,
    exploded: false, immediate: !!immediate
  };
  if (immediate) {
    // purely decorative immediate pulse (the actual damage has already been applied)
    zone.timer = .01; zone.damage = 0;
  }
  G.dangerZones.push(zone);
  return zone;
}
function explodeDangerZone(z) {
  if (z.exploded) return;
  z.exploded = true;
  const p = G.player;
  const d = Math.hypot(p.pos[0]-z.pos[0], p.pos[2]-z.pos[2]);
  if (z.damage > 0 && d < z.radius + .45) {
    const origin = [z.pos[0], .35, z.pos[2]];
    const target = [p.pos[0], p.pos[1] + 1.0, p.pos[2]];
    const v = V3.sub(target, origin), dl = V3.len(v) || 1;
    const block = WORLD.raycast(origin[0], origin[1], origin[2], v[0]/dl, v[1]/dl, v[2]/dl);
    if (!block || block.t > dl - .45) {
      damagePlayer(z.damage, [z.pos[0], 0.6, z.pos[2]], `被 ${z.source ? z.source.def.name : '典狱长'} 的炮击命中`);
    }
  }
  explosionAt([z.pos[0], .08, z.pos[2]], false);
  destroyZone(z);
}
function destroyZone(z) {
  const i = G.dangerZones.indexOf(z);
  if (i >= 0) G.dangerZones.splice(i, 1);
}

/* ---------------- enemy movement ---------------- */
function enemyRepath(e, force = false) {
  if (e.type === 'boss') return;
  if (!force && e.pathTimer > 0) return;
  const p = G.player;
  e.pathTimer = rand(.55, 1.05) + (e.type === 'sentinel' ? .15 : 0);
  if (e.canSee && Math.hypot(p.pos[0]-e.pos[0], p.pos[2]-e.pos[2]) < 9 && !e.noisyPath) {
    e.path = [];
    return;
  }
  const path = NAV.findPath(e.pos[0], e.pos[2], p.pos[0], p.pos[2]);
  e.path = path;
  if (!path.length) {
    e.path = [];
    e.noisyPath = true;
    e.pathTimer = .4;
  } else {
    e.noisyPath = false;
  }
}
function followPathDir(e) {
  if (!e.path || !e.path.length) return null;
  while (e.path.length && Math.hypot(e.path[0][0]-e.pos[0], e.path[0][1]-e.pos[2]) < .65) e.path.shift();
  if (!e.path.length) return null;
  const wp = e.path[0];
  const d = Math.hypot(wp[0]-e.pos[0], wp[1]-e.pos[2]);
  if (d < .001) return null;
  return [(wp[0]-e.pos[0])/d, (wp[1]-e.pos[2])/d];
}
function moveEnemy(e, dirX, dirZ, speed, dt) {
  const body = ENEMY_BODY[e.type];
  const desiredX = dirX * speed;
  const desiredZ = dirZ * speed;
  e.vx = damp(e.vx, desiredX, 6, dt);
  e.vz = damp(e.vz, desiredZ, 6, dt);
  const hit = moveEntityXZ(e.pos, e.vx * dt, e.vz * dt, e.radius, body.bottom, body.height, 30.3);
  if (hit.hitX) e.vx = 0;
  if (hit.hitZ) e.vz = 0;
  if ((hit.hitX || hit.hitZ) && Math.random() < .2) enemyRepath(e, true);
}
function updateEnemyMovement(e, dt) {
  const p = G.player;
  const dx = p.pos[0] - e.pos[0], dz = p.pos[2] - e.pos[2];
  if (e.type === 'turret') {
    e.yaw = lerpAngle(e.yaw, shipYawTo(dx, dz), 1 - Math.exp(-5 * dt));
    e.pos[1] = ENEMY_BODY.turret.y;
    return;
  }
  const dist = Math.hypot(dx, dz) || .001;
  e.pathTimer -= dt;
  if (e.pathTimer <= 0 || !e.path.length) enemyRepath(e);
  e.canSee = enemyCanSee(e);
  let moveX = 0, moveZ = 0, speed = e.speed;
  if (e.type === 'weaver') {
    if (dist > 1.75) {
      if (e.canSee) { moveX = dx / dist; moveZ = dz / dist; e.path = []; }
      else { const d = followPathDir(e); if (d) { moveX = d[0]; moveZ = d[1]; } }
    }
  } else if (e.type === 'brute') {
    if (dist > 2.7) {
      if (e.canSee && dist < 8) { moveX = dx/dist; moveZ = dz/dist; }
      else { const d = followPathDir(e); if (d) { moveX = d[0]; moveZ = d[1]; } }
    }
    if (e.windup > 0) speed *= .2;
  } else if (e.type === 'sentinel') {
    if (e.windup > 0) speed *= .35;
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
      e.strafeTimer = rand(1.2, 2.8);
      if (Math.random() < .35) e.strafeDir *= -1;
    }
    if (!e.canSee) {
      const d = followPathDir(e);
      if (d) { moveX = d[0]; moveZ = d[1]; }
    } else if (dist > 11 || dist < 5.2) {
      const dir = dist > 11 ? 1 : -1;
      moveX = dx / dist * dir; moveZ = dz / dist * dir;
      e.path = [];
    } else {
      // orbit at a preferred distance
      moveX = (-dz / dist) * e.strafeDir;
      moveZ = (dx / dist) * e.strafeDir;
      const drift = (dist - 8.5) * .09;
      moveX += dx / dist * drift; moveZ += dz / dist * drift;
      const ml = Math.hypot(moveX, moveZ);
      if (ml > .01) { moveX /= ml; moveZ /= ml; }
    }
  }
  const ml = Math.hypot(moveX, moveZ);
  if (ml > .001) {
    const distToPlayer = dist;
    let sp = speed;
    if (e.type === 'weaver' && distToPlayer < 3.2) sp *= 1.18;
    moveEnemy(e, moveX, moveZ, sp, dt);
  } else {
    e.vx = damp(e.vx, 0, 8, dt);
    e.vz = damp(e.vz, 0, 8, dt);
  }
  // set y bob after movement
  const body = ENEMY_BODY[e.type];
  e.pos[1] = body.y + Math.sin(e.animTime * 2.1 + e.seed) * body.yBob;
  // turn toward player
  const targetYaw = shipYawTo(dx, dz);
  e.yaw = lerpAngle(e.yaw, targetYaw, 1 - Math.exp(-7 * dt));
}

/* ---------------- enemy combat logic ---------------- */
function updateEnemyCombat(e, dt) {
  const p = G.player;
  const def = e.def;
  e.fireTimer -= dt;
  e.meleeTimer -= dt;
  if (e.windup > 0) {
    e.windup = Math.max(0, e.windup - dt);
    if (e.windup <= 0) resolveEnemyAttack(e);
    return;
  }
  if (e.invuln > 0) { e.invuln -= dt; return; }
  if (e.type === 'sentinel' || e.type === 'turret' || e.type === 'brute') {
    e.canSee = enemyCanSee(e);
    const dist = Math.hypot(p.pos[0]-e.pos[0], p.pos[2]-e.pos[2]);
    if (e.type === 'brute') {
      if (e.canSee && dist < 3.1 && e.meleeTimer <= 0 && e.invuln <= 0) {
        e.attackKind = 'slam';
        e.windup = def.meleeWindup + .15;
        e.meleeTimer = def.cooldownMelee;
        return;
      }
    }
    if (e.canSee && dist < def.range && e.fireTimer <= 0 && e.invuln <= 0) {
      e.attackKind = 'ranged';
      e.windup = def.windup;
      e.fireTimer = rand(def.cooldown[0], def.cooldown[1]) + def.windup;
    }
    // resolve once windup has been reduced by dt this frame
    if (e.attackKind) {
      // windup was set above; handled next frames
    }
  } else if (e.type === 'weaver') {
    e.canSee = enemyCanSee(e);
    const dist = Math.hypot(p.pos[0]-e.pos[0], p.pos[2]-e.pos[2]);
    if (dist < def.meleeRange && e.meleeTimer <= 0 && e.invuln <= 0) {
      e.attackKind = 'melee';
      e.windup = def.meleeWindup;
      e.meleeTimer = def.cooldown;
    }
  }
}
function finishWindup(e) {
  // called when windup crosses zero
  if (e.windup > 0) return;
  if (e.attackKind) resolveEnemyAttack(e);
}

/* ---------------- boss ---------------- */
function updateBoss(e, dt) {
  const p = G.player;
  const dx = p.pos[0] - e.pos[0], dz = p.pos[2] - e.pos[2];
  const dist = Math.hypot(dx, dz) || 1;
  e.canSee = true;
  e.animTime += dt * 1.15;
  e.pos[1] = ENEMY_BODY.boss.y + Math.sin(e.animTime * 1.4 + e.seed) * ENEMY_BODY.boss.yBob;
  e.yaw = lerpAngle(e.yaw, shipYawTo(dx, dz), 1 - Math.exp(-2.4 * dt));
  if (e.invuln > 0) e.invuln -= dt;
  if (e.intro > 0) {
    e.intro -= dt;
    e.vx = damp(e.vx, 0, 3, dt); e.vz = damp(e.vz, 0, 3, dt);
    return;
  }
  // phase transitions
  const frac = e.hp / e.maxHp;
  if (frac < .62 && e.bossPhase < 2) {
    e.bossPhase = 2; G.bossPhase = 2;
    AUDIO.warning();
    announce('THREAT ESCALATION / 威胁升级', '核心 <span class="fill">过载</span>', 'PHASE 02 · 典狱长正在重组护卫', 'danger', 2700);
    addShake(.6);
    if (!G.bossSummoned[0]) {
      G.bossSummoned[0] = true;
      spawnBossSupport([['sentinel', 1], ['weaver', 1]]);
    }
  } else if (frac < .3 && e.bossPhase < 3) {
    e.bossPhase = 3; G.bossPhase = 3;
    AUDIO.warning();
    announce('TERMINAL PHASE / 终局', '典狱长 <em>暴走</em>', 'PHASE 03 · 火力限制已解除', 'danger', 2900);
    addShake(.9);
    if (!G.bossSummoned[1]) {
      G.bossSummoned[1] = true;
      spawnBossSupport([['weaver', 1], ['sentinel', 1]]);
    }
  }
  // drift around the player at a respectful distance
  const want = 11.5;
  let mx = 0, mz = 0;
  if (dist > want + 3.2) { mx += dx / dist; mz += dz / dist; }
  else if (dist < want - 2.2) { mx -= dx / dist; mz -= dz / dist; }
  mx += (-dz / dist) * .42;
  mz += (dx / dist) * .42;
  // keep out of the reactor core footprint
  const centerDist = Math.hypot(e.pos[0], e.pos[2]);
  if (centerDist < 8) { mx += e.pos[0] / (centerDist || 1) * 1.2; mz += e.pos[2] / (centerDist || 1) * 1.2; }
  const ml = Math.hypot(mx, mz) || 1;
  e.vx = damp(e.vx, mx/ml * e.speed, 1.8, dt);
  e.vz = damp(e.vz, mz/ml * e.speed, 1.8, dt);
  const hit = moveEntityXZ(e.pos, e.vx*dt, e.vz*dt, 1.9, 3.1, 3.4, 25.5);
  if (hit.hitX || hit.hitZ) { e.vx *= -.35; e.vz *= -.35; }

  if (e.bossWindup > 0) {
    e.bossWindup -= dt;
    if (e.bossWindup <= 0) executeBossAttack(e);
    return;
  }
  e.attackTimer -= dt;
  if (e.attackTimer <= 0) {
    const cycle = ['fan', 'mortar', 'radial', 'fan', 'mortar', 'radial'];
    e.pendingAttack = cycle[e.attackIndex++ % cycle.length];
    e.bossWindup = e.bossPhase === 3 ? .55 : e.bossPhase === 2 ? .68 : .85;
    e.attackTimer = (e.bossPhase === 3 ? 1.55 : e.bossPhase === 2 ? 2.0 : 2.55) + e.bossWindup;
    AUDIO.warning();
  }
}
function bossMuzzle(e) {
  const s = e.modelScale || 1;
  return localToWorld(e, [0, .68*s, -1.35*s]);
}
function executeBossAttack(e) {
  const p = G.player;
  const origin = bossMuzzle(e);
  const phase = e.bossPhase;
  const target = [p.pos[0], p.pos[1] + 1.0, p.pos[2]];
  const baseDir = V3.norm(V3.sub(target, origin));
  if (e.pendingAttack === 'fan') {
    const count = phase === 3 ? 9 : phase === 2 ? 7 : 5;
    const speed = phase === 3 ? 15.5 : 13.5;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count-1)/2) * (phase === 3 ? .075 : .095);
      const right = [Math.cos(e.yaw), 0, Math.sin(e.yaw)];
      const up = [0,1,0];
      const dir = V3.norm(V3.add(baseDir, V3.add(V3.scale(right, spread), V3.scale(up, rand(-.015,.015)))));
      fireEnemyProjectile(e, origin.slice(), dir, e.def, {
        speed, damage: phase === 3 ? 14 : 12, spread: .012, heavy: true, scale: 1.25, life: 6
      });
    }
    addShake(.18);
  } else if (e.pendingAttack === 'radial') {
    const count = phase === 3 ? 16 : phase === 2 ? 13 : 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rand(-.08,.08);
      const dir = V3.norm([Math.cos(a), rand(-.08,.02), Math.sin(a)]);
      fireEnemyProjectile(e, origin.slice(), dir, e.def, {
        speed: 11.5, damage: 11, spread: .008, heavy: false, scale: 1.05, life: 5.5
      });
    }
    addRing([e.pos[0], .06, e.pos[2]], .5, 9, .8, [1.8,.14,.62]);
    addShake(.35);
  } else if (e.pendingAttack === 'mortar') {
    const n = phase === 3 ? 5 : phase === 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-.25,.25);
      const rr = i === 0 ? 0 : rand(1.5, 4.2);
      createDangerZone([p.pos[0] + Math.cos(a)*rr, p.pos[2] + Math.sin(a)*rr], 3.25, 1.45 + i*.1, 23, e);
    }
    toast('<b>炮击预警</b> · 离开红色标记区域', 1700);
    AUDIO.warning();
  }
  e.muzzleFlash = .16;
  const fl = localToWorld(e, [0,.68,-1.5]);
  spawnSparks(fl, 12, [1.8,.2,.6], 1.2, 3);
}

/* ---------------- per-frame enemy pass ---------------- */
function updateEnemies(dt) {
  const p = G.player;
  const snapshot = G.enemies.slice();
  for (const e of snapshot) {
    if (e.dead) continue;
    e.animTime += dt * (e.type === 'boss' ? 1.2 : (e.type === 'weaver' ? 1.7 : 1.1));
    const targetScale = 1;
    if (e.spawnScale < targetScale) e.spawnScale = Math.min(targetScale, e.spawnScale + dt * (e.type === 'boss' ? 1.0 : 2.6));
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.muzzleFlash = Math.max(0, e.muzzleFlash - dt);
    if (e.type === 'boss') {
      updateBoss(e, dt);
    } else {
      updateEnemyMovement(e, dt);
      updateEnemyCombat(e, dt);
      // turrets get their y set by movement
    }
    // physical separation from the player (prevents standing inside a brute)
    if (e.type !== 'boss' && e.spawnScale > .7) {
      const dx = e.pos[0] - p.pos[0], dz = e.pos[2] - p.pos[2];
      const d = Math.hypot(dx, dz);
      const minD = e.radius + PLAYER_RADIUS + .1;
      if (d < minD && d > .0001) {
        e.pos[0] = p.pos[0] + dx/d * minD;
        e.pos[2] = p.pos[2] + dz/d * minD;
      }
    }
    // keep everyone inside the playfield
    e.pos[0] = clamp(e.pos[0], -30.2, 30.2);
    e.pos[2] = clamp(e.pos[2], -30.2, 30.2);
  }
  // soft separation between units
  for (let i = 0; i < snapshot.length; i++) {
    const a = snapshot[i];
    if (a.dead || a.spawnScale < .5 || a.type === 'turret' || a.type === 'boss') continue;
    for (let j = i + 1; j < snapshot.length; j++) {
      const b = snapshot[j];
      if (b.dead || b.spawnScale < .5 || b.type === 'turret' || b.type === 'boss') continue;
      const dx = b.pos[0]-a.pos[0], dz = b.pos[2]-a.pos[2];
      const d = Math.hypot(dx, dz);
      const minD = a.radius + b.radius + .1;
      if (d < minD && d > .001) {
        const push = (minD - d) * .5;
        a.pos[0] -= dx/d * push; a.pos[2] -= dz/d * push;
        b.pos[0] += dx/d * push; b.pos[2] += dz/d * push;
      }
    }
  }
  if (G.enemies.some(e => e.dead)) G.enemies = G.enemies.filter(e => !e.dead);
}

/* ---------------- projectiles ---------------- */
function segmentSphereT(a, b, center, radius) {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const acx = center[0]-a[0], acy = center[1]-a[1], acz = center[2]-a[2];
  const ab2 = abx*abx + aby*aby + abz*abz;
  if (ab2 < 1e-8) return -1;
  let t = (acx*abx + acy*aby + acz*abz) / ab2;
  t = clamp(t, 0, 1);
  const px = a[0]+abx*t, py = a[1]+aby*t, pz = a[2]+abz*t;
  const dx = px-center[0], dy = py-center[1], dz = pz-center[2];
  return dx*dx + dy*dy + dz*dz <= radius*radius ? t : -1;
}
function updateProjectiles(dt) {
  const p = G.player;
  const chest = [p.pos[0], p.pos[1] + 1.0, p.pos[2]];
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.life -= dt;
    if (pr.life <= 0) { G.projectiles.splice(i,1); continue; }
    pr.prev[0] = pr.pos[0]; pr.prev[1] = pr.pos[1]; pr.prev[2] = pr.pos[2];
    const nx = pr.pos[0] + pr.vel[0]*dt;
    const ny = pr.pos[1] + pr.vel[1]*dt;
    const nz = pr.pos[2] + pr.vel[2]*dt;
    const sx = nx-pr.prev[0], sy = ny-pr.prev[1], sz = nz-pr.prev[2];
    const sl = Math.hypot(sx, sy, sz);
    let removed = false;
    if (sl > .0001) {
      const hit = WORLD.raycast(pr.prev[0], pr.prev[1], pr.prev[2], sx/sl, sy/sl, sz/sl);
      if (hit && hit.t < sl + pr.radius) {
        const point = [pr.prev[0] + sx/sl * Math.min(hit.t, sl), pr.prev[1] + sy/sl * Math.min(hit.t, sl), pr.prev[2] + sz/sl * Math.min(hit.t, sl)];
        spawnHitSparks(point, 5, pr.color, .65, hit.normal, 2.2);
        addRing([point[0], Math.max(.045, point[1]-.05), point[2]], .12, .9, .2, pr.color);
        G.projectiles.splice(i,1);
        removed = true;
      }
    }
    if (removed) continue;
    pr.pos[0] = nx; pr.pos[1] = ny; pr.pos[2] = nz;
    if (G.state === 'playing' && !p.dead) {
      const chestT = segmentSphereT(pr.prev, pr.pos, chest, .58);
      const headT = segmentSphereT(pr.prev, pr.pos, [p.pos[0], p.pos[1] + 1.56, p.pos[2]], .25);
      if (chestT >= 0 || headT >= 0) {
        const srcType = pr.source;
        const cause = srcType && ENEMY_DEFS[srcType] ? `被 ${ENEMY_DEFS[srcType].name} 的弹幕击穿` : '被弹幕击穿';
        const impactPoint = headT >= 0 ? [p.pos[0], p.pos[1]+1.56, p.pos[2]] : [p.pos[0], p.pos[1]+1.0, p.pos[2]];
        spawnHitSparks(impactPoint, 6, [1.8,.2,.3], .8);
        damagePlayer(pr.damage, pr.prev, cause);
        G.projectiles.splice(i,1);
        continue;
      }
    }
    if (pr.pos[1] < .05) {
      spawnHitSparks([pr.pos[0], .05, pr.pos[2]], 4, pr.color, .6, [0,1,0], 1.5);
      G.projectiles.splice(i,1);
    }
  }
}

function updateDangerZones(dt) {
  for (let i = G.dangerZones.length - 1; i >= 0; i--) {
    const z = G.dangerZones[i];
    if (z.exploded) { G.dangerZones.splice(i,1); continue; }
    z.timer -= dt;
    if (z.timer <= 0) {
      explodeDangerZone(z);
    }
  }
}

/* ---------------- grenades ---------------- */
function throwGrenade() {
  const p = G.player;
  if (G.state !== 'playing' || p.dead || p.grenades <= 0 || p.grenadeCooldown > 0 || p.reloading) return;
  p.grenades--;
  p.grenadeCooldown = .7;
  p.throwAnim = .3;
  G.input.fire = false;
  const b = aimBasis();
  const origin = [
    p.pos[0] + b.right[0]*.14 + b.forward[0]*.5,
    p.pos[1] + EYE - .12,
    p.pos[2] + b.right[2]*.14 + b.forward[2]*.5
  ];
  G.grenades.push({
    pos: origin, vel: [
      b.forward[0] * 12.5 + p.vel[0]*.25,
      b.forward[1] * 12.5 + 2.3 + p.vel[1]*.2,
      b.forward[2] * 12.5 + p.vel[2]*.25
    ],
    fuse: 1.68, radius: .16, spin: rand(0, TAU), trailTimer: 0
  });
  AUDIO.grenadeThrow();
  toast('<b>G</b> · 电弧手雷已投出', 1200);
}
function explodeGrenade(g) {
  const pos = [g.pos[0], Math.max(.2, g.pos[1]), g.pos[2]];
  explosionAt([pos[0], .3, pos[2]], true);
  addRing([pos[0],.05,pos[2]], .5, 7.5, .8, [1.7,.9,.3]);
  for (const e of G.enemies.slice()) {
    if (e.dead) continue;
    const center = localToWorld(e, [0, e.type === 'boss' ? .5 : .2, 0]);
    const d = V3.dist(center, pos);
    if (d < 6.5) {
      const hit = WORLD.raycast(pos[0], pos[1], pos[2], (center[0]-pos[0])/d, (center[1]-pos[1])/d, (center[2]-pos[2])/d);
      if (hit && hit.t < d - .4) continue;
      const dmg = Math.round(190 * (1 - clamp(d / 6.5, 0, 1) * .48));
      e.hp -= dmg;
      e.hitFlash = .2;
      addDamageNumber(center, dmg, false);
      spawnHitSparks(center, 8, [1.8,.65,.16], 1);
      if (e.hp <= 0) killEnemy(e, false);
    }
  }
  G.shake = Math.min(2, G.shake + .8);
}
function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.fuse -= dt;
    g.spin += dt * 8;
    g.vel[1] -= GRAVITY * .82 * dt;
    const prev = [g.pos[0], g.pos[1], g.pos[2]];
    const next = [g.pos[0]+g.vel[0]*dt, g.pos[1]+g.vel[1]*dt, g.pos[2]+g.vel[2]*dt];
    const dx = next[0]-prev[0], dy = next[1]-prev[1], dz = next[2]-prev[2];
    const len = Math.hypot(dx,dy,dz);
    let bounced = false;
    if (len > .0001) {
      const hit = WORLD.raycast(prev[0],prev[1],prev[2],dx/len,dy/len,dz/len);
      if (hit && hit.t < len) {
        const n = hit.normal;
        g.pos[0] = prev[0] + dx/len * Math.max(0, hit.t - .08) + n[0]*.14;
        g.pos[1] = prev[1] + dy/len * Math.max(0, hit.t - .08) + n[1]*.14;
        g.pos[2] = prev[2] + dz/len * Math.max(0, hit.t - .08) + n[2]*.14;
        const vn = g.vel[0]*n[0] + g.vel[1]*n[1] + g.vel[2]*n[2];
        g.vel[0] = (g.vel[0] - 2*vn*n[0]) * .36;
        g.vel[1] = (g.vel[1] - 2*vn*n[1]) * .36;
        g.vel[2] = (g.vel[2] - 2*vn*n[2]) * .36;
        g.vel[0] *= .78; g.vel[2] *= .78;
        bounced = true;
        spawnSparks(g.pos, 3, [1.8,.6,.15], .6, 1.6);
      }
    }
    if (!bounced) {
      g.pos = next;
      if (g.pos[1] < .15) {
        g.pos[1] = .15;
        if (Math.abs(g.vel[1]) > .8) { g.vel[1] *= -.36; g.vel[0] *= .58; g.vel[2] *= .58; spawnSparks(g.pos, 2, [1.8,.6,.15], .5, 1.2); }
        else { g.vel[1] = 0; g.vel[0] *= .82; g.vel[2] *= .82; }
      }
    }
    g.trailTimer -= dt;
    if (g.trailTimer <= 0) {
      g.trailTimer = .045;
      addParticle({ pos:[g.pos[0],g.pos[1],g.pos[2]], vel:[rand(-.2,.2),rand(-.1,.3),rand(-.2,.2)], life:.35, size:.1, color:[1.5,.8,.25], gravity:-.2, drag:2, star:false });
    }
    if (g.fuse <= 0) {
      explodeGrenade(g);
      G.grenades.splice(i,1);
    }
  }
}

/* ---------------- pickups ---------------- */
function spawnPickup(type, x, z, waveSupply = false) {
  const p = G.player;
  if (p && Math.hypot(p.pos[0]-x, p.pos[2]-z) < 1.1) return null;
  const pickup = {
    type, pos: [x, .6, z], baseY: .6,
    age: 0, life: waveSupply ? 52 : 36,
    waveSupply, seed: rand(0, 10)
  };
  G.pickups.push(pickup);
  return pickup;
}
function spawnWaveSupplies() {
  G.pickups = G.pickups.filter(p => !p.waveSupply);
  const healthSpots = [[-25.5,-7.5],[25.5,7.5],[-9,26],[9,-26]];
  const grenadeSpots = [[26.5,-18.5],[-26,18.5],[18.5,25.5],[-20,-23]];
  // two health, one grenade, chosen deterministically per wave for fairness
  for (let i = 0; i < 2; i++) {
    const s = healthSpots[(G.wave + i * 2) % healthSpots.length];
    spawnPickup('health', s[0], s[1], true);
  }
  const gs = grenadeSpots[G.wave % grenadeSpots.length];
  spawnPickup('grenade', gs[0], gs[1], true);
}
function updatePickups(dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.age += dt;
    pk.life -= dt;
    pk.baseY = .6 + Math.sin(pk.age * 2.4 + pk.seed) * .09;
    const needs = (pk.type === 'health' && p.health < p.maxHealth) || (pk.type === 'grenade' && p.grenades < 2);
    const dx = p.pos[0]-pk.pos[0], dz = p.pos[2]-pk.pos[2];
    const d = Math.hypot(dx, dz);
    if (needs && d < 2.4) {
      const pull = 5 * dt * (1 - d / 2.4 + .2);
      pk.pos[0] += dx / d * pull;
      pk.pos[2] += dz / d * pull;
    }
    if (pk.life <= 0) { G.pickups.splice(i,1); continue; }
    if (needs && d < .9 && Math.abs((p.pos[1]+1) - pk.baseY) < 2.4) {
      if (pk.type === 'health') {
        p.health = Math.min(p.maxHealth, p.health + 32);
        toast('<b>生命 +32</b> · 纳米修复完成', 1600);
        AUDIO.pickup('health');
        spawnSparks([pk.pos[0], pk.baseY, pk.pos[2]], 8, [.25,1.6,.7], .8, 2.4);
      } else {
        p.grenades = Math.min(2, p.grenades + 1);
        toast('<b>电弧手雷 +1</b> · 战术库存更新', 1600);
        AUDIO.pickup('grenade');
        spawnSparks([pk.pos[0], pk.baseY, pk.pos[2]], 8, [1.7,.8,.15], .8, 2.4);
      }
      addRing([pk.pos[0], .05, pk.pos[2]], .2, 2.0, .35, pk.type === 'health' ? [.3,1.5,.7] : [1.7,.8,.2]);
      G.pickups.splice(i,1);
    }
  }
}
function dropPickupFor(e) {
  let type = null;
  const r = Math.random();
  if (e.type === 'brute') type = r < .55 ? 'health' : (r < .8 ? 'grenade' : null);
  else if (e.type === 'turret') type = r < .35 ? 'grenade' : null;
  else if (e.type === 'weaver') type = r < .12 ? 'health' : (r < .2 ? 'grenade' : null);
  else type = r < .14 ? 'health' : (r < .22 ? 'grenade' : null);
  if (type) {
    const pk = spawnPickup(type, e.pos[0] + rand(-.3,.3), e.pos[2] + rand(-.3,.3), false);
    if (pk) pk.pos[1] = .6;
  }
}

/* ---------------- kills / scoring ---------------- */
function killEnemy(e, headshot) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  G.waveKills++;
  G.combo++;
  G.comboTimer = 4;
  const mult = comboMultiplier();
  G.maxMultiplier = Math.max(G.maxMultiplier, mult);
  const pts = Math.round((e.def.score || 100) * mult * (headshot ? 1.5 : 1));
  G.score += pts;
  addKillFeed(e.def.name, headshot);
  hitMarker('kill');
  const pos = [e.pos[0], e.pos[1] + .3, e.pos[2]];
  addDamageNumber(pos, 0, headshot, '+' + pts);
  addRing([e.pos[0], .06, e.pos[2]], .3, e.type === 'boss' ? 14 : 2.6, .55, e.type === 'boss' ? [2,.25,.7] : [1.8,.6,.2]);
  spawnHitSparks(pos, e.type === 'boss' ? 60 : e.type === 'brute' ? 24 : 14, [1.9,.5,.12], e.type === 'boss' ? 2 : 1.1);
  if (e.type === 'boss') {
    explosionAt([e.pos[0], e.pos[1], e.pos[2]], true);
    G.bossDeathPos = [e.pos[0], e.pos[1], e.pos[2]];
    G.bossDeathTimer = 3.6;
    G.victoryTimer = 3.6;
    G.state = 'victory';
    G.bossPhase = 3;
    G.input.fire = false; G.input.ads = false;
    triggerScreenFlash();
    AUDIO.waveClear();
    announce('CORE BREACH / 核心突破', '典狱长 <span class="fill">已离线</span>', '守卫程序终止 · 区域净化中', 'success', 3600);
    releasePointerLock();
    G.projectiles = [];
    G.dangerZones = [];
    G.pickups = [];
    addShake(1.5);
  } else {
    AUDIO.kill(headshot);
    addShake(.14);
    dropPickupFor(e);
    if (e.type === 'brute') {
      explosionAt([e.pos[0], e.pos[1]*.7, e.pos[2]], false);
    }
  }
  // raise score immediately in HUD even before next frame
  dom.scoreValue.textContent = fmtInt(G.score);
}

/* ---------------- waves ---------------- */
function buildWaveQueue(def) {
  const queue = [];
  for (const [type, count] of def.units) for (let i = 0; i < count; i++) queue.push(type);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  // the boss always enters first
  if (queue.includes('boss')) return ['boss'];
  return queue;
}
function beginWave(n) {
  if (n < 1 || n > WAVES.length) return;
  const def = WAVES[n - 1];
  G.wave = n;
  G.wavePhase = def.units.some(u => u[0] === 'boss') ? 'boss' : 'active';
  G.waveQueue = buildWaveQueue(def);
  G.waveMaxAlive = def.maxAlive;
  G.waveSpawnGap = def.spawnGap;
  G.spawnTimer = def.units.some(u => u[0] === 'boss') ? 1.1 : 1.25;
  G.waveKills = 0;
  setWaveHeader(n);
  refreshWaveSegments();
  spawnWaveSupplies();
  const total = def.units.reduce((a,u)=>a+u[1],0);
  if (!def.units.some(u=>u[0]==='boss')) {
    announce(`WAVE ${String(n).padStart(2,'0')} / 05 · ${def.en}`, `${def.name}`, `${total} HOSTILE SIGNATURES · ${def.subtitle}`, '', 3000);
    AUDIO.waveStart(false);
  } else {
    AUDIO.waveStart(true);
  }
  setTimeout(() => {
    if (G.state === 'playing' && G.wave === n) toast(`<b>战术提示</b> · ${def.hint}`, 4200);
  }, 4300);
  // ensure previous boss references do not linger
  if (G.wavePhase !== 'boss') { G.boss = null; dom.bossHud.classList.add('hidden'); }
}
function completeWave() {
  if (G.state !== 'playing') return;
  G.wavePhase = 'intermission';
  G.waveTimer = 5.7;
  G.player.health = Math.min(G.player.maxHealth, G.player.health + 24);
  G.player.shield = G.player.maxShield;
  G.player.grenades = 2;
  G.player.ads = false;
  G.input.fire = false;
  G.score += 250 * G.wave;
  AUDIO.waveClear();
  announce('SECTOR CLEAR / 区域净化', `第 ${String(G.wave).padStart(2,'0')} 波 <span class="fill">清除</span>`, '补给已投放 · 护盾已恢复 · 准备迎接下一波', 'success', 3000);
  toast('<b>区域净化 +' + (250*G.wave) + '</b> · 生命与护盾部分恢复', 3000);
  spawnWaveSupplies();
  dom.bossHud.classList.add('hidden');
}
function updateWave(dt) {
  if (G.state !== 'playing') return;
  if (G.wavePhase === 'intermission') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) {
      beginWave(G.wave + 1);
    }
    return;
  }
  if (G.wavePhase !== 'active' && G.wavePhase !== 'boss') return;
  let alive = countAlive();
  if (G.waveQueue.length && alive < G.waveMaxAlive) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      const type = G.waveQueue.shift();
      if (type) {
        spawnEnemy(type);
        alive = countAlive();
        G.spawnTimer = G.waveSpawnGap * rand(.8, 1.35);
      }
    }
  }
  if (!G.waveQueue.length && countAlive() === 0) {
    if (G.wave < WAVES.length) completeWave();
  }
}

/* ---------------- ambient & effect updates ---------------- */
function initDust() {
  G.dust = [];
  for (let i = 0; i < 80; i++) {
    G.dust.push({
      pos: [rand(-30,30), rand(.4, 11), rand(-30,30)],
      size: rand(.018,.075), speed: rand(.03,.12), phase: rand(0,TAU), drift: rand(.2,.8)
    });
  }
}
function updateDust(dt) {
  for (const d of G.dust) {
    d.phase += dt * d.speed;
    d.pos[0] += Math.sin(d.phase * 1.7) * dt * .1 * d.drift;
    d.pos[1] += Math.sin(d.phase * .8) * dt * .03;
    d.pos[2] += Math.cos(d.phase * 1.3) * dt * .1 * d.drift;
    if (d.pos[0] > 31) d.pos[0] = -31; if (d.pos[0] < -31) d.pos[0] = 31;
    if (d.pos[2] > 31) d.pos[2] = -31; if (d.pos[2] < -31) d.pos[2] = 31;
    if (d.pos[1] < .2) d.pos[1] = 11; if (d.pos[1] > 12) d.pos[1] = .4;
  }
}
function updateEffects(dt) {
  // particles
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    if (p.life <= 0) { G.particles.splice(i,1); continue; }
    p.vel[1] -= p.gravity * dt;
    const drag = Math.exp(-p.drag * dt);
    p.vel[0] *= drag; p.vel[2] *= drag;
    p.pos[0] += p.vel[0]*dt; p.pos[1] += p.vel[1]*dt; p.pos[2] += p.vel[2]*dt;
    if (p.pos[1] < .03) { p.pos[1] = .03; p.vel[1] *= -.25; p.vel[0] *= .7; p.vel[2] *= .7; }
  }
  for (let i = G.rings.length - 1; i >= 0; i--) {
    G.rings[i].life -= dt;
    if (G.rings[i].life <= 0) G.rings.splice(i,1);
  }
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    G.tracers[i].life -= dt;
    if (G.tracers[i].life <= 0) G.tracers.splice(i,1);
  }
  for (let i = G.damageNumbers.length - 1; i >= 0; i--) {
    G.damageNumbers[i].life -= dt;
    if (G.damageNumbers[i].life <= 0) G.damageNumbers.splice(i,1);
  }
  for (let i = G.hurtArcs.length - 1; i >= 0; i--) {
    G.hurtArcs[i].life -= dt;
    if (G.hurtArcs[i].life <= 0) G.hurtArcs.splice(i,1);
  }
  G.shake = damp(G.shake, 0, 8, dt);
  G.damageFlash = Math.max(0, G.damageFlash - dt * 1.7);
  dom.damageFlash.style.opacity = (G.damageFlash * .9).toFixed(3);
}
function updateCombo(dt) {
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) G.combo = 0;
  }
}

/* ---------------- master update ---------------- */
function updateGame(dt, now) {
  G.visualTime += dt;
  G.frame++;
  if (G.state === 'menu') {
    G.menuTime += dt;
    updateDust(dt);
    G.menuCamAngle += dt * .035;
    return;
  }
  if (G.state === 'paused' || G.state === 'ended') return;
  G.time += dt;
  if (G.state === 'playing') {
    G.runTime += dt;
    updateDust(dt);
    updatePlayer(dt);
    if (G.state === 'playing') {
      updateCombo(dt);
      updateWave(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      updateDangerZones(dt);
      updateGrenades(dt);
      updatePickups(dt);
    }
    G.aimTick = (G.aimTick || 0) - dt;
    if (G.aimTick <= 0) { G.aimTick = .08; updateAimTarget(); }
  } else if (G.state === 'dying') {
    updateDust(dt);
    G.deathTimer -= dt;
    if (G.deathTimer <= 0) {
      finishRun(false, G.deathCause);
      return;
    }
  } else if (G.state === 'victory') {
    updateDust(dt);
    G.victoryTimer -= dt;
    G.bossDeathTimer -= dt;
    // after the core breaks, the arena is lit by sympathetic detonations
    if (G.bossDeathTimer > 0 && Math.random() < dt * 9) {
      const p = G.bossDeathPos || [0,4,0];
      const pos = [p[0]+rand(-4,4), p[1]+rand(-2,2), p[2]+rand(-4,4)];
      explosionAt(pos, false);
      addShake(.25);
    }
    if (G.victoryTimer <= 0) {
      finishRun(true);
      return;
    }
  }
  updateEffects(dt);
}
