/* ============================================================
   NEON BREACH — state, content definitions, materials, navigation
   ============================================================ */

const MAG_SIZE = 30;
const RELOAD_TIME = 1.36;
const FIRE_INTERVAL = .105;
const PLAYER_SPEED = 5.8;
const PLAYER_SPRINT = 8.6;
const PLAYER_ACCEL = 46;
const PLAYER_AIR_ACCEL = 12;
const GRAVITY = 15.5;
const JUMP_VELOCITY = 5.5;
const BASE_FOV = 76;
const ADS_FOV = 56;
const EYE = 1.66;

const ENEMY_DEFS = {
  sentinel: {
    name: '侦察机', code: 'SCOUT', hp: 72, speed: 3.4, radius: .58, height: 1.3,
    score: 100, color: '#ff9a3c', range: 25, cooldown: [1.65, 2.35], windup: .34,
    projectile: { speed: 15.5, damage: 8, radius: .19, color: [1.8, .56, .12], size: .75 },
    hit: [
      { off:[0,.46,0], r:.23, head:true },
      { off:[0,.03,0], r:.54, head:false },
      { off:[0,-.4,0], r:.28, head:false }
    ],
    shadow: .75, sideOffset: .1
  },
  weaver: {
    name: '织网者', code: 'WEAVER', hp: 42, speed: 5.3, radius: .48, height: .9,
    score: 85, color: '#ff3e9e', meleeRange: 2.15, meleeDamage: 11, meleeWindup: .3,
    cooldown: 1.05, hit: [
      { off:[0,.28,0], r:.19, head:true },
      { off:[0,-.02,0], r:.43, head:false }
    ],
    shadow: .65
  },
  brute: {
    name: '碾压者', code: 'BRUTE', hp: 280, speed: 2.25, radius: 1.05, height: 2.35,
    score: 300, color: '#ff7040', range: 22, cooldown: [3.0, 3.8], windup: .45,
    projectile: { speed: 13, damage: 16, radius: .34, color: [1.9, .3, .08], size: 1.15 },
    meleeRange: 3.3, meleeDamage: 24, meleeWindup: .9, meleeRadius: 3.5, cooldownMelee: 4.2,
    hit: [
      { off:[0,1.08,-.18], r:.3, head:true },
      { off:[0,.45,0], r:.88, head:false },
      { off:[0,-.62,0], r:.55, head:false }
    ],
    shadow: 1.45
  },
  turret: {
    name: '哨戒炮', code: 'TURRET', hp: 155, speed: 0, radius: .72, height: 1.55,
    score: 180, color: '#ff304f', range: 30, cooldown: 1.45, windup: .38,
    projectile: { speed: 22, damage: 7, radius: .13, color: [2, .15, .26], size: .52 },
    hit: [
      { off:[0,.44,0], r:.24, head:true },
      { off:[0,-.05,0], r:.58, head:false }
    ],
    shadow: .9
  },
  boss: {
    name: '典狱长', code: 'THE WARDEN', hp: 3000, speed: 1.4, radius: 1.9, height: 3.4,
    score: 5000, color: '#ff2f8b', range: 32, boss: true,
    projectile: { speed: 13.5, damage: 12, radius: .3, color: [2,.2,.7], size: 1.2 },
    hit: [
      { off:[0,1.48,-.62], r:.4, head:true },
      { off:[0,.55,-1.02], r:.42, head:true },
      { off:[0,.65,.08], r:1.5, head:false },
      { off:[-2.05,.65,.08], r:.62, head:false },
      { off:[2.05,.65,.08], r:.62, head:false }
    ],
    shadow: 3.2
  }
};

