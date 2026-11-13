/* ============================================================
   NEON BREACH — arena, architecture, enemy + weapon models
   Everything here is modelled from primitives generated at runtime.
   ============================================================ */

const WORLD = (() => {
  const colliders = [];
  const spawnPoints = [];
  const gateFixtures = [];
  const wallLamps = [];
  const beacons = [];
  const towerData = [];
  const obstacles = [];
  const staticShadows = [];
  const playerStart = [0, 0, 24.5];
  const W = M4.create();
  let initialized = false;
  let mats = null;

  const glMat = (o) => o;

  function init() {
    if (initialized) return;
    initialized = true;
    const T = R.textures;
    mats = {
      floor: glMat({ color:[1.8,2.0,2.15], tex:T.floor, uvScale:[7,7], specular:.62, rim:.02 }),
      floorDark: glMat({ color:[.62,.74,.82], tex:T.floor, uvScale:[2.0,2.0], specular:.3 }),
      wall: glMat({ color:[1.18,1.36,1.48], tex:T.wall, uvScale:[6.5,1.5], specular:.38, rim:.08 }),
      wallDark: glMat({ color:[.62,.76,.84], tex:T.wall, uvScale:[2,2], specular:.26 }),
      crate: glMat({ color:[1.35,1.5,1.58], tex:T.crate, uvScale:[1,1], specular:.48, rim:.1 }),
      crateSmall: glMat({ color:[1.05,1.22,1.3], tex:T.crate, uvScale:[1,1], specular:.38 }),
      barrier: glMat({ color:[1.28,1.44,1.5], tex:T.barrier, uvScale:[2.3,1], specular:.38 }),
      metalDark: glMat({ color:[.15,.20,.25], specular:1.0, rim:.2 }),
      metalMid: glMat({ color:[.27,.34,.40], specular:.85, rim:.14 }),
      metalLight: glMat({ color:[.46,.55,.61], specular:1.1, rim:.1 }),
      hazard: glMat({ color:[.13,.10,.06], emissive:[.72,.46,.10], emissiveStrength:.45, specular:.3 }),
      cyan: glMat({ color:[.18,.9,1.0], emissive:[.24,1.25,1.6], emissiveStrength:1.5, unlit:true }),
      cyanSoft: glMat({ color:[.055,.44,.52], emissive:[.08,.6,.72], emissiveStrength:.8, unlit:true }),
      pink: glMat({ color:[1.0,.16,.62], emissive:[1.3,.10,.6], emissiveStrength:1.4, unlit:true }),
      pinkSoft: glMat({ color:[.5,.045,.24], emissive:[.5,.03,.24], emissiveStrength:.8, unlit:true }),
      white: glMat({ color:[.8,.94,1.0], emissive:[.8,.95,1.0], emissiveStrength:1.2, unlit:true }),
      city: glMat({ color:[.78,.94,1.08], tex:T.facade, uvScale:[3,5], unlit:true }),
      cityPurple: glMat({ color:[.88,.74,1.02], tex:T.facade, uvScale:[2,6], unlit:true }),
      cityDark: glMat({ color:[.52,.65,.78], tex:T.facade, uvScale:[4,3], unlit:true }),
      sign: glMat({ color:[1,1,1], tex:T.sign, unlit:true }),
      gateRing: glMat({ color:[.9,.15,.55], emissive:[1.2,.05,.55], emissiveStrength:1.2, specular:.4 }),
      black: glMat({ color:[.015,.022,.03], specular:.1, rim:.02 })
    };

    buildLayout();
    buildCities();
  }

  function addCollider(cx, cz, w, d, h, tag = 'solid') {
    const c = {
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: 0, maxY: h,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      tag
    };
    colliders.push(c);
    return c;
  }

  function addBoxObstacle(o) {
    obstacles.push(o);
    if (o.collide !== false) addCollider(o.x, o.z, o.w, o.d, o.h, o.type);
    staticShadows.push({ x: o.x, z: o.z, r: Math.max(o.w, o.d) * .62, a: .34 });
  }

  function buildLayout() {
    // outer walls (thick, high, collidable, raytraceable)
    const wallH = 7.2;
    addCollider(0, -32.7, 68, 3.0, wallH, 'wall');
    addCollider(0, 32.7, 68, 3.0, wallH, 'wall');
    addCollider(-32.7, 0, 3.0, 63, wallH, 'wall');
    addCollider(32.7, 0, 3.0, 63, wallH, 'wall');
    addCollider(0, 0, 3.3, 3.3, 5.7, 'reactor');
    // collision clamp margin outside as a fallback
    obstacles.push({
      x: 0, z: 0, type: 'reactor', collide: false, h: 0
    });
    obstacles.pop();

    addBoxObstacle({ type:'crate', x:-8.4, z:-8.6, w:2.5, h:2.0, d:2.5 });
    addBoxObstacle({ type:'crate', x:-10.8, z:-7.0, w:1.6, h:1.25, d:1.6 });
    addBoxObstacle({ type:'crateLow', x:-6.8, z:-6.7, w:1.4, h:.85, d:1.4 });
    addBoxObstacle({ type:'barrier', x:9.2, z:-8.1, w:5.6, h:1.16, d:.85, rot:0 });
    addBoxObstacle({ type:'barrier', x:-13.2, z:4.0, w:.85, h:1.16, d:5.6 });
    addBoxObstacle({ type:'crate', x:14.0, z:11.0, w:2.3, h:2.2, d:2.3 });
    addBoxObstacle({ type:'crateLow', x:16.4, z:12.6, w:1.45, h:.9, d:1.45 });
    addBoxObstacle({ type:'barrier', x:5.2, z:17.2, w:5.7, h:1.16, d:.85 });
    addBoxObstacle({ type:'crate', x:-7.2, z:20.1, w:2.0, h:2.25, d:2.0 });
    addBoxObstacle({ type:'pillar', x:-18.2, z:-17.4, w:2.55, h:4.8, d:2.55 });
    addBoxObstacle({ type:'pillar', x:18.2, z:16.8, w:2.55, h:4.8, d:2.55 });
    addBoxObstacle({ type:'barrier', x:21.2, z:-2.4, w:.85, h:1.16, d:5.7 });
    addBoxObstacle({ type:'barrier', x:-22.1, z:-3.2, w:.85, h:1.16, d:5.2 });
    addBoxObstacle({ type:'crate', x:4.4, z:-22.1, w:2.5, h:1.9, d:2.5 });
    addBoxObstacle({ type:'crateLow', x:-2.5, z:-22.8, w:1.35, h:.8, d:1.35 });
    addBoxObstacle({ type:'barrier', x:0.9, z:-14.0, w:3.4, h:1.16, d:.8 });
    addBoxObstacle({ type:'crate', x:20.6, z:23.5, w:1.7, h:1.45, d:1.7 });
    addBoxObstacle({ type:'crateLow', x:-21.4, z:20.3, w:1.5, h:.9, d:1.5 });

    spawnPoints.push(
      { x: 0,   z: -28.7, rot: 0 },
      { x: 21,  z: -20.5, rot: 0 },
      { x: 28.2,z: 0,     rot: Math.PI / 2 },
      { x: 20,  z: 20.5,  rot: Math.PI },
      { x: 0,   z: 28.7,  rot: Math.PI },
      { x: -20, z: 20.5,  rot: Math.PI },
      { x: -28.2,z: 0,    rot: Math.PI / 2 },
      { x: -21, z: -20.5, rot: 0 }
    );
    for (const sp of spawnPoints) gateFixtures.push({ x: sp.x, z: sp.z, rot: sp.rot });
    // wall lamps, anchored practicals for visual rhythm
    for (let i = -2; i <= 2; i++) {
      wallLamps.push({ x: i * 11, z: -31.2, rotY: 0, color: i % 2 === 0 ? 'cyan' : 'pink' });
      wallLamps.push({ x: i * 11, z: 31.2, rotY: Math.PI, color: i % 2 === 0 ? 'pink' : 'cyan' });
      wallLamps.push({ x: -31.2, z: i * 11, rotY: Math.PI / 2, color: i % 2 === 0 ? 'cyan' : 'pink' });
      wallLamps.push({ x: 31.2, z: i * 11, rotY: -Math.PI / 2, color: i % 2 === 0 ? 'pink' : 'cyan' });
    }
  }

  function buildCities() {
    const rng = mulberry32(99173);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rand(-.09, .09);
      const radius = 43 + rng() * 44;
      const width = 4 + rng() * 9;
      const depth = 4 + rng() * 10;
      const height = 9 + rng() * 35;
      towerData.push({
        x: Math.cos(a) * radius,
        z: Math.sin(a) * radius,
        w: width, d: depth, h: height,
        tint: rng(),
        antenna: rng() > .55,
        gap: Math.floor(rng() * 4)
      });
    }
    // beacon points for additive bloom above the skyline
    for (let i = 0; i < towerData.length; i += 4) {
      const t = towerData[i];
      beacons.push({ pos: [t.x, t.h + 1.8, t.z], color: t.tint > .5 ? [1, .18, .58] : [.25, .9, 1], size: 1.6 });
    }
  }

  function drawBox(x, y, z, sx, sy, sz, mat, rot = [0,0,0]) {
    M4.compose(W, [x,y,z], rot, [sx,sy,sz]);
    R.drawMesh('box', W, mat);
  }
  function drawSphere(x, y, z, size, mat, syScale = 1) {
    M4.compose(W, [x,y,z], [0,0,0], [size, size * syScale, size]);
    R.drawMesh('sphere', W, mat);
  }
  function drawCylinder(x, y, z, radius, height, mat, rot = [0,0,0]) {
    M4.compose(W, [x,y,z], rot, [radius * 2, height, radius * 2]);
    R.drawMesh('cylinder', W, mat);
  }
  function drawTorus(x, y, z, radius, mat, rot = [0,0,0], yScale = 1) {
    const s = radius / .515;
    M4.compose(W, [x,y,z], rot, [s, s*yScale, s]);
    R.drawMesh('torus', W, mat);
  }
  function beamMatrix(out, a, b, radius) {
    const dir = V3.norm(V3.sub(b, a));
    const helper = Math.abs(dir[1]) < .92 ? UP : [1,0,0];
    const xAxis = V3.norm(V3.cross(dir, helper));
    const zAxis = V3.norm(V3.cross(xAxis, dir));
    const len = V3.dist(a, b);
    const mid = V3.lerp(a, b, .5);
    out[0] = xAxis[0]*radius*2; out[1] = xAxis[1]*radius*2; out[2] = xAxis[2]*radius*2; out[3] = 0;
    out[4] = dir[0]*len; out[5] = dir[1]*len; out[6] = dir[2]*len; out[7] = 0;
    out[8] = zAxis[0]*radius*2; out[9] = zAxis[1]*radius*2; out[10] = zAxis[2]*radius*2; out[11] = 0;
    out[12] = mid[0]; out[13] = mid[1]; out[14] = mid[2]; out[15] = 1;
    return out;
  }
  function drawBeam(a, b, radius, mat) {
    beamMatrix(W, a, b, radius);
    R.drawMesh('cylinder', W, mat);
  }

  /* ---------------- static architecture ---------------- */
  function drawOpaque(time) {
    const T = time || 0;
    // floor and a darker inner service border
    M4.compose(W, [0,0,0], [0,0,0], [64,1,64]);
    R.drawMesh('plane', W, mats.floor);
    drawBox(0, .012, 0, 58.5, .018, 58.5, mats.floorDark);

    // outer walls
    drawBox(0, 3.6, -32.1, 64, 7.2, 1.8, mats.wall);
    drawBox(0, 3.6, 32.1, 64, 7.2, 1.8, mats.wall);
    drawBox(-32.1, 3.6, 0, 1.8, 7.2, 64, mats.wall);
    drawBox(32.1, 3.6, 0, 1.8, 7.2, 64, mats.wall);

    // wall panel rhythm, buttresses and trim
    for (let i = -3; i <= 3; i++) {
      const x = i * 9.0;
      drawBox(x, 2.1, -31.12, .55, 4.2, .45, mats.wallDark);
      drawBox(x, 2.1, 31.12, .55, 4.2, .45, mats.wallDark);
      drawBox(-31.12, 2.1, x, .45, 4.2, .55, mats.wallDark);
      drawBox(31.12, 2.1, x, .45, 4.2, .55, mats.wallDark);
    }
    for (const y of [5.92, .28]) {
      drawBox(0, y, -31.16, 63, .08, .12, y > 1 ? mats.cyanSoft : mats.pinkSoft);
      drawBox(0, y, 31.16, 63, .08, .12, y > 1 ? mats.cyanSoft : mats.pinkSoft);
      drawBox(-31.16, y, 0, .12, .08, 63, y > 1 ? mats.pinkSoft : mats.cyanSoft);
      drawBox(31.16, y, 0, .12, .08, 63, y > 1 ? mats.pinkSoft : mats.cyanSoft);
    }
    // wall lamp housings
    for (const lamp of wallLamps) {
      const mat = lamp.color === 'cyan' ? mats.cyan : mats.pink;
      if (lamp.rotY === 0) {
        drawBox(lamp.x, 4.85, lamp.z + .2, .9, .16, .36, mats.metalDark);
        drawBox(lamp.x, 4.79, lamp.z + .38, .58, .05, .07, mat);
      } else if (Math.abs(lamp.rotY) === Math.PI) {
        drawBox(lamp.x, 4.85, lamp.z - .2, .9, .16, .36, mats.metalDark);
        drawBox(lamp.x, 4.79, lamp.z - .38, .58, .05, .07, mat);
      } else if (lamp.rotY > 0) {
        drawBox(lamp.x + .2, 4.85, lamp.z, .36, .16, .9, mats.metalDark);
        drawBox(lamp.x + .38, 4.79, lamp.z, .07, .05, .58, mat);
      } else {
        drawBox(lamp.x - .2, 4.85, lamp.z, .36, .16, .9, mats.metalDark);
        drawBox(lamp.x - .38, 4.79, lamp.z, .07, .05, .58, mat);
      }
    }

    // wall signage
    M4.compose(W, [0, 3.35, -31.16], [0,0,0], [13.4, 5.2, 1]);
    R.drawMesh('quad', W, mats.sign);
    M4.compose(W, [31.16, 3.35, 0], [0, -Math.PI/2, 0], [11.4, 4.4, 1]);
    R.drawMesh('quad', W, mats.sign);
    M4.compose(W, [-31.16, 3.35, 0], [0, Math.PI/2, 0], [8.2, 3.2, 1]);
    R.drawMesh('quad', W, mats.sign);

    // central reactor
    drawBox(0, .23, 0, 3.8, .46, 3.8, mats.metalDark);
    drawBox(0, 1.0, 0, 2.7, 1.2, 2.7, mats.wallDark);
    drawCylinder(0, 3.05, 0, 1.32, 3.0, mats.metalMid);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const x = Math.cos(a) * 1.18, z = Math.sin(a) * 1.18;
      drawBox(x, 3.05, z, .16, 3.1, .16, mats.metalLight);
      drawBox(x * 1.06, 2.7, z * 1.06, .07, 2.4, .07, i % 2 ? mats.pink : mats.cyan);
    }
    drawCylinder(0, 3.18, 0, .82, 2.4, mats.black);
    drawTorus(0, 2.7, 0, 1.52, mats.cyan, [Math.PI/2, 0, 0]);
    drawTorus(0, 3.9, 0, 1.52, mats.pink, [Math.PI/2, 0, T * .18]);
    drawTorus(0, 4.9, 0, 1.05, mats.cyan, [Math.PI/2, 0, -T * .28]);
    // coolant coils and mechanical collars
    for (const y of [2.15, 4.35]) {
      drawTorus(0, y, 0, 1.38, mats.metalLight, [Math.PI/2, 0, 0]);
      drawTorus(0, y + .08, 0, 1.42, mats.cyanSoft, [Math.PI/2, 0, 0]);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const x = Math.cos(a) * 1.36, z = Math.sin(a) * 1.36;
      drawBox(x, 3.55, z, .055, 1.6, .055, i % 3 === 0 ? mats.pink : mats.cyanSoft, [0, -a, 0]);
    }
    // base clamps and hazard blocks
    for (let i = 0; i < 4; i++) {
      const a = Math.PI/4 + i*Math.PI/2;
      const x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55;
      drawBox(x, .64, z, .52, .55, .48, mats.metalMid, [0, -a, 0]);
      drawBox(x, .73, z, .38, .16, .1, mats.hazard, [0, -a, 0]);
      drawBeam([x, .92, z], [Math.cos(a)*1.12, 2.25, Math.sin(a)*1.12], .045, mats.metalDark);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + T * .01;
      const x = Math.cos(a) * 2.95, z = Math.sin(a) * 2.95;
      drawBox(x, .085, z, .38, .035, .12, i % 2 ? mats.pink : mats.cyan, [0, -a, 0]);
    }
    // hazard stencil on the plinth
    for (const [x,z,ry] of [[0,1.92,0],[1.92,0,Math.PI/2],[0,-1.92,0],[-1.92,0,Math.PI/2]]) {
      drawBox(x, .38, z, 1.15, .13, .035, mats.hazard, [0,ry,0]);
    }
    const pulse = 1 + Math.sin(T * 2.2) * .05;
    drawSphere(0, 5.32, 0, 1.02 * pulse, mats.cyan);
    drawSphere(0, 5.32, 0, .62 * pulse, mats.white);
    drawCylinder(0, 6.0, 0, .36, .9, mats.metalDark);
    drawTorus(0, 6.7, 0, .5, mats.pinkSoft, [0, T * .35, 0]);
    // four underside fins
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const x = Math.cos(a) * 2.05, z = Math.sin(a) * 2.05;
      drawBox(x, .42, z, 1.1, .22, .45, mats.metalLight, [0, -a, 0]);
      drawBox(x * .96, .57, z * .96, .7, .08, .18, i % 2 ? mats.pink : mats.cyan, [0, -a, 0]);
    }

    // obstacles
    for (const o of obstacles) drawObstacle(o, time);
    // perimeter details
    drawPerimeterDetails(time);

    // tight containment rings hugging the reactor crown
    drawTorus(0, 6.8, 0, 1.28, mats.cyanSoft, [Math.PI / 2 + .34, T * .12, .08], 1);
    drawTorus(0, 6.55, 0, .92, mats.pinkSoft, [Math.PI / 2 - .22, -T * .08, -.08], 1);
    // skyline
    for (const t of towerData) {
      const mat = t.tint < .18 ? mats.cityPurple : (t.tint < .45 ? mats.cityDark : mats.city);
      drawBox(t.x, t.h / 2, t.z, t.w, t.h, t.d, mat, [0, t.gap * .08, 0]);
      drawBox(t.x, t.h + .35, t.z, t.w * .72, .7, t.d * .72, mats.metalDark, [0, t.gap * .08, 0]);
      if (t.antenna) {
        drawCylinder(t.x, t.h + 2.2, t.z, .07, 3.4, mats.metalMid);
        drawSphere(t.x, t.h + 3.95, t.z, .25, mats.pink);
      }
      if (t.tint > .7) drawBox(t.x, t.h * .72, t.z - t.d/2 - .03, .11, t.h * .4, .06, mats.cyanSoft);
    }
  }

  function drawObstacle(o, time) {
    drawBox(o.x, .025, o.z, o.w + .5, .05, o.d + .5, mats.metalDark);
    if (o.type === 'crate' || o.type === 'crateLow') {
      const m = o.type === 'crateLow' ? mats.crateSmall : mats.crate;
      drawBox(o.x, o.h/2, o.z, o.w, o.h, o.d, m);
      // structural top rail and corner caps
      drawBox(o.x, o.h + .035, o.z, o.w + .04, .07, o.d + .04, mats.metalDark);
      const cap = .12;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        drawBox(o.x + sx*(o.w/2 - .08), o.h*.5, o.z + sz*(o.d/2 - .08), .1, o.h*.86, .1, mats.metalLight);
      }
      drawBox(o.x, o.h * .68, o.z + o.d/2 + .012, o.w * .72, .1, .03, mats.hazard);
      if (o.h > 1.5) drawBox(o.x, o.h * .3, o.z + o.d/2 + .012, o.w * .5, .06, .03, mats.pinkSoft);
      // low guide light
      drawBox(o.x, .11, o.z + o.d/2 + .03, o.w*.32, .035, .035, mats.cyanSoft);
    } else if (o.type === 'barrier') {
      drawBox(o.x, o.h/2, o.z, o.w, o.h, o.d, mats.barrier);
      drawBox(o.x, o.h + .03, o.z, o.w + .05, .06, o.d + .05, mats.metalDark);
      // top energy strip along long axis
      if (o.w > o.d) drawBox(o.x, o.h + .08, o.z, o.w * .9, .03, .06, mats.cyanSoft);
      else drawBox(o.x, o.h + .08, o.z, .06, .03, o.d * .9, mats.cyanSoft);
      // feet
      const feet = o.w > o.d ? [-.38, .38] : [-.38, .38];
      for (const f of feet) {
        if (o.w > o.d) drawBox(o.x + f*o.w, .06, o.z, .28, .12, o.d*1.25, mats.metalDark);
        else drawBox(o.x, .06, o.z + f*o.d, o.w*1.25, .12, .28, mats.metalDark);
      }
    } else if (o.type === 'pillar') {
      drawCylinder(o.x, o.h/2, o.z, o.w*.42, o.h, mats.wall, [0,0,0]);
      drawCylinder(o.x, .2, o.z, o.w*.58, .4, mats.metalDark);
      for (let i = 0; i < 4; i++) {
        const y = .8 + i * 1.0;
        drawBox(o.x, y, o.z + o.w*.38, o.w*.7, .06, .07, i%2 ? mats.pinkSoft : mats.cyanSoft);
      }
      drawTorus(o.x, o.h*.82, o.z, o.w*.53, mats.cyanSoft, [0,0,0]);
    }
  }

  function drawPerimeterDetails(time) {
    // low cable conduits along side walls
    drawBeam([-30.6, .33, -31.0], [30.6, .33, -31.0], .075, mats.metalDark);
    drawBeam([-30.6, .48, 31.0], [30.6, .48, 31.0], .06, mats.metalDark);
    drawBeam([-30.98, .28, -27], [-30.98, .28, 27], .07, mats.metalDark);
    drawBeam([30.98, .28, -27], [30.98, .28, 27], .07, mats.metalDark);
    // access terminals near the walls, alternating sides
    const terminals = [
      [-27, -28, 0], [27, -21, Math.PI], [-24, 24, 0], [25, 24, Math.PI]
    ];
    for (const [x,z,ry] of terminals) {
      drawBox(x, .75, z, 1.1, 1.5, .55, mats.metalDark, [0,ry,0]);
      drawBox(x, 1.1, z + (z < 0 ? .29 : -.29), .58, .38, .03, mats.cyanSoft, [0,ry,0]);
      drawBox(x, .36, z, .8, .08, .65, mats.metalLight, [0,ry,0]);
    }
    // floor runway markers toward reactor
    for (const z of [-3.7, 3.7]) {
      for (let i = 0; i < 7; i++) {
        const x = -25 + i * 4.4;
        drawBox(x, .026, z, 1.3, .018, .09, mats.cyanSoft);
        drawBox(x + .7, .024, z, .25, .018, .14, mats.hazard);
      }
    }
    // long perimeter guide lines keep the floor legible in the dark
    for (const x of [-11.5, 11.5]) {
      drawBox(x, .022, 0, .045, .014, 47, mats.cyanSoft);
    }
    for (const z of [-11.5, 11.5]) {
      drawBox(0, .022, z, 47, .014, .045, mats.cyanSoft);
    }
    for (const x of [-23, 23]) for (const z of [-23, 23]) {
      drawBox(x, .026, z, 2.2, .02, .06, mats.hazard);
      drawBox(x, .026, z, .06, .02, 2.2, mats.hazard);
    }
    // service covers and vents around the combat floor
    const covers = [[-4.2, 8.6, 1.7], [7.8, 4.2, 1.2], [-14.5, -10, 2.1], [13.2, -13.4, 1.4], [2.6, -8.2, .9]];
    for (const [x,z,size] of covers) {
      drawBox(x, .022, z, size, .018, size, mats.metalDark);
      for (let i = -2; i <= 2; i++) drawBox(x, .033, z + i*.12*size, size*.8, .008, .028, mats.metalLight);
    }
    // hazard triangle corners
    for (let i = 0; i < 4; i++) {
      const a = Math.PI/4 + i*Math.PI/2;
      const x = Math.cos(a) * 15.5, z = Math.sin(a) * 15.5;
      drawBox(x, .024, z, 1.4, .015, .08, mats.hazard, [0, -a, 0]);
      drawBox(x, .024, z, .08, .015, 1.4, mats.hazard, [0, -a, 0]);
    }
    // spawn gates
    for (const g of gateFixtures) {
      const side = g.rot >= Math.PI - .01 && g.rot <= Math.PI + .01 ? -1 : 1;
      for (const off of [-1.9, 1.9]) {
        const px = g.x + Math.cos(g.rot) * 0 + Math.sin(g.rot + Math.PI/2) * off;
        const pz = g.z + Math.cos(g.rot + Math.PI/2) * off;
        drawBox(px, 1.3, pz, .26, 2.6, .26, mats.metalDark, [0,g.rot,0]);
        drawBox(px, 2.35, pz, .1, .32, .1, mats.pink);
      }
      drawBox(g.x, 2.55, g.z, 4.1, .18, .23, mats.metalDark, [0,g.rot,0]);
      drawBox(g.x, 2.46, g.z + (g.rot === 0 ? .12 : 0), 3.55, .05, .06, mats.pink, [0,g.rot,0]);
    }
  }

  function drawGlow(time) {
    const T = time || 0;
    // contact shadows first (normal blend, then additive resumes)
    for (const s of staticShadows) R.drawShadow(s.x, s.z, s.r, s.a);
    for (const o of obstacles) {
      if (o.type === 'pillar') R.drawShadow(o.x, o.z, o.w * .7, .42);
    }
    // gate floor rings and portal halos
    for (const g of gateFixtures) {
      const pulse = .6 + .22 * Math.sin(T * 2.4 + g.x * .3);
      R.drawGroundRing(g.x, g.z, 2.15, [1.0, .11, .52], pulse * .42, T * .12);
      R.drawGroundRing(g.x, g.z, 1.15, [1.0, .3, .72], pulse * .19, -T * .09);
      R.drawGroundRing(g.x, g.z, 2.35, [1.0, .2, .6], .12, 0, R.textures.glow);
      R.drawGlowWorld([g.x, 1.7, g.z], 1.1, [1.0, .16, .56], .14, { tex: R.textures.glow });
    }
    // central reactor bloom
    const p = 1 + .08 * Math.sin(T * 2.1);
    R.drawGlowWorld([0, 5.35, 0], 7.6 * p, [.22, 1.2, 1.55], 1.1, { tex: R.textures.glow });
    R.drawGlowWorld([0, 5.35, 0], 3.1 * p, [.8, 1.8, 2.0], 1.4, { tex: R.textures.glow });
    R.drawGlowWorld([0, 6.7, 0], 3.0, [1.1, .18, .7], .35, { tex: R.textures.ring, roll: T * .4 });
    R.drawGroundRing(0, 0, 8.4, [.2, .9, 1.0], .24 + .05*Math.sin(T*1.4), T*.03);
    R.drawGroundRing(0, 0, 6.2, [1.0, .17, .58], .15, -T*.02);
    R.drawGroundRing(0, 0, 4.5, [.45,.55,.7], .08, 0, R.textures.glow);
    for (let i = 0; i < 5; i++) {
      const y = 1.2 + i * .75 + Math.sin(T * 2.3 + i) * .12;
      R.drawGlowWorld([Math.sin(T*.6+i)*.28, y, Math.cos(T*.5+i)*.28], 1.2 - i*.13, [.24,.9,1.1], .22);
    }
    // wall lamp coronas
    for (const lamp of wallLamps) {
      const col = lamp.color === 'cyan' ? [.3,1.25,1.5] : [1.3,.2,.66];
      const inward = lamp.rotY === 0 ? [lamp.x, 4.75, lamp.z + .5] :
        (Math.abs(lamp.rotY) === Math.PI ? [lamp.x, 4.75, lamp.z - .5] :
        (lamp.rotY > 0 ? [lamp.x + .5, 4.75, lamp.z] : [lamp.x - .5, 4.75, lamp.z]));
      R.drawGlowWorld(inward, 1.3, col, .45);
    }
    // containment halo glints
    for (let i = 0; i < 4; i++) {
      const a = T * .2 + i * Math.PI / 2;
      R.drawGlowWorld([Math.cos(a) * 1.28, 6.8 + Math.sin(a*1.7)*.18, Math.sin(a) * 1.28], .38, [.25,.9,1.05], .16);
    }
    for (const b of beacons) R.drawGlowWorld(b.pos, b.size, b.color, .4);
    // reactor ceiling reflection
    R.drawGlowWorld([0, 17.5, 0], 11, [.1,.7,.85], .12);
  }

  const lights = [
    { pos:[0, 5.4, 0], color:[.22, 1.05, 1.28], range: 40, intensity: 2.5 },
    { pos:[0, 3.4, -28], color:[1.2,.18,.62], range: 32, intensity: 1.45 },
    { pos:[28, 3.4, 0], color:[.22,.95,1.15], range: 30, intensity: 1.15 },
    { pos:[-28, 3.4, 0], color:[1.1,.14,.58], range: 30, intensity: 1.05 },
    { pos:[0, 3.4, 28], color:[1.15,.12,.54], range: 30, intensity: 1.2 }
  ];

  function raycast(ox, oy, oz, dx, dy, dz) {
    let best = Infinity;
    let normal = [0, 1, 0];
    let tag = 'floor';
    for (const c of colliders) {
      const hit = rayAABB(ox, oy, oz, dx, dy, dz, c);
      if (hit !== null && hit < best) {
        const px = ox + dx*hit, py = oy + dy*hit, pz = oz + dz*hit;
        const eps = 1e-3;
        if (Math.abs(px - c.minX) < eps) normal = [-1,0,0];
        else if (Math.abs(px - c.maxX) < eps) normal = [1,0,0];
        else if (Math.abs(py - c.minY) < eps) normal = [0,-1,0];
        else if (Math.abs(py - c.maxY) < eps) normal = [0,1,0];
        else if (Math.abs(pz - c.minZ) < eps) normal = [0,0,-1];
        else if (Math.abs(pz - c.maxZ) < eps) normal = [0,0,1];
        best = hit; tag = c.tag;
      }
    }
    if (dy < -1e-5) {
      const t = -oy / dy;
      if (t > 0 && t < best) {
        best = t; normal = [0,1,0]; tag = 'floor';
      }
    }
    if (!isFinite(best)) return null;
    return { t: best, point: [ox + dx*best, oy + dy*best, oz + dz*best], normal, tag };
  }

  return {
    init, drawOpaque, drawGlow, raycast, lights,
    get colliders() { return colliders; },
    get spawnPoints() { return spawnPoints; },
    get playerStart() { return playerStart; },
    get bounds() { return 31.1; },
    get obstacles() { return obstacles; }
  };
})();

