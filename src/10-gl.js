/* ============================================================
   NEON BREACH — hand-written WebGL renderer
   One lighting program, one additive-sprite program, one sky pass.
   ============================================================ */

const R = (() => {
  let gl = null, canvas = null;
  let width = 1, height = 1, dpr = 1;
  let skyProg = null, worldProg = null, glowProg = null;
  let skyU = null, worldU = null, glowU = null;
  let meshes = {};
  let textures = {};
  let skyBuffer = null;
  let view = M4.create(), proj = M4.create();
  let vmProj = M4.create(), identity = M4.create();
  let camera = null;
  let currentViewProj = M4.create();
  let scratchModel = M4.create(), scratchMat3 = new Float32Array(9);
  let currentPass = 'none';
  let stats = { calls: 0, triangles: 0 };
  let resolutionScale = 1;
  const lightFlat = {
    pos: new Float32Array(18), color: new Float32Array(18), range: new Float32Array(6), intensity: new Float32Array(6)
  };
  let globalLights = [];
  let frameTime = 0;
  let glowTex = null, ringTex = null, starTex = null, shadowTex = null;

  const query = new URLSearchParams(location.search);
  const debugMode = query.has('debug') || query.has('shot');
  const forcedDpr = parseFloat(query.get('dpr') || '0');

  function fail(msg) {
    console.error('[NEON BREACH]', msg);
    dom.fatal.classList.add('show');
    dom.fatalDetail.textContent = msg;
  }

  function compile(type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile error: ' + log);
    }
    return sh;
  }
  function program(vsSrc, fsSrc, name) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program link error [' + name + ']: ' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    return p;
  }
  function locs(p, names) {
    const out = {};
    for (const n of names) out[n] = gl.getUniformLocation(p, n);
    return out;
  }

  /* ---------------- shaders ---------------- */
  const skyVert = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.9999, 1.0);
    }
  `;
  const skyFrag = `
    precision highp float;
    varying vec2 vUv;
    uniform vec3 uRight, uUp, uFwd;
    uniform float uTanHalf, uAspect, uTime;
    uniform vec3 uFogColor;

    float hash21(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash21(i), hash21(i+vec2(1.,0.)), f.x),
                 mix(hash21(i+vec2(0.,1.)), hash21(i+vec2(1.,1.)), f.x), f.y);
    }
    void main(){
      vec2 ndc = vUv * 2.0 - 1.0;
      vec3 dir = normalize(uFwd + uRight * ndc.x * uTanHalf * uAspect + uUp * ndc.y * uTanHalf);
      float h = dir.y;

      vec3 zenith = vec3(0.005, 0.009, 0.025);
      vec3 upper = vec3(0.018, 0.020, 0.055);
      vec3 horizon = vec3(0.140, 0.052, 0.146);
      vec3 low = vec3(0.035, 0.020, 0.048);

      vec3 col = mix(horizon, upper, smoothstep(0.0, 0.20, h));
      col = mix(col, zenith, smoothstep(0.16, 0.72, h));
      col = mix(low, col, smoothstep(-0.22, 0.015, h));

      // city-glow band hugging the horizon
      float cityBand = exp(-abs(h) * 28.0);
      col += vec3(0.30, 0.075, 0.21) * cityBand * 0.36;

      // distant star field — rounded cells, two densities
      if (h > 0.01) {
        vec2 sc = vec2(atan(dir.z, dir.x) * 110.0, asin(clamp(h,-1.,1.)) * 110.0);
        vec2 cell = floor(sc);
        vec2 f = fract(sc) - 0.5;
        float rnd = hash21(cell);
        float core = smoothstep(0.38, 0.02, length(f));
        float star = step(0.972, rnd) * core * smoothstep(0.01, 0.09, h);
        float tw = 0.5 + 0.5 * sin(uTime * 1.4 + rnd * 60.0);
        vec3 starTint = mix(vec3(0.55,0.8,1.0), vec3(1.0,0.62,0.85), fract(rnd*7.3));
        col += starTint * star * tw * 0.75;
        vec2 bigCell = floor(sc * 0.29);
        vec2 bf = fract(sc * 0.29) - 0.5;
        float brnd = hash21(bigCell + 19.3);
        float bigStar = step(0.986, brnd) * smoothstep(0.14, 0.0, length(bf));
        col += mix(vec3(0.65,0.85,1.0), vec3(1.0,0.72,0.8), fract(brnd*11.0)) * bigStar * (0.65+0.35*sin(uTime*1.1+brnd*40.0)) * 0.7;
      }

      // distant ringed world — a quiet visual anchor, never a solid flat disc
      vec3 pDir = normalize(vec3(0.46, 0.31, -0.83));
      float pd = dot(dir, pDir);
      float disc = smoothstep(0.9905, 0.9945, pd);
      if (disc > 0.001) {
        vec3 tangent = normalize(cross(pDir, vec3(0.0, 1.0, 0.0)));
        vec3 bitangent = normalize(cross(tangent, pDir));
        vec2 q = vec2(dot(dir, tangent), dot(dir, bitangent)) * 82.0;
        float bands = 0.5 + 0.5 * sin(q.y * 5.0 + sin(q.x*2.0)*.8 + 1.2);
        vec3 pcol = mix(vec3(0.16,0.075,0.19), vec3(0.48,0.24,0.38), bands);
        pcol *= 0.72 + 0.28 * smoothstep(-0.7, 0.7, q.x);
        float limb = smoothstep(0.9905, 0.996, pd) * smoothstep(1.0, 0.9952, pd);
        col = mix(col, pcol, disc * 0.6 * (0.45 + 0.55*limb));
      }
      float planetGlow = pow(max(pd, 0.0), 260.0);
      col += vec3(0.38, 0.12, 0.34) * planetGlow * 0.22;

      // faint high haze / nebula bands; structure rather than noise
      float neb = noise(vec2(atan(dir.z, dir.x) * 2.1 + 3.0, h * 5.0 - 1.0));
      neb = smoothstep(0.62, 0.9, neb) * smoothstep(0.06, 0.3, h) * (1.0 - smoothstep(0.55, 0.85, h));
      col += vec3(0.055, 0.035, 0.09) * neb;

      // horizon haze ties sky to scene fog
      col = mix(uFogColor * 1.08, col, smoothstep(-0.03, 0.075, h));

      // vignette on sky
      float v = 1.0 - smoothstep(0.5, 1.25, length(ndc * vec2(0.82, 0.9)));
      col *= 0.72 + 0.28 * v;

      col = pow(max(col, 0.0), vec3(0.86));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const worldVert = `
    precision highp float;
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec2 aUv;
    uniform mat4 uProj, uView, uModel;
    uniform mat3 uNormalMat;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    varying float vViewZ;
    void main(){
      vec4 wp = uModel * vec4(aPos, 1.0);
      vec4 vp = uView * wp;
      vNormal = uNormalMat * aNormal;
      vWorldPos = wp.xyz;
      vUv = aUv;
      vViewZ = -vp.z;
      gl_Position = uProj * vp;
    }
  `;
  const worldFrag = `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    varying float vViewZ;

    uniform vec3 uColor, uEmissive, uKeyDir, uKeyColor, uSkyAmbient, uGroundAmbient, uFogColor, uCamPos;
    uniform vec3 uPointPos[6];
    uniform vec3 uPointColor[6];
    uniform float uPointRange[6];
    uniform float uPointIntensity[6];
    uniform sampler2D uTex;
    uniform float uUseTex, uUnlit, uEmissionStrength, uOpacity, uSpecular, uRim;
    uniform vec2 uUvScale;
    uniform float uFogNear, uFogFar, uTime;

    void main(){
      vec4 texColor = vec4(1.0);
      if (uUseTex > 0.5) texColor = texture2D(uTex, vUv * uUvScale);
      vec3 base = uColor * texColor.rgb;

      vec3 col;
      if (uUnlit > 0.5) {
        col = base;
      } else {
        vec3 n = normalize(vNormal);
        vec3 vdir = normalize(uCamPos - vWorldPos);
        vec3 amb = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5);
        col = base * amb;

        float ndl = max(dot(n, uKeyDir), 0.0);
        col += base * uKeyColor * ndl;

        vec3 h = normalize(uKeyDir + vdir);
        float spec = pow(max(dot(n, h), 0.0), 42.0) * uSpecular;
        col += uKeyColor * spec * 0.7;

        for (int i = 0; i < 6; i++) {
          if (uPointIntensity[i] <= 0.001) continue;
          vec3 d = uPointPos[i] - vWorldPos;
          float dl = length(d);
          float att = pow(max(1.0 - dl / uPointRange[i], 0.0), 2.0);
          vec3 l = normalize(d);
          float nl = max(dot(n, l), 0.0);
          col += base * uPointColor[i] * att * uPointIntensity[i] * nl;
          vec3 hv = normalize(l + vdir);
          col += uPointColor[i] * pow(max(dot(n, hv), 0.0), 24.0) * uSpecular * att * uPointIntensity[i] * 0.55;
        }

        float rim = pow(1.0 - max(dot(n, vdir), 0.0), 3.2) * uRim;
        col += vec3(0.12, 0.36, 0.42) * rim;
      }

      col += uEmissive * uEmissionStrength;

      float fog = smoothstep(uFogNear, uFogFar, vViewZ);
      col = mix(col, uFogColor, fog);

      // soft filmic shoulder keeps the neon from clipping to flat white
      col = col / (col + vec3(0.70));
      col = pow(max(col, 0.0), vec3(0.94));
      col *= 1.30;
      gl_FragColor = vec4(col, uOpacity * texColor.a);
    }
  `;

  const glowVert = `
    precision highp float;
    attribute vec2 aPos;
    attribute vec2 aUv;
    uniform mat4 uProj, uView, uModel;
    varying vec2 vUv;
    void main(){
      vUv = aUv;
      gl_Position = uProj * uView * uModel * vec4(aPos, 0.0, 1.0);
    }
  `;
  const glowFrag = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec3 uColor;
    uniform float uIntensity, uOpacity, uRotation, uRing;
    void main(){
      vec2 p = vUv - 0.5;
      p = mat2(cos(uRotation), -sin(uRotation), sin(uRotation), cos(uRotation)) * p;
      float d = length(p) * 2.0;
      float shape = texture2D(uTex, p + 0.5).a;
      float corona = smoothstep(0.0, 0.35, 1.0 - d) * 0.09;
      float a = max(shape, corona);
      a *= smoothstep(0.0, 0.12, 1.0 - d);
      gl_FragColor = vec4(uColor * a * uIntensity, a * uOpacity);
    }
  `;

  /* ---------------- geometry ---------------- */
  class GeoBuilder {
    constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
    vert(x, y, z, nx, ny, nz, u, v) {
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
      return this.p.length / 3 - 1;
    }
    tri(a, b, c) { this.i.push(a, b, c); }
    quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
    build() {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.p), gl.STATIC_DRAW);
      const nbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.n), gl.STATIC_DRAW);
      const ubo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ubo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.u), gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.i), gl.STATIC_DRAW);
      return { vbo, nbo, ubo, ibo, count: this.i.length };
    }
  }

  function boxMesh() {
    const b = new GeoBuilder();
    // faces: +X, -X, +Y, -Y, +Z, -Z
    const faces = [
      { n: [1,0,0], c: [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]] },
      { n: [-1,0,0], c: [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]] },
      { n: [0,1,0], c: [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]] },
      { n: [0,-1,0], c: [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]] },
      { n: [0,0,1], c: [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]] },
      { n: [0,0,-1], c: [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]] }
    ];
    for (const f of faces) {
      const ix = [];
      const uvs = [[0,0],[1,0],[1,1],[0,1]];
      for (let i = 0; i < 4; i++) ix.push(b.vert(...f.c[i], ...f.n, ...uvs[i]));
      b.quad(ix[0], ix[1], ix[2], ix[3]);
    }
    return b.build();
  }
  function planeMesh() {
    const b = new GeoBuilder();
    const a=b.vert(-.5,0,.5,0,1,0,0,0), c=b.vert(.5,0,.5,0,1,0,1,0), d=b.vert(.5,0,-.5,0,1,0,1,1), e=b.vert(-.5,0,-.5,0,1,0,0,1);
    b.quad(a,c,d,e);
    return b.build();
  }
  function quadMesh() {
    const b = new GeoBuilder();
    const a=b.vert(-.5,-.5,0,0,0,1,0,0), c=b.vert(.5,-.5,0,0,0,1,1,0), d=b.vert(.5,.5,0,0,0,1,1,1), e=b.vert(-.5,.5,0,0,0,1,0,1);
    b.quad(a,c,d,e);
    return b.build();
  }
  function cylinderMesh(segments = 28, topRadius = 1, bottomRadius = 1) {
    const b = new GeoBuilder();
    const h = .5;
    const rings = [];
    for (let side = 0; side < 2; side++) {
      const y = side ? h : -h;
      const r = side ? topRadius : bottomRadius;
      const ring = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * TAU;
        ring.push([Math.cos(a) * .5 * r, y, Math.sin(a) * .5 * r]);
      }
      rings.push(ring);
    }
    // side normals account for taper
    const slope = (bottomRadius - topRadius) * .5;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * TAU, a1 = ((i + 1) / segments) * TAU;
      const n0 = V3.norm([Math.cos(a0) * 2, slope, Math.sin(a0) * 2]);
      const n1 = V3.norm([Math.cos(a1) * 2, slope, Math.sin(a1) * 2]);
      const p0 = rings[0][i], p1 = rings[0][i + 1], p2 = rings[1][i + 1], p3 = rings[1][i];
      const v0 = b.vert(...p0, ...n0, i / segments, 0);
      const v1 = b.vert(...p1, ...n1, (i + 1) / segments, 0);
      const v2 = b.vert(...p2, ...n1, (i + 1) / segments, 1);
      const v3 = b.vert(...p3, ...n0, i / segments, 1);
      b.quad(v0, v3, v2, v1);
    }
    // top cap (+Y)
    if (topRadius > 0.001) {
      const center = b.vert(0, h, 0, 0, 1, 0, 0.5, 0.5);
      const ids = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * TAU;
        ids.push(b.vert(Math.cos(a) * .5 * topRadius, h, Math.sin(a) * .5 * topRadius, 0, 1, 0, Math.cos(a)*.5+.5, Math.sin(a)*.5+.5));
      }
      for (let i = 0; i < segments; i++) b.tri(center, ids[i + 1], ids[i]);
    }
    // bottom cap (-Y)
    if (bottomRadius > 0.001) {
      const center = b.vert(0, -h, 0, 0, -1, 0, 0.5, 0.5);
      const ids = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * TAU;
        ids.push(b.vert(Math.cos(a) * .5 * bottomRadius, -h, Math.sin(a) * .5 * bottomRadius, 0, -1, 0, Math.cos(a)*.5+.5, Math.sin(a)*.5+.5));
      }
      for (let i = 0; i < segments; i++) b.tri(center, ids[i], ids[i + 1]);
    }
    return b.build();
  }
  function sphereMesh(slices = 24, stacks = 14) {
    const b = new GeoBuilder();
    for (let s = 0; s < stacks; s++) {
      const p0 = (s / stacks) * Math.PI, p1 = ((s + 1) / stacks) * Math.PI;
      const y0 = Math.cos(p0) * .5, r0 = Math.sin(p0) * .5;
      const y1 = Math.cos(p1) * .5, r1 = Math.sin(p1) * .5;
      for (let i = 0; i < slices; i++) {
        const a0 = (i / slices) * TAU, a1 = ((i + 1) / slices) * TAU;
        const pA = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0];
        const pB = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
        const pC = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
        const pD = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
        const nA = V3.norm(pA), nB = V3.norm(pB), nC = V3.norm(pC), nD = V3.norm(pD);
        const A = b.vert(...pA, ...nA, i/slices, 1-s/stacks);
        const B = b.vert(...pB, ...nB, (i+1)/slices, 1-s/stacks);
        const C = b.vert(...pC, ...nC, (i+1)/slices, 1-(s+1)/stacks);
        const D = b.vert(...pD, ...nD, i/slices, 1-(s+1)/stacks);
        b.quad(A, B, C, D);
      }
    }
    return b.build();
  }
  function torusMesh(majorSegs = 40, tubeSegs = 8, majorR = .46, tubeR = .055) {
    const b = new GeoBuilder();
    const verts = [];
    for (let i = 0; i <= majorSegs; i++) {
      const u = (i / majorSegs) * TAU;
      const cu = Math.cos(u), su = Math.sin(u);
      const row = [];
      for (let j = 0; j <= tubeSegs; j++) {
        const v = (j / tubeSegs) * TAU;
        const cv = Math.cos(v), sv = Math.sin(v);
        const x = (majorR + tubeR * cv) * cu;
        const y = tubeR * sv;
        const z = (majorR + tubeR * cv) * su;
        const nx = cv * cu, ny = sv, nz = cv * su;
        row.push(b.vert(x, y, z, nx, ny, nz, i / majorSegs, j / tubeSegs));
      }
      verts.push(row);
    }
    for (let i = 0; i < majorSegs; i++) {
      for (let j = 0; j < tubeSegs; j++) {
        b.quad(verts[i][j], verts[i][j+1], verts[i+1][j+1], verts[i+1][j]);
      }
    }
    return b.build();
  }
  function coneMesh(segments = 20) {
    return cylinderMesh(segments, 0.02, 1);
  }

  /* ---------------- textures (all procedurally generated) ---------------- */
  function canvasTexture(size, draw, opts = {}) {
    const c = document.createElement('canvas');
    c.width = opts.w || size; c.height = opts.h || size;
    const ctx = c.getContext('2d');
    draw(ctx, c.width, c.height);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  function noiseSpeckle(ctx, w, h, count, colors, alphaMin, alphaMax, sizeMin, sizeMax, rng) {
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = rand(alphaMin, alphaMax);
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
      const s = rand(sizeMin, sizeMax);
      ctx.fillRect(rng() * w, rng() * h, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function makeFloorTexture() {
    const rng = mulberry32(1453);
    return canvasTexture(1024, (ctx, w, h) => {
      ctx.fillStyle = '#0c121a'; ctx.fillRect(0, 0, w, h);
      // large poured plates
      const cell = 256;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const shade = 15 + Math.floor(rng() * 8);
          ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 10})`;
          ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
          ctx.strokeStyle = 'rgba(95,140,160,.12)'; ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
          // inset panel lines
          ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 26, y + 5); ctx.lineTo(x + 26, y + cell - 5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 5, y + 48); ctx.lineTo(x + cell - 5, y + 48); ctx.stroke();
        }
      }
      // fine plate seam grid
      for (let x = 0; x <= w; x += 64) {
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, 0, 2, h);
      }
      for (let y = 0; y <= h; y += 64) {
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, y, w, 2);
      }
      // restrained cyan service seams
      const seams = [[0,320,1024,320],[650,0,650,1024],[0,768,1024,768]];
      for (const s of seams) {
        ctx.strokeStyle = 'rgba(47,145,160,.22)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke();
        ctx.strokeStyle = 'rgba(16,30,36,.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s[0], s[1]+3); ctx.lineTo(s[2], s[3]+3); ctx.stroke();
      }
      // rust / grime streaks
      for (let i = 0; i < 70; i++) {
        const x = rng() * w, y = rng() * h;
        const len = 8 + rng() * 50;
        ctx.strokeStyle = `rgba(${50 + rng()*30},${34 + rng()*20},${28 + rng()*15},${.04 + rng()*.1})`;
        ctx.lineWidth = 1 + rng() * 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-3,3), y + len); ctx.stroke();
      }
      // scuffs and paint flecks
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = `rgba(130,155,165,${.025 + rng()*.05})`;
        ctx.lineWidth = 1;
        const x = rng() * w, y = rng() * h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-28, 28), y + rand(-6, 6)); ctx.stroke();
      }
      // bolts near corners
      for (let x = 32; x < w; x += 128) for (let y = 32; y < h; y += 128) {
        ctx.fillStyle = 'rgba(6,10,14,.8)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(120,150,160,.22)'; ctx.beginPath(); ctx.arc(x-1, y-1, 1, 0, TAU); ctx.fill();
      }
      noiseSpeckle(ctx, w, h, 2200, ['#1d2a32', '#090e13', '#26343b', '#2c2420'], .03, .12, 1, 3, rng);
      // faint hazard roundel at center of each repeat
      ctx.strokeStyle = 'rgba(160,115,45,.10)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(512, 512, 110, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(512, 512, 82, 0, TAU); ctx.stroke();
    });
  }

  function makeWallTexture() {
    const rng = mulberry32(829);
    return canvasTexture(1024, (ctx, w, h) => {
      ctx.fillStyle = '#0a1018'; ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 128) {
        const shade = 11 + Math.floor(rng() * 8);
        ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 9})`;
        ctx.fillRect(x + 2, 0, 124, h);
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, 1, 126, h - 2);
        ctx.strokeStyle = 'rgba(110,160,180,.08)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 6, 6, 116, h - 12);
        // vertical instrument seams
        ctx.fillStyle = 'rgba(20,50,58,.35)';
        ctx.fillRect(x + 108, 80, 2, h - 160);
      }
      for (let y = 0; y < h; y += 256) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, y, w, 3);
        ctx.fillStyle = 'rgba(90,140,155,.08)'; ctx.fillRect(0, y + 3, w, 1);
      }
      // horizontal access panel band
      ctx.fillStyle = 'rgba(8,15,21,.9)'; ctx.fillRect(0, 385, w, 152);
      for (let x = 0; x < w; x += 256) {
        ctx.strokeStyle = 'rgba(80,125,140,.17)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 20, 404, 216, 114);
        ctx.fillStyle = 'rgba(70,120,130,.15)';
        for (let i = 0; i < 5; i++) ctx.fillRect(x + 40 + i * 32, 480, 15, 3);
      }
      // grime water streaks
      for (let i = 0; i < 80; i++) {
        const x = rng() * w;
        const len = 40 + rng() * 300;
        const grd = ctx.createLinearGradient(0, 0, 0, len);
        grd.addColorStop(0, 'rgba(25,20,17,.14)');
        grd.addColorStop(1, 'rgba(10,8,7,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x, rng() * h * .7, 2 + rng() * 8, len);
      }
      noiseSpeckle(ctx, w, h, 1800, ['#20313a', '#05090d', '#2a1e18'], .03, .11, 1, 3, rng);
      // bolts
      for (let x = 32; x < w; x += 128) for (let y = 24; y < h; y += 128) {
        ctx.fillStyle = 'rgba(3,7,10,.9)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(110,150,160,.18)'; ctx.beginPath(); ctx.arc(x-1, y-1, 1.5, 0, TAU); ctx.fill();
      }
    });
  }

  function makeCrateTexture() {
    const rng = mulberry32(7731);
    return canvasTexture(512, (ctx, w, h) => {
      ctx.fillStyle = '#141b20'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1b252b'; ctx.fillRect(14, 14, w - 28, h - 28);
      // corner reinforcements
      ctx.fillStyle = '#0b1115';
      ctx.fillRect(0, 0, 70, 26); ctx.fillRect(0, 0, 26, 70);
      ctx.fillRect(w - 70, 0, 70, 26); ctx.fillRect(w - 26, 0, 26, 70);
      ctx.fillRect(0, h - 26, 70, 26); ctx.fillRect(0, h - 70, 26, 70);
      ctx.fillRect(w - 70, h - 26, 70, 26); ctx.fillRect(w - 26, h - 70, 26, 70);
      // central panel
      ctx.strokeStyle = 'rgba(100,145,155,.22)'; ctx.lineWidth = 3;
      ctx.strokeRect(90, 90, w - 180, h - 180);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
      ctx.strokeRect(97, 97, w - 194, h - 194);
      // hazard chevrons
      ctx.save();
      ctx.beginPath(); ctx.rect(90, 210, w - 180, 74); ctx.clip();
      for (let i = -120; i < w + 120; i += 52) {
        ctx.fillStyle = i % 104 === 0 ? 'rgba(197,145,51,.42)' : 'rgba(12,16,18,.2)';
        ctx.beginPath();
        ctx.moveTo(i, 284); ctx.lineTo(i + 26, 284); ctx.lineTo(i + 74, 210); ctx.lineTo(i + 48, 210);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // stencil marks
      ctx.fillStyle = 'rgba(140,170,175,.36)';
      ctx.font = 'bold 31px monospace';
      ctx.fillText('C-07', 48, 70);
      ctx.font = '15px monospace';
      ctx.fillStyle = 'rgba(140,170,175,.24)';
      ctx.fillText('KINETIC DIVISION / SECURE', 46, 460);
      ctx.fillStyle = 'rgba(255,47,139,.4)';
      ctx.fillRect(430, 52, 30, 4);
      // wear
      for (let i = 0; i < 50; i++) {
        ctx.strokeStyle = `rgba(120,140,145,${.04 + rng()*.08})`;
        ctx.lineWidth = 1;
        const x = rng() * w, y = rng() * h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-30, 30), y + rand(-5, 5)); ctx.stroke();
      }
      noiseSpeckle(ctx, w, h, 1000, ['#2f3b40', '#061014', '#47352b'], .04, .15, 1, 3, rng);
    });
  }

  function makeBarrierTexture() {
    const rng = mulberry32(3401);
    return canvasTexture(512, (ctx, w, h) => {
      ctx.fillStyle = '#0c1319'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#172128'; ctx.fillRect(0, 32, w, h - 64);
      ctx.strokeStyle = 'rgba(100,150,160,.16)'; ctx.lineWidth = 2;
      ctx.strokeRect(12, 40, w - 24, h - 80);
      // central hazard run
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 205, w, 102); ctx.clip();
      ctx.fillStyle = 'rgba(10,14,16,.7)'; ctx.fillRect(0, 205, w, 102);
      for (let i = -100; i < w + 100; i += 74) {
        ctx.fillStyle = 'rgba(198,145,49,.36)';
        ctx.beginPath(); ctx.moveTo(i, 307); ctx.lineTo(i + 28, 307); ctx.lineTo(i + 86, 205); ctx.lineTo(i + 58, 205); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(110,151,160,.2)'; ctx.lineWidth = 3;
      for (let x = 35; x < w; x += 110) { ctx.beginPath(); ctx.moveTo(x, 55); ctx.lineTo(x, 185); ctx.stroke(); }
      noiseSpeckle(ctx, w, h, 900, ['#2b353a', '#060b0e', '#493829'], .04, .13, 1, 3, rng);
    });
  }

  function makeFacadeTexture() {
    const rng = mulberry32(9211);
    return canvasTexture(256, (ctx, w, h) => {
      ctx.fillStyle = '#0a1420'; ctx.fillRect(0, 0, w, h);
      // structural verticals
      ctx.fillStyle = 'rgba(18,32,44,.9)';
      for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 5, h);
      for (let y = 0; y < h; y += 20) {
        ctx.fillStyle = 'rgba(3,8,14,.47)'; ctx.fillRect(0, y, w, 3);
      }
      // building facade, self-lit windows so distant towers read at night
      const cols = 16, rows = 34;
      const cw = w / cols, ch = h / rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          ctx.fillStyle = 'rgba(12,23,37,.9)';
          ctx.fillRect(x*cw + 3, y*ch + 4, cw - 6, ch - 8);
          if (rng() > 0.52) {
            const palette = ['rgba(90,190,212,', 'rgba(196,92,132,', 'rgba(130,142,174,', 'rgba(78,136,160,'];
            const c = palette[Math.floor(rng() * palette.length)];
            ctx.fillStyle = c + (0.05 + rng() * 0.34) + ')';
            ctx.fillRect(x*cw + 4, y*ch + 5, cw - 8, ch - 10);
          }
        }
      }
      // a few warm interior bands to break the navy
      ctx.fillStyle = 'rgba(200,120,60,.12)';
      ctx.fillRect(0, 142, w, 14);
      ctx.fillRect(0, 52, w, 4);
      noiseSpeckle(ctx, w, h, 380, ['#030608', '#101d26', '#3b2022'], .06, .26, 1, 2, rng);
    }, { clamp: false });
  }

  function makeSignTexture() {
    return canvasTexture(1024, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(3,8,13,.93)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(104,246,255,.55)'; ctx.lineWidth = 4;
      ctx.strokeRect(18, 18, w - 36, h - 36);
      ctx.strokeStyle = 'rgba(104,246,255,.15)'; ctx.lineWidth = 1;
      ctx.strokeRect(34, 34, w - 68, h - 68);
      ctx.fillStyle = 'rgba(255,47,139,.75)'; ctx.fillRect(54, 134, 190, 6);
      ctx.fillStyle = '#dffcff'; ctx.font = '800 180px "Arial Narrow", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('SECTOR', 50, 260);
      ctx.fillText('07', 760, 260);
      ctx.fillStyle = 'rgba(104,246,255,.8)'; ctx.font = '42px monospace';
      ctx.fillText('KINETIC DIVISION · RESTRICTED', 54, 380);
      ctx.fillStyle = 'rgba(150,190,200,.4)'; ctx.font = '24px monospace';
      ctx.fillText('ILLEGAL ENTRY WILL BE TERMINATED', 54, 425);
      // corner brackets
      ctx.strokeStyle = 'rgba(104,246,255,.8)'; ctx.lineWidth = 6;
      for (const [x, y, sx, sy] of [[28,28,1,1],[w-28,28,-1,1],[28,h-28,1,-1],[w-28,h-28,-1,-1]]) {
        ctx.beginPath(); ctx.moveTo(x + 34*sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + 34*sy); ctx.stroke();
      }
      // barcode
      ctx.fillStyle = 'rgba(180,210,215,.45)';
      let x = 770;
      for (let i = 0; i < 24; i++) { const bw = 2 + (i % 4); ctx.fillRect(x, 360, bw, 48); x += bw + 4; }
    }, { w: 1024, h: 512 });
  }

  function makePortalTexture() {
    return canvasTexture(256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w/2, cy = h/2;
      const grd = ctx.createRadialGradient(cx, cy, 18, cx, cy, 120);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(.42, 'rgba(255,255,255,0)');
      grd.addColorStop(.48, 'rgba(255,255,255,.85)');
      grd.addColorStop(.55, 'rgba(255,255,255,.18)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 72, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillRect(cx + Math.cos(a) * 100 - 2, cy + Math.sin(a) * 100 - 2, 4, 4);
      }
    }, { clamp: true });
  }

  function makeGlowTexture(size = 128) {
    return canvasTexture(size, (ctx, w, h) => {
      const grd = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(.16, 'rgba(255,255,255,.9)');
      grd.addColorStop(.36, 'rgba(255,255,255,.28)');
      grd.addColorStop(.68, 'rgba(255,255,255,.07)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    }, { clamp: true });
  }
  function makeRingTexture() {
    return canvasTexture(256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w/2, cy = h/2;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 128);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(.78, 'rgba(255,255,255,0)');
      grd.addColorStop(.87, 'rgba(255,255,255,.14)');
      grd.addColorStop(.93, 'rgba(255,255,255,.95)');
      grd.addColorStop(.965, 'rgba(255,255,255,.15)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, 42 + i * 17, i * 1.2, i * 1.2 + 1.7); ctx.stroke();
      }
    }, { clamp: true });
  }
  function makeStarTexture() {
    return canvasTexture(128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w/2, h/2);
      const g = ctx.createRadialGradient(0,0,0, 0,0,64);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.18,'rgba(255,255,255,.6)');
      g.addColorStop(.42,'rgba(255,255,255,.12)'); g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,64,0,TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-58,0); ctx.lineTo(58,0); ctx.moveTo(0,-58); ctx.lineTo(0,58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-30,-30); ctx.lineTo(30,30); ctx.moveTo(30,-30); ctx.lineTo(-30,30); ctx.stroke();
    }, { clamp: true });
  }

  /* ---------------- init ---------------- */
  function init() {
    canvas = dom.gl;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: debugMode });
      if (!gl) gl = canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) {
      fail('WebGL 初始化失败。浏览器未返回可用上下文。');
      return false;
    }
    gl.clearColor(0.01, 0.015, 0.03, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.getExtension('OES_standard_derivatives');

    try {
      skyProg = program(skyVert, skyFrag, 'sky');
      worldProg = program(worldVert, worldFrag, 'world');
      glowProg = program(glowVert, glowFrag, 'glow');
    } catch (e) {
      fail(e.message);
      return false;
    }
    skyU = locs(skyProg, ['uRight','uUp','uFwd','uTanHalf','uAspect','uTime','uFogColor']);
    worldU = locs(worldProg, ['uProj','uView','uModel','uNormalMat','uColor','uEmissive','uKeyDir','uKeyColor','uSkyAmbient','uGroundAmbient','uFogColor','uCamPos','uPointPos','uPointColor','uPointRange','uPointIntensity','uTex','uUseTex','uUnlit','uEmissionStrength','uOpacity','uSpecular','uRim','uUvScale','uFogNear','uFogFar','uTime']);
    glowU = locs(glowProg, ['uProj','uView','uModel','uTex','uColor','uIntensity','uOpacity','uRotation','uRing']);

    meshes.box = boxMesh();
    meshes.plane = planeMesh();
    meshes.quad = quadMesh();
    meshes.cylinder = cylinderMesh(28, 1, 1);
    meshes.cylinderTaper = cylinderMesh(24, .28, 1);
    meshes.sphere = sphereMesh(24, 14);
    meshes.torus = torusMesh(44, 8);
    meshes.cone = coneMesh(20);

    textures.floor = makeFloorTexture();
    textures.wall = makeWallTexture();
    textures.crate = makeCrateTexture();
    textures.barrier = makeBarrierTexture();
    textures.facade = makeFacadeTexture();
    textures.sign = makeSignTexture();
    textures.portal = makePortalTexture();
    glowTex = makeGlowTexture(128);
    textures.glow = glowTex;
    ringTex = makeRingTexture();
    textures.ring = ringTex;
    starTex = makeStarTexture();
    textures.star = starTex;
    shadowTex = makeGlowTexture(128);
    textures.shadow = shadowTex;

    skyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

    M4.identity(identity);
    resize();
    return true;
  }

  function resize() {
    if (!gl) return;
    dpr = forcedDpr > 0 ? clamp(forcedDpr, .5, 3) : Math.min(window.devicePixelRatio || 1, 1.6);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w; canvas.height = h;
    }
    const fw = Math.max(1, Math.floor(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
    const fh = Math.max(1, Math.floor(canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2)));
    if (dom.fx.width !== fw || dom.fx.height !== fh) { dom.fx.width = fw; dom.fx.height = fh; }
    width = canvas.clientWidth; height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function cameraMatrices(cam, fovDeg) {
    const eye = cam.eye;
    const basis = cameraBasis(cam.yaw, cam.pitch);
    const target = V3.add(eye, basis.forward);
    M4.lookAt(view, eye, target, basis.up);
    M4.perspective(proj, fovDeg * DEG, width / height, 0.06, 180);
    M4.multiply(currentViewProj, proj, view);
    camera = { ...cam, basis };
    M4.perspective(vmProj, 62 * DEG, width / height, 0.01, 4);
    return camera;
  }

  function setFogAndSky(fogColor) {
    // reserved for future sky-driven fog changes
  }

  function drawSky(cam, time, fogColor) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.useProgram(skyProg);
    const b = cameraBasis(cam.yaw, cam.pitch);
    gl.uniform3fv(skyU.uRight, b.right);
    gl.uniform3fv(skyU.uUp, b.up);
    gl.uniform3fv(skyU.uFwd, b.forward);
    gl.uniform1f(skyU.uTanHalf, Math.tan(cam.fov * DEG / 2));
    gl.uniform1f(skyU.uAspect, width / height);
    gl.uniform1f(skyU.uTime, time);
    gl.uniform3fv(skyU.uFogColor, fogColor);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    const loc = gl.getAttribLocation(skyProg, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(loc);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    stats.calls++;
  }

  function beginWorld(cam, lights, time, fogColor) {
    gl.useProgram(worldProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(worldU.uProj, false, proj);
    gl.uniformMatrix4fv(worldU.uView, false, view);
    camera = { ...cam, basis: cameraBasis(cam.yaw, cam.pitch) };
    gl.uniform3fv(worldU.uCamPos, cam.eye);
    gl.uniform3fv(worldU.uKeyDir, [0.42, 0.76, 0.32]);
    gl.uniform3fv(worldU.uKeyColor, [0.30, 0.39, 0.52]);
    gl.uniform3fv(worldU.uSkyAmbient, [0.145, 0.190, 0.255]);
    gl.uniform3fv(worldU.uGroundAmbient, [0.040, 0.050, 0.070]);
    gl.uniform3fv(worldU.uFogColor, fogColor);
    gl.uniform1f(worldU.uFogNear, 25);
    gl.uniform1f(worldU.uFogFar, 100);
    gl.uniform1f(worldU.uTime, time);
    globalLights = lights || [];
    const p = lightFlat.pos, c = lightFlat.color, rr = lightFlat.range, ii = lightFlat.intensity;
    p.fill(0); c.fill(0); rr.fill(0); ii.fill(0);
    for (let i = 0; i < Math.min(6, globalLights.length); i++) {
      const L = globalLights[i];
      p[i*3] = L.pos[0]; p[i*3+1] = L.pos[1]; p[i*3+2] = L.pos[2];
      c[i*3] = L.color[0]; c[i*3+1] = L.color[1]; c[i*3+2] = L.color[2];
      rr[i] = L.range || 10; ii[i] = L.intensity == null ? 1 : L.intensity;
    }
    gl.uniform3fv(worldU.uPointPos, p);
    gl.uniform3fv(worldU.uPointColor, c);
    gl.uniform1fv(worldU.uPointRange, rr);
    gl.uniform1fv(worldU.uPointIntensity, ii);
    currentPass = 'world';
  }

  function beginViewmodel(lights, time, fogColor) {
    gl.useProgram(worldProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(worldU.uProj, false, vmProj);
    gl.uniformMatrix4fv(worldU.uView, false, identity);
    gl.uniform3fv(worldU.uCamPos, [0, 0, 0]);
    gl.uniform3fv(worldU.uKeyDir, [0.32, 0.55, 0.77]);
    gl.uniform3fv(worldU.uKeyColor, [0.52, 0.62, 0.73]);
    gl.uniform3fv(worldU.uSkyAmbient, [0.16, 0.20, 0.25]);
    gl.uniform3fv(worldU.uGroundAmbient, [0.045, 0.055, 0.070]);
    gl.uniform3fv(worldU.uFogColor, [0,0,0]);
    gl.uniform1f(worldU.uFogNear, 50);
    gl.uniform1f(worldU.uFogFar, 100);
    gl.uniform1f(worldU.uTime, time);
    // a practical just off the left glove, adds shape to the weapon
    const p = lightFlat.pos, c = lightFlat.color, rr = lightFlat.range, ii = lightFlat.intensity;
    p.fill(0); c.fill(0); rr.fill(0); ii.fill(0);
    p[0] = -1.0; p[1] = 0.45; p[2] = -0.20; c[0] = 0.20; c[1] = 0.55; c[2] = 0.62; rr[0] = 3.0; ii[0] = 1.2;
    p[3] = 0.55; p[4] = 0.10; p[5] = -0.30; c[3] = 0.9; c[4] = 0.25; c[5] = 0.35; rr[3] = 2.0; ii[3] = .55;
    gl.uniform3fv(worldU.uPointPos, p);
    gl.uniform3fv(worldU.uPointColor, c);
    gl.uniform1fv(worldU.uPointRange, rr);
    gl.uniform1fv(worldU.uPointIntensity, ii);
    currentPass = 'viewmodel';
  }

  function matDefaults(mat) {
    return mat || {};
  }
  function bindTexture(tex) {
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(worldU.uTex, 0);
    }
  }

  function drawMesh(meshName, model, material, opts = {}) {
    if (!worldProg) return;
    const mesh = meshes[meshName];
    if (!mesh) return;
    const m = material || {};
    if (currentPass !== 'world' && currentPass !== 'viewmodel') {
      // caller must begin a drawing pass first
      return;
    }
    M4.normalMat3(scratchMat3, model);
    gl.uniformMatrix4fv(worldU.uModel, false, model);
    gl.uniformMatrix3fv(worldU.uNormalMat, false, scratchMat3);
    gl.uniform3fv(worldU.uColor, m.color || [1,1,1]);
    gl.uniform3fv(worldU.uEmissive, m.emissive || [0,0,0]);
    gl.uniform1f(worldU.uEmissionStrength, m.emissiveStrength == null ? 1 : m.emissiveStrength);
    gl.uniform1f(worldU.uSpecular, m.specular == null ? .35 : m.specular);
    gl.uniform1f(worldU.uRim, m.rim == null ? .06 : m.rim);
    gl.uniform1f(worldU.uUnlit, m.unlit ? 1 : 0);
    gl.uniform1f(worldU.uOpacity, m.opacity == null ? 1 : m.opacity);
    gl.uniform2fv(worldU.uUvScale, m.uvScale || [1,1]);
    const tex = m.tex || null;
    bindTexture(tex);
    gl.uniform1f(worldU.uUseTex, tex ? 1 : 0);
    if (opts.blend === 'alpha') {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    const aPos = gl.getAttribLocation(worldProg, 'aPos');
    const aNor = gl.getAttribLocation(worldProg, 'aNormal');
    const aUv = gl.getAttribLocation(worldProg, 'aUv');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aNor); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo); gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aUv); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.ubo); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(aPos); gl.disableVertexAttribArray(aNor); gl.disableVertexAttribArray(aUv);
    stats.calls++;
    stats.triangles += mesh.count / 3;
  }

  function drawFullscreenSky(cam, time, fogColor) { drawSky(cam, time, fogColor); }

  /* ---------------- glows & decals ---------------- */
  let glowView = M4.create(), glowProj = M4.create();
  function beginGlows(cam) {
    gl.useProgram(glowProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix4fv(glowU.uProj, false, proj);
    gl.uniformMatrix4fv(glowU.uView, false, view);
    gl.uniform1i(glowU.uTex, 0);
    camera = { ...cam, basis: cameraBasis(cam.yaw, cam.pitch) };
    gl.bindBuffer(gl.ARRAY_BUFFER, meshes.quad.vbo);
    const aPos = gl.getAttribLocation(glowProg, 'aPos');
    const aUv = gl.getAttribLocation(glowProg, 'aUv');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aUv); gl.bindBuffer(gl.ARRAY_BUFFER, meshes.quad.ubo); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshes.quad.ibo);
    currentPass = 'glow';
  }
  function beginGlowViewmodel() {
    gl.useProgram(glowProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix4fv(glowU.uProj, false, vmProj);
    gl.uniformMatrix4fv(glowU.uView, false, identity);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshes.quad.vbo);
    const aPos = gl.getAttribLocation(glowProg, 'aPos');
    const aUv = gl.getAttribLocation(glowProg, 'aUv');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aUv); gl.bindBuffer(gl.ARRAY_BUFFER, meshes.quad.ubo); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshes.quad.ibo);
    currentPass = 'glowvm';
  }
  function glowBillboardMatrix(out, pos, size, roll) {
    const b = camera.basis;
    const r = b.right, u = b.up, f = b.forward;
    const cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
    const rx = r[0]*cr + u[0]*sr, ry = r[1]*cr + u[1]*sr, rz = r[2]*cr + u[2]*sr;
    const ux = -r[0]*sr + u[0]*cr, uy = -r[1]*sr + u[1]*cr, uz = -r[2]*sr + u[2]*cr;
    out[0] = rx * size; out[1] = ry * size; out[2] = rz * size; out[3] = 0;
    out[4] = ux * size; out[5] = uy * size; out[6] = uz * size; out[7] = 0;
    out[8] = f[0]*size; out[9] = f[1]*size; out[10] = f[2]*size; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
    return out;
  }
  function drawGlowWorld(pos, size, color, intensity, opts = {}) {
    if (currentPass !== 'glow') return;
    const tex = opts.tex || glowTex;
    glowBillboardMatrix(scratchModel, pos, size, opts.roll || 0);
    gl.uniformMatrix4fv(glowU.uModel, false, scratchModel);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform3fv(glowU.uColor, color);
    gl.uniform1f(glowU.uIntensity, intensity);
    gl.uniform1f(glowU.uOpacity, opts.opacity == null ? 1 : opts.opacity);
    gl.uniform1f(glowU.uRotation, 0);
    gl.drawElements(gl.TRIANGLES, meshes.quad.count, gl.UNSIGNED_SHORT, 0);
    stats.calls++;
  }
  function drawGlowScreen(px, py, nx, ny, size, color, intensity, opts = {}) {
    // px,py = normalized device coords for placement; nx,ny = size in NDC
    if (currentPass !== 'glow' && currentPass !== 'glowvm') return;
    const tex = opts.tex || glowTex;
    M4.identity(scratchModel);
    scratchModel[0] = nx * size; scratchModel[5] = ny * size;
    scratchModel[12] = px; scratchModel[13] = py; scratchModel[14] = -0.2;
    gl.uniformMatrix4fv(glowU.uModel, false, scratchModel);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform3fv(glowU.uColor, color);
    gl.uniform1f(glowU.uIntensity, intensity);
    gl.uniform1f(glowU.uOpacity, opts.opacity == null ? 1 : opts.opacity);
    gl.uniform1f(glowU.uRotation, 0);
    gl.drawElements(gl.TRIANGLES, meshes.quad.count, gl.UNSIGNED_SHORT, 0);
    stats.calls++;
  }
  function drawGlowRaw(pos, rot, sizeX, sizeZ, color, intensity, tex, opacity = 1) {
    if (currentPass !== 'glow') return;
    M4.compose(scratchModel, pos, rot, [sizeX, 1, sizeZ]);
    gl.uniformMatrix4fv(glowU.uModel, false, scratchModel);
    gl.bindTexture(gl.TEXTURE_2D, tex || ringTex);
    gl.uniform3fv(glowU.uColor, color);
    gl.uniform1f(glowU.uIntensity, intensity);
    gl.uniform1f(glowU.uOpacity, opacity);
    gl.uniform1f(glowU.uRotation, 0);
    gl.drawElements(gl.TRIANGLES, meshes.quad.count, gl.UNSIGNED_SHORT, 0);
    stats.calls++;
  }
  function drawGroundRing(x, z, radius, color, intensity, rotation = 0, tex = ringTex, y = 0.035) {
    // horizontal quad, using the XY quad rotated -90° about X
    M4.compose(scratchModel, [x, y, z], [-Math.PI/2, 0, rotation], [radius * 2, radius * 2, 1]);
    gl.uniformMatrix4fv(glowU.uModel, false, scratchModel);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform3fv(glowU.uColor, color);
    gl.uniform1f(glowU.uIntensity, intensity);
    gl.uniform1f(glowU.uOpacity, 1);
    gl.uniform1f(glowU.uRotation, 0);
    gl.drawElements(gl.TRIANGLES, meshes.quad.count, gl.UNSIGNED_SHORT, 0);
    stats.calls++;
  }
  function drawShadow(x, z, radius, opacity) {
    if (currentPass !== 'glow') return;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    M4.compose(scratchModel, [x, 0.028, z], [-Math.PI/2, 0, 0], [radius * 2, radius * 2, 1]);
    gl.uniformMatrix4fv(glowU.uModel, false, scratchModel);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform3fv(glowU.uColor, [0, 0, 0]);
    gl.uniform1f(glowU.uIntensity, 1);
    gl.uniform1f(glowU.uOpacity, opacity);
    gl.uniform1f(glowU.uRotation, 0);
    gl.drawElements(gl.TRIANGLES, meshes.quad.count, gl.UNSIGNED_SHORT, 0);
    gl.blendFunc(gl.ONE, gl.ONE);
    stats.calls++;
  }
  function drawViewGlow(pos, size, color, intensity, tex, rotation = 0, opacity = 1) {
    if (currentPass !== 'glowvm') return;
    M4.identity(scratchModel);
    const c = Math.cos(rotation), s = Math.sin(rotation);
    scratchModel[0] = c * size; scratchModel[1] = s * size;
    scratchModel[4] = -s * size; scratchModel[5] = c * size;
    scratchModel[12] = pos[0]; scratchModel[13] = pos[1]; scratchModel[14] = pos[2];
    gl.uniformMatrix4fv(glowU.uModel, false, scratchModel);
    gl.bindTexture(gl.TEXTURE_2D, tex || glowTex);
    gl.uniform3fv(glowU.uColor, color);
    gl.uniform1f(glowU.uIntensity, intensity);
    gl.uniform1f(glowU.uOpacity, opacity);
    gl.uniform1f(glowU.uRotation, 0);
    gl.drawElements(gl.TRIANGLES, meshes.quad.count, gl.UNSIGNED_SHORT, 0);
    stats.calls++;
  }
  function endGlows() {
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    currentPass = 'none';
  }

  function beginFrame() {
    stats.calls = 0; stats.triangles = 0;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    currentPass = 'none';
  }

  function setFrameTime(t) { frameTime = t; }
  function resizePublic() { resize(); }
  function clearDepth() { gl.clear(gl.DEPTH_BUFFER_BIT); }
  function useWorldPass(cam, lights, time, fogColor) { beginWorld(cam, lights, time, fogColor); }
  function useViewmodelPass(lights, time, fogColor) { beginViewmodel(lights, time, fogColor); }

  return {
    init, resize: resizePublic, beginFrame, setFrameTime, clearDepth,
    cameraMatrices, drawSky: drawFullscreenSky, beginWorld: useWorldPass, beginViewmodel: useViewmodelPass,
    beginGlows, beginGlowViewmodel, drawGlowWorld, drawGlowScreen, drawGroundRing, drawGlowRaw, drawShadow, drawViewGlow, endGlows,
    drawMesh, textures, get gl() { return gl; }, get width() { return width; }, get height() { return height; },
    get viewProj() { return currentViewProj; }, get camera() { return camera; },
    get stats() { return stats; }, get meshes() { return meshes; },
    get isReady() { return !!gl && !!worldProg; }, get currentPass() { return currentPass; },
    get dpr() { return dpr; }, get viewMat() { return view; }, get projMat() { return proj; }, get vmProjMat() { return vmProj; },
    currentViewProj
  };
})();