const WAVES = [
  {
    name: '接触', en: 'CONTACT', subtitle: '入口区域的侦察单位已被激活。',
    units: [['sentinel', 5]], maxAlive: 3, spawnGap: 1.35,
    hint: '利用掩体接近，射击无人机的橙色核心。'
  },
  {
    name: '蜂群', en: 'SWARM', subtitle: '高速单位正在包抄你的侧翼。',
    units: [['sentinel', 6], ['weaver', 4]], maxAlive: 5, spawnGap: 1.1,
    hint: '织网者会贴身突袭，保持移动。'
  },
  {
    name: '重装', en: 'HEAVY', subtitle: '碾压者踏入竞技场，哨戒炮已上线。',
    units: [['sentinel', 6], ['weaver', 4], ['brute', 2], ['turret', 1]], maxAlive: 6, spawnGap: 1.05,
    hint: '碾压者会预判落点召唤冲击波，注意地面警示。'
  },
  {
    name: '压制', en: 'SUPPRESSION', subtitle: '全部单位投入战场。没有退路。',
    units: [['sentinel', 7], ['weaver', 5], ['brute', 3], ['turret', 1]], maxAlive: 7, spawnGap: .94,
    hint: '连锁击杀可以提升得分倍率。'
  },
  {
    name: '典狱长', en: 'THE WARDEN', subtitle: '核心守卫已脱离束缚。准备承受它的怒火。',
    units: [['boss', 1]], maxAlive: 5, spawnGap: 3,
    hint: '瞄准典狱长的白色核心造成倍数伤害。'
  }
];

const PLAYER_START = { x: 0, z: 24.5, yaw: 0 };

function makePlayer() {
  return {
    pos: [PLAYER_START.x, 0, PLAYER_START.z],
    vel: [0, 0, 0],
    yaw: PLAYER_START.yaw,
    pitch: 0,
    health: 100, maxHealth: 100,
    shield: 50, maxShield: 50,
    mag: MAG_SIZE, fireTimer: 0, reloading: false, reloadTimer: 0, reloadSfxStage: 0,
    bloom: 0, recoilPitch: 0, recoilYaw: 0,
    weaponKick: 0, weaponKickY: 0, muzzleFlash: 0, muzzleAngle: 0,
    ads: false, adsT: 0, fov: BASE_FOV,
    sprinting: false, onGround: true, jumping: false, jumpBuffer: 0,
    walkPhase: 0, bob: 0, landDip: 0,
    grenades: 2, grenadeCooldown: 0,
    lastDamage: -10, shieldDelay: 0, iFrames: 0,
    dead: false,
    coyoteTimer: 0, throwAnim: 0, sprintT: 0, stepTimer: 0, heartbeatTimer: 0,
    shots: 0, hits: 0, headshots: 0,
    deathT: 0,
    shadowY: 0
  };
}

const G = {
  state: 'boot',
  time: 0,
  visualTime: 0,
  menuTime: 0,
  menuCamAngle: .62,
  frame: 0,
  player: makePlayer(),
  enemies: [],
  projectiles: [],
  particles: [],
  rings: [],
  pickups: [],
  grenades: [],
  dangerZones: [],
  tracers: [],
  damageNumbers: [],
  hurtArcs: [],
  dust: [],
  score: 0,
  kills: 0,
  runTime: 0,
  wave: 0,
  wavePhase: 'idle',
  waveTimer: 0,
  waveQueue: [],
  waveMaxAlive: 4,
  waveSpawnGap: 1,
  spawnTimer: 0,
  waveKills: 0,
  boss: null,
  bossPhase: 0,
  bossDeathTimer: 0,
  bossSummoned: [false, false],
  intermission: 0,
  combo: 0,
  comboTimer: 0,
  maxMultiplier: 1,
  shake: 0,
  damageFlash: 0,
  hitstop: 0,
  deathTimer: 0,
  victoryTimer: 0,
  announceTimer: 0,
  toastTimer: 0,
  hintCooldown: 0,
  menuStartTimer: 0,
  aimTarget: null,
  adsTarget: null,
  pointerLocked: false,
  pointerEverLocked: false,
  suppressPause: false,
  lockRequested: false,
  lockFailed: false,
  startedAt: 0,
  debug: new URLSearchParams(location.search).has('debug'),
  shotMode: new URLSearchParams(location.search).has('shot'),
  input: {
    keys: Object.create(null),
    fire: false,
    ads: false,
    dryLatch: false
  },
  lookSwayX: 0,
  lookSwayY: 0,
  lastPlayerPos: [0,0,24.5],
  currentSpread: .01,
  lowAmmoWarned: false,
  started: false
};