/* ============================================================
   Enemy models — built from the shared primitives.
   ============================================================ */
const MODELS = (() => {
  const W = M4.create(), LOCAL = M4.create(), GROUP = M4.create();
  let init = false;
  let mat = null;
  function setup() {
    if (init) return; init = true;
    mat = {
      shell: { color:[.14,.16,.185], specular:1.25, rim:.25 },
      shell2: { color:[.22,.25,.29], specular:1.1, rim:.2 },
      shell3: { color:[.30,.34,.38], specular:.95, rim:.18 },
      joint: { color:[.035,.04,.05], specular:.7, rim:.1 },
      orange: { color:[1,.38,.08], emissive:[1.5,.48,.05], emissiveStrength:1.15, unlit:true },
      orangeGlow: { color:[.7,.2,.025], emissive:[.85,.25,.02], emissiveStrength:.8, unlit:true },
      red: { color:[1,.06,.16], emissive:[1.8,.09,.18], emissiveStrength:1.4, unlit:true },
      cyan: { color:[.1,.9,1], emissive:[.24,1.4,1.6], emissiveStrength:1.5, unlit:true },
      pink: { color:[1,.13,.55], emissive:[1.5,.08,.6], emissiveStrength:1.2, unlit:true },
      white: { color:[.9,1,1], emissive:[1.2,1.8,2], emissiveStrength:1.7, unlit:true },
      boss: { color:[.16,.13,.16], specular:1.3, rim:.3 },
      bossAccent: { color:[.31,.20,.23], specular:.9, rim:.2 }
    };
  }
  function part(mesh, pos, scale, material, rot = [0,0,0]) {
    M4.compose(LOCAL, pos, rot, scale);
    M4.multiply(W, GROUP, LOCAL);
    R.drawMesh(mesh, W, material);
  }
  function flash(material, hitFlash, isWeak = false) {
    if (hitFlash <= 0) return material;
    const f = clamp(hitFlash * 8, 0, .85);
    const c = material.color || [0,0,0];
    const e = material.emissive || [0,0,0];
    return {
      color: [lerp(c[0], 1.2, f), lerp(c[1], 1.2, f), lerp(c[2], 1.2, f)],
      emissive: [lerp(e[0], isWeak ? 1.8 : 1.3, f), lerp(e[1], isWeak ? .3 : 1.3, f), lerp(e[2], isWeak ? .5 : 1.3, f)],
      emissiveStrength: (material.emissiveStrength || 0) + f,
      unlit: material.unlit, specular: material.specular, rim: material.rim
    };
  }

  function sentinel(e, time) {
    setup();
    const t = e.animTime || time || 0;
    const rootY = e.pos[1];
    const yaw = e.yaw;
    const flashM = flash(mat.shell, e.hitFlash);
    // central armoured pod, double pyramid form
    part('sphere', [0, 0, 0], [1.05, .62, 1.05], flashM, [0,0,0]);
    part('cylinder', [0, -.05, 0], [.45, .24, .45], mat.joint, [0,0,0]);
    part('sphere', [0, .05, -.36], [.38, .24, .24], mat.orange, [0,0,0]);
    part('box', [.21, .08, -.14], [.08, .03, .24], mat.cyan);
    part('box', [-.21, .08, -.14], [.08, .03, .24], mat.cyan);
    // rotating equator ring
    part('torus', [0, 0, 0], [1.04,1.04,1.04], mat.orangeGlow, [Math.PI/2, 0, t * 1.2]);
    part('torus', [0, .1, 0], [.95,.95,.95], mat.joint, [Math.PI/2, 0, -t * .8]);
    // four thruster arms
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const ca = Math.cos(a), sa = Math.sin(a);
      part('box', [ca*.63, .03, sa*.63], [.85, .12, .18], mat.shell2, [0, -a, .1]);
      part('box', [ca*.94, -.08, sa*.94], [.22, .16, .22], mat.joint, [0, -a, 0]);
      part('sphere', [ca*.94, -.17, sa*.94], [.18,.1,.18], mat.orange, [0,0,0]);
    }
    // small dorsal sensor
    part('box', [0, .35, 0], [.22, .18, .32], mat.shell3, [0, yaw, 0]);
    part('sphere', [0, .46, -.05], [.08,.08,.08], mat.white);
    // antenna
    part('box', [.15, .36, .1], [.035, .35, .035], mat.joint, [0,0,.18]);
  }

  function weaver(e, time) {
    setup();
    const t = e.animTime || time || 0;
    // small aggressive spider drone
    part('sphere', [0,0,0], [.72,.5,.72], flash(mat.shell2, e.hitFlash));
    part('sphere', [0,.03,-.22], [.25,.2,.22], mat.pink);
    part('torus', [0,-.02,0], [.94,.94,.94], mat.pink, [Math.PI/2,0,t*2]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI/2 + Math.PI/4;
      const ca = Math.cos(a), sa = Math.sin(a);
      part('box', [ca*.58, -.05, sa*.58], [.7,.07,.1], mat.shell3, [0,-a,.28]);
      part('box', [ca*.88, -.16, sa*.88], [.07,.4,.07], mat.joint, [0,-a,-.5]);
      part('sphere', [ca*1.05, -.34, sa*1.05], [.1,.1,.1], mat.pink);
    }
  }

  function brute(e, time) {
    setup();
    const t = e.animTime || time || 0;
    const stride = Math.sin(t * 6) * .5;
    const F = flash(mat.shell, e.hitFlash);
    // heavy walker: hips / legs / armored torso / cannons
    part('box', [0, -.1, 0], [1.8, .55, 1.3], mat.shell2);
    for (const side of [-1, 1]) {
      part('box', [side*.62, -.38, 0], [.48, .9, .58], mat.shell, [0,0,side*stride*.12]);
      part('box', [side*.62, -.08, 0], [.6,.42,.6], mat.joint, [0,0,0]);
      part('box', [side*.62, -.82, stride*.18], [.32, .7, .34], mat.shell2, [stride*.15,0,side*.08]);
      part('box', [side*.62, -1.14, stride*.25 + .18], [.5, .15, .72], mat.shell3);
      part('sphere', [side*.62, -.36, .34], [.11,.11,.11], mat.orange);
    }
    // torso
    part('box', [0, .55, 0], [1.55, 1.0, 1.12], F);
    part('box', [0, .65, -.6], [.95,.6,.18], mat.shell3);
    part('box', [0, .45, -.73], [.45,.24,.05], mat.orange);
    part('box', [0, .1, 0], [1.2,.28,.9], mat.shell2);
    // shoulders + arm cannons
    for (const side of [-1,1]) {
      part('box', [side*.95, .9, 0], [.65,.42,.72], mat.shell3, [0,0,side*.1]);
      part('box', [side*1.06, .55, -.08], [.4,.4,.4], mat.joint);
      part('cylinder', [side*1.06, .22, -.48], [.25,.55,.25], mat.shell2, [Math.PI/2,0,0]);
      part('torus', [side*1.06, .08, -.62], [.28,.28,.28], mat.orange, [Math.PI/2,0,0]);
      part('sphere', [side*1.06, .2, -.78], [.1,.1,.1], mat.orange);
    }
    // head under armored brow
    part('box', [0, .93, -.2], [.52,.38,.48], mat.shell);
    part('box', [0, 1.02, -.44], [.45,.12,.06], mat.orange);
    part('box', [0, 1.15, -.04], [.72,.12,.62], mat.shell3);
    // reactor belly
    part('sphere', [0, .31, -.5], [.48,.34,.18], mat.orange);
    part('torus', [0, .31, -.48], [.7,.7,.7], mat.orangeGlow, [Math.PI/2,0,0]);
  }

  function turret(e, time) {
    setup();
    const t = e.animTime || time || 0;
    // fixed emplacement built around a tripod base
    part('cylinder', [0, -.2, 0], [1.6, .3, 1.6], mat.shell3);
    for (let i=0;i<3;i++){
      const a=i*Math.PI*2/3;
      part('box',[Math.cos(a)*.62,-.45,Math.sin(a)*.62],[.22,.6,.22],mat.joint,[0,-a,.18]);
      part('box',[Math.cos(a)*.78,-.8,Math.sin(a)*.78],[.4,.1,.4],mat.shell2,[0,-a,0]);
    }
    part('cylinder', [0,.18,0], [.8, .6, .8], flash(mat.shell, e.hitFlash));
    part('sphere', [0,.58,0], [.62,.45,.62], flash(mat.shell2, e.hitFlash));
    part('box', [0,.62,-.34], [.32,.18,.12], mat.red);
    for (const sx of [-1,1]) {
      part('cylinder', [sx*.3,.55,-.55], [.15,.8,.15], mat.joint, [Math.PI/2,0,0]);
      part('torus', [sx*.3,.55,-.9], [.2,.2,.2], mat.red, [Math.PI/2,0,0]);
    }
    part('torus', [0,.2,0], [1.0,1.0,1.0], mat.red, [Math.PI/2,0,t*.6]);
  }

  function boss(e, time) {
    setup();
    const t = e.animTime || time || 0;
    const stride = Math.sin(t * 1.8) * .4;
    const F = flash(mat.boss, e.hitFlash, true);
    // hover carriage / underslung engine ring
    part('torus', [0, -1.08, 0], [4.7,4.7,4.7], mat.bossAccent, [0, t*.05, 0]);
    part('torus', [0, -1.05, 0], [3.5,3.5,3.5], mat.pink, [0, -t*.08, 0]);
    for (const side of [-1,1]) {
      for (const fz of [-1,0]) {
        part('box', [side*1.45, -1.13, fz*.8 + .05], [1.0,.22,1.1], mat.boss);
        part('sphere', [side*1.45, -1.28, fz*.8 + .12], [.38,.18,.38], mat.pink);
        part('box', [side*1.45, -1.15, fz*.8 + .5], [.5,.08,.14], mat.orange);
      }
    }
    // main torso — broad armoured chest with layered plates
    part('sphere', [0, .55, 0], [2.5,1.55,1.85], F);
    part('box', [-.72, .62, -.82], [1.0,1.0,.38], mat.bossAccent, [.08,0,.12]);
    part('box', [.72, .62, -.82], [1.0,1.0,.38], mat.bossAccent, [-.08,0,-.12]);
    part('box', [0, .93, -.85], [1.2,.25,.16], mat.shell3);
    // exposed white reactor core, the weak point
    part('sphere', [0, .55, -1.12], [.7,.7,.4], mat.white);
    part('torus', [0, .55, -.98], [1.25,1.25,1.25], mat.pink, [Math.PI/2, t*.38, 0]);
    part('torus', [0, .55, -1.03], [1.0,1.0,1.0], mat.orange, [Math.PI/2, -t*.2, 0]);
    // head and mask
    part('box', [0, 1.45, -.48], [.85,.62,.72], mat.bossAccent);
    part('box', [0, 1.55, -.82], [.58,.16,.16], mat.red);
    part('box', [0, 1.74, -.42], [.42,.34,.58], mat.boss);
    for (const side of [-1,1]) {
      part('box', [side*.34, 1.77, -.3], [.12,.85,.16], mat.bossAccent, [0,0,side*.42]);
      part('sphere', [side*.47, 2.16, -.3], [.12,.12,.12], mat.pink);
    }
    // shoulder mantles and heavy cannons
    for (const side of [-1,1]) {
      part('box', [side*1.7, 1.0, .02], [1.15,.62,1.3], mat.bossAccent, [0,0,side*.06]);
      part('box', [side*2.05, .62, -.15], [.82,.9,.86], mat.boss);
      part('box', [side*2.05, .88, -.1], [.6,.14,.92], mat.shell3);
      part('cylinder', [side*2.16, .32, -.72], [.42,.9,.42], mat.bossAccent, [Math.PI/2,0,0]);
      part('torus', [side*2.16, .32, -1.15], [.56,.56,.56], mat.pink, [Math.PI/2,0,0]);
      part('sphere', [side*2.16, .25, -1.2], [.14,.14,.14], mat.white);
      // hanging arm assemblies / energy flails
      part('box', [side*2.25, -.1, .12], [.55,.65,.6], mat.boss, [0,0,side*.06]);
      part('box', [side*2.32, -.58, .22], [.42,.55,.48], mat.bossAccent, [stride*.08,0,side*.08]);
      part('sphere', [side*2.32, -.96, .28], [.3,.3,.3], mat.pink);
      for (let i=0;i<3;i++) part('box', [side*(2.14+i*.15), -1.15, .28], [.09,.35,.09], mat.orange, [0,0,side*(.2+i*.15)]);
    }
    // dorsal fins / crown machinery
    for (const side of [-1,1]) {
      part('box', [side*1.45, 1.7, .5], [1.55,.16,.9], mat.bossAccent, [0, side*.1, side*.24]);
      part('box', [side*2.1, 1.95, .52], [.55,.14,.5], mat.boss, [0,side*.12,side*.3]);
      part('sphere', [side*2.32, 2.0, .6], [.1,.1,.1], mat.pink);
    }
    // slow crown halo above the head
    part('torus', [0, 2.36, -.08], [2.15,2.15,2.15], mat.pink, [Math.PI/2 + .16, -t*.1, .06]);
    part('torus', [0, 2.42, -.08], [1.58,1.58,1.58], mat.shell3, [Math.PI/2 + .16, -t*.1, .06]);
    // rear thruster bank
    for (let i=0;i<3;i++) {
      part('cylinder', [(i-1)*.58, .25, .92], [.18,.6,.18], mat.joint, [Math.PI/2,0,0]);
      part('sphere', [(i-1)*.58, .25, 1.25], [.13,.13,.13], mat.orange);
    }
    // lower claws
    for (const side of [-1,1]) {
      part('box', [side*.62, -.65, .2], [.2,.85,.24], mat.shell3, [0,0,side*.18]);
      part('box', [side*.78, -1.02, .28], [.16,.35,.18], mat.bossAccent, [0,0,side*.4]);
    }
  }

  function draw(e, time) {
    const s = (e.spawnScale == null ? 1 : e.spawnScale) * (e.modelScale || 1);
    M4.compose(GROUP, e.pos, [0, e.yaw || 0, 0], [s, s, s]);
    if (e.type === 'sentinel') sentinel(e, time);
    else if (e.type === 'weaver') weaver(e, time);
    else if (e.type === 'brute') brute(e, time);
    else if (e.type === 'turret') turret(e, time);
    else if (e.type === 'boss') boss(e, time);
  }

  return { draw, sentinel, weaver, brute, turret, boss, get materials() { return mat; } };
})();
