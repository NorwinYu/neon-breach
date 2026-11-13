/* ============================================================
   NEON BREACH — core math, utilities, persistence
   Original code, no external dependencies.
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const ARENA = 32;
const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.42;
const PLAYER_HEIGHT = 1.82;
const UP = [0, 1, 0];

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const sign = v => v < 0 ? -1 : 1;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const choose = arr => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const angleDelta = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const moveToward = (a, b, maxDelta) => a + clamp(b - a, -maxDelta, maxDelta);
const fmtInt = (n, len = 6) => String(Math.max(0, Math.floor(n))).padStart(len, '0');
const fmtTime = s => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/* ---------- vectors (plain arrays; readable over clever) ---------- */
const V3 = {
  make: (x = 0, y = 0, z = 0) => [x, y, z],
  copy: a => [a[0], a[1], a[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  addScaled: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ],
  len: a => Math.hypot(a[0], a[1], a[2]),
  len2: a => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
  norm: a => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  dist2D: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])
};

/* ---------- column-major 4x4 matrices ---------- */
const M4 = {
  identity(out = new Float32Array(16)) {
    out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; return out;
  },
  create() {
    const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m;
  },
  multiply(out, a, b) {
    const o = out === a || out === b ? new Float32Array(16) : out;
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    const a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for (let i = 0; i < 4; i++) {
      const b0=b[i*4],b1=b[i*4+1],b2=b[i*4+2],b3=b[i*4+3];
      o[i*4]   = a00*b0 + a10*b1 + a20*b2 + a30*b3;
      o[i*4+1] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
      o[i*4+2] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
      o[i*4+3] = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    }
    if (o !== out) out.set(o);
    return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },
  lookAt(out, eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1;
    zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },
  compose(out, pos, rot, scale) {
    const rx = rot ? rot[0] : 0, ry = rot ? rot[1] : 0, rz = rot ? rot[2] : 0;
    const sx = scale ? scale[0] : 1, sy = scale ? scale[1] : 1, sz = scale ? scale[2] : 1;
    const cx = Math.cos(rx), sxn = Math.sin(rx);
    const cy = Math.cos(ry), syn = Math.sin(ry);
    const cz = Math.cos(rz), szn = Math.sin(rz);
    // R = Ry * Rx * Rz
    const m00 = cy * cz + syn * sxn * szn;
    const m01 = -cy * szn + syn * sxn * cz;
    const m02 = syn * cx;
    const m10 = cx * szn;
    const m11 = cx * cz;
    const m12 = -sxn;
    const m20 = -syn * cz + cy * sxn * szn;
    const m21 = syn * szn + cy * sxn * cz;
    const m22 = cy * cx;
    out[0] = m00 * sx; out[1] = m10 * sx; out[2] = m20 * sx; out[3] = 0;
    out[4] = m01 * sy; out[5] = m11 * sy; out[6] = m21 * sy; out[7] = 0;
    out[8] = m02 * sz; out[9] = m12 * sz; out[10] = m22 * sz; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
    return out;
  },
  normalMat3(out, m) {
    // inverse-transpose of upper-left 3x3
    const a = m[0], b = m[4], c = m[8];
    const d = m[1], e = m[5], f = m[9];
    const g = m[2], h = m[6], i = m[10];
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    const id = det ? 1 / det : 0;
    out[0] = (e * i - f * h) * id; out[1] = (f * g - d * i) * id; out[2] = (d * h - e * g) * id;
    out[3] = (c * h - b * i) * id; out[4] = (a * i - c * g) * id; out[5] = (b * g - a * h) * id;
    out[6] = (b * f - c * e) * id; out[7] = (c * d - a * f) * id; out[8] = (a * e - b * d) * id;
    return out;
  },
  transformPoint4(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
      m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15]
    ];
  },
  transformPoint(m, v) {
    const x = v[0], y = v[1], z = v[2], w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    ];
  }
};

function cameraBasis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const forward = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  const right = [Math.cos(yaw), 0, Math.sin(yaw)];
  const up = V3.cross(right, forward);
  return { forward, right, up };
}