/* materials for dynamic props */
const DYN_MATS = {
  grenade: { color:[.16,.11,.06], specular:.9, rim:.2 },
  grenadeBand: { color:[1,.6,.12], emissive:[1.6,.7,.08], emissiveStrength:1.2, unlit:true },
  health: { color:[.2,1,.66], emissive:[.2,1.8,.8], emissiveStrength:1.5, unlit:true },
  healthDark: { color:[.03,.20,.12], specular:.7 },
  grenadePack: { color:[1,.65,.14], emissive:[1.5,.75,.1], emissiveStrength:1.2, unlit:true },
  bossCore: { color:[1,1,1], emissive:[1.8,.9,1.2], emissiveStrength:1.5, unlit:true },
  beamPink: { color:[1,.15,.6], emissive:[1.6,.1,.7], emissiveStrength:1.4, unlit:true }
};

/* ============================================================
   Grid navigation
   ============================================================ */
const NAV = (() => {
  const CELL = 2;
  const MIN = -30;
  const COLS = 31;
  const N = COLS * COLS;
  const blocked = new Uint8Array(N);
  let ready = false;

  function idx(ix, iz) { return iz * COLS + ix; }
  function center(i) {
    const ix = i % COLS, iz = Math.floor(i / COLS);
    return [MIN + ix * CELL, MIN + iz * CELL];
  }
  function pointIndex(x, z) {
    return idx(clamp(Math.round((x - MIN) / CELL), 0, COLS - 1), clamp(Math.round((z - MIN) / CELL), 0, COLS - 1));
  }
  function init() {
    if (ready) return;
    ready = true;
    const expand = .72;
    for (let iz = 0; iz < COLS; iz++) {
      for (let ix = 0; ix < COLS; ix++) {
        const x = MIN + ix * CELL, z = MIN + iz * CELL;
        let b = 0;
        if (Math.abs(x) > 28.7 || Math.abs(z) > 28.7) b = 1;
        for (const c of WORLD.colliders) {
          if (c.maxY < .55) continue;
          if (x > c.minX - expand && x < c.maxX + expand && z > c.minZ - expand && z < c.maxZ + expand) {
            b = 1; break;
          }
        }
        blocked[idx(ix, iz)] = b;
      }
    }
  }
  function isBlocked(ix, iz) {
    if (ix < 0 || iz < 0 || ix >= COLS || iz >= COLS) return true;
    return blocked[idx(ix, iz)] === 1;
  }
  function nearestOpen(i) {
    if (!blocked[i]) return i;
    const ix0 = i % COLS, iz0 = Math.floor(i / COLS);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 10 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const ix = ix0 + dx, iz = iz0 + dz;
          if (ix < 0 || iz < 0 || ix >= COLS || iz >= COLS) continue;
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const j = idx(ix, iz);
          if (!blocked[j]) {
            const d = dx*dx + dz*dz;
            if (d < bd) { bd = d; best = j; }
          }
        }
      }
    }
    return best;
  }
  class Heap {
    constructor() { this.a = []; }
    push(v, f) {
      const a = this.a; a.push({ v, f });
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.a;
      if (!a.length) return null;
      const top = a[0], last = a.pop();
      if (a.length && last) {
        a[0] = last;
        let i = 0;
        while (true) {
          const l = i*2+1, r = l+1;
          let s = i;
          if (l < a.length && a[l].f < a[s].f) s = l;
          if (r < a.length && a[r].f < a[s].f) s = r;
          if (s === i) break;
          [a[s], a[i]] = [a[i], a[s]]; i = s;
        }
      }
      return top;
    }
    get size() { return this.a.length; }
  }
  function lineClear(ax, az, bx, bz) {
    const d = Math.hypot(bx-ax, bz-az);
    const steps = Math.max(1, Math.ceil(d / (CELL * .65)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = lerp(ax, bx, t), z = lerp(az, bz, t);
      const ix = Math.round((x - MIN) / CELL), iz = Math.round((z - MIN) / CELL);
      if (isBlocked(ix, iz)) return false;
    }
    return true;
  }
  const DX = [1,-1,0,0,1,1,-1,-1];
  const DZ = [0,0,1,-1,1,-1,1,-1];
  function findPath(sx, sz, tx, tz) {
    if (!ready) init();
    const start = nearestOpen(pointIndex(sx, sz));
    const goal = nearestOpen(pointIndex(tx, tz));
    if (start < 0 || goal < 0) return [];
    if (start === goal) return [[tx, tz]];
    const g = new Float32Array(N).fill(Infinity);
    const parent = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = new Heap();
    g[start] = 0;
    const goalPos = center(goal);
    const heuristic = (i) => {
      const p = center(i);
      const dx = Math.abs(p[0] - goalPos[0]) / CELL;
      const dz = Math.abs(p[1] - goalPos[1]) / CELL;
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    open.push(start, heuristic(start));
    const maxIter = 1400;
    let iter = 0;
    while (open.size && iter++ < maxIter) {
      const cur = open.pop().v;
      if (closed[cur]) continue;
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % COLS, cz = Math.floor(cur / COLS);
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (isBlocked(nx, nz)) continue;
        if (k >= 4) {
          if (isBlocked(cx + DX[k], cz) || isBlocked(cx, cz + DZ[k])) continue;
        }
        const ni = idx(nx, nz);
        if (closed[ni]) continue;
        const cost = g[cur] + (k >= 4 ? Math.SQRT2 : 1);
        if (cost < g[ni]) {
          g[ni] = cost;
          parent[ni] = cur;
          open.push(ni, cost + heuristic(ni));
        }
      }
    }
    if (parent[goal] === -1) return [];
    const cells = [];
    let c = goal;
    while (c !== start && c >= 0) {
      cells.push(c);
      c = parent[c];
    }
    cells.reverse();
    const pts = cells.map(i => {
      const p = center(i);
      return [p[0], p[1]];
    });
    if (pts.length) pts[pts.length-1] = [tx, tz];
    // string-pull the route so units do not visibly zig-zag between cells
    const out = [];
    let ax = sx, az = sz;
    let i = 0;
    while (i < pts.length) {
      let best = i;
      for (let j = pts.length - 1; j >= i; j--) {
        if (lineClear(ax, az, pts[j][0], pts[j][1])) { best = j; break; }
      }
      out.push(pts[best]);
      ax = pts[best][0]; az = pts[best][1];
      i = best + 1;
    }
    return out;
  }
  function directClear(sx, sz, tx, tz) { return lineClear(sx, sz, tx, tz); }
  return { init, findPath, directClear, pointIndex, get blocked() { return blocked; }, COLS, EVAL: null };
})();

/* ============================================================
   tiny helpers used throughout gameplay
   ============================================================ */
function localToWorld(e, off) {
  const c = Math.cos(e.yaw || 0), s = Math.sin(e.yaw || 0);
  return [e.pos[0] + off[0]*c + off[2]*s, e.pos[1] + off[1], e.pos[2] - off[0]*s + off[2]*c];
}
function shipYawTo(dx, dz) { return Math.atan2(dx, -dz); }
function lerpAngle(a, b, t) { return a + angleDelta(a, b) * t; }