/* ---------- intersections ---------- */
function rayAABB(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0, tmax = 1e9;
  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, box.minY, box.maxY],
    [oz, dz, box.minZ, box.maxZ]
  ];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
    } else {
      const inv = 1 / d;
      let t1 = (lo - o) * inv;
      let t2 = (hi - o) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0.00001 ? tmin : null;
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const sq = Math.sqrt(h);
  let t = -b - sq;
  if (t < 0.00001) t = -b + sq;
  return t > 0.00001 ? t : null;
}
function circleAABB(x, z, radius, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  return (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
}

/* ---------- seeded RNG for procedural textures ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- persistence & settings ---------- */
const SAVE_KEY = 'neonBreach.v1';
const defaultSettings = { sensitivity: 1, volume: 0.7, invertY: false, muted: false, scanlines: true };
const settings = { ...defaultSettings };
let highScore = 0;
(function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d) {
      if (typeof d.highScore === 'number') highScore = d.highScore;
      if (d.settings) {
        for (const k of Object.keys(defaultSettings)) {
          if (typeof d.settings[k] === typeof defaultSettings[k]) settings[k] = d.settings[k];
        }
      }
    }
  } catch (e) { /* storage unavailable — game still works */ }
})();
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ highScore, settings }));
  } catch (e) {}
}
function setSetting(key, value) {
  settings[key] = value;
  saveGame();
}

/* ---------- DOM lookup ---------- */
const $ = id => document.getElementById(id);
const dom = {
  gl: $('glCanvas'), fx: $('fxCanvas'),
  hud: $('hud'), boot: $('bootScreen'), start: $('startScreen'), pause: $('pauseScreen'), end: $('endScreen'),
  settings: $('settingsModal'), fatal: $('fatalError'), fatalDetail: $('fatalDetail'),
  startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), retryBtn: $('retryBtn'),
  restartFromPause: $('restartFromPause'), menuFromPause: $('menuFromPause'), menuFromEnd: $('menuFromEnd'),
  soundBtn: $('soundBtn'), soundIconOn: $('soundIconOn'), soundIconOff: $('soundIconOff'),
  closeSettings: $('closeSettings'), doneSettings: $('doneSettings'),
  sensRange: $('sensRange'), sensValue: $('sensValue'), volRange: $('volRange'), volValue: $('volValue'),
  invertToggle: $('invertToggle'), scanToggle: $('scanToggle'), resetSettings: $('resetSettings'),
  menuHighScore: $('menuHighScore'), highScoreHud: $('highScoreHud'),
  waveIndex: $('waveIndex'), waveName: $('waveName'), waveSub: $('waveSub'),
  enemiesLeft: $('enemiesLeft'), waveSegments: $('waveSegments'),
  scoreValue: $('scoreValue'), comboBadge: $('comboBadge'), comboValue: $('comboValue'), comboMeter: $('comboMeter'),
  hpValue: $('hpValue'), hpBar: $('hpBar'), shieldValue: $('shieldValue'), shieldBar: $('shieldBar'),
  vitalsPanel: $('vitalsPanel'), ammoMag: $('ammoMag'), weaponMode: $('weaponMode'),
  reloadTrack: $('reloadTrack'), reloadFill: $('reloadFill'), reloadHint: $('reloadHint'),
  grenadeIcons: $('grenadeIcons'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
  killfeed: $('killfeed'), announcer: $('announcer'), annKicker: $('annKicker'), annTitle: $('annTitle'), annSub: $('annSub'),
  toast: $('toast'), damageFlash: $('damageFlash'), zoneTimer: $('zoneTimer'),
  zoneTimerValue: $('zoneTimerValue'), zoneTimerNext: $('zoneTimerNext'),
  radar: $('radar'), radarCount: $('radarCount'), bossHud: $('bossHud'), bossFill: $('bossFill'), bossPhase: $('bossPhase'),
  pauseWave: $('pauseWave'), pauseScore: $('pauseScore'), pauseKills: $('pauseKills'),
  endKicker: $('endKicker'), endTitleMain: $('endTitleMain'), endTitleOutline: $('endTitleOutline'),
  endCause: $('endCause'), endScore: $('endScore'), endRank: $('endRank'),
  endKills: $('endKills'), endHeadshots: $('endHeadshots'), endAccuracy: $('endAccuracy'),
  endWave: $('endWave'), endTime: $('endTime'), endCombo: $('endCombo'), endFoot: $('endFoot'),
  pointerHint: $('pointerHint'), screenFlash: $('screenFlash'),
  scanlinesEl: $('scanlines'), grainEl: $('grain')
};
