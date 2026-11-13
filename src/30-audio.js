/* ============================================================
   NEON BREACH — fully synthesized audio
   Weapon foley, UI tones, impacts and a small adaptive pulse score.
   ============================================================ */
const AUDIO = (() => {
  let ctx = null, master = null, comp = null, sfx = null, music = null;
  let noiseBuf = null;
  let ready = false;
  let muted = false;
  let volume = .7;
  let scene = 'menu';
  let scheduler = null, nextStep = 0, stepIndex = 0;
  let droneNodes = [];
  let lastHit = 0;

  function init() {
    if (ready) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = .003;
    comp.release.value = .25;
    master = ctx.createGain();
    sfx = ctx.createGain();
    music = ctx.createGain();
    master.gain.value = muted ? 0.0001 : volume;
    sfx.gain.value = .9;
    music.gain.value = .26;
    sfx.connect(comp);
    music.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    noiseBuf = makeNoise(2.0);
    ready = true;
    startDrone();
    startScheduler();
    applyVolume();
  }

  function makeNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function panner(pan) {
    if (!pan || !ctx.createStereoPanner) return null;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }
  function connectOut(node, bus, pan) {
    const p = panner(pan);
    if (p) { node.connect(p); p.connect(bus); }
    else node.connect(bus);
  }

  function tone(o) {
    if (!ready) return;
    const t = (o.when || ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, o.f0 || 440), t);
    if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.dur || .2));
    if (o.detune) osc.detune.value = o.detune;
    const peak = Math.max(.0002, o.gain || .1);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack || .004));
    g.gain.exponentialRampToValueAtTime(.0001, t + (o.dur || .2));
    osc.connect(g);
    connectOut(g, o.bus || sfx, o.pan || 0);
    osc.start(t); osc.stop(t + (o.dur || .2) + .03);
  }

  function noiseBurst(o) {
    if (!ready) return;
    const t = (o.when || ctx.currentTime) + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + (o.dur || .15));
    f.Q.value = o.q || .8;
    const g = ctx.createGain();
    const peak = Math.max(.0002, o.gain || .2);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack || .004));
    g.gain.exponentialRampToValueAtTime(.0001, t + (o.dur || .15));
    src.connect(f); f.connect(g);
    connectOut(g, o.bus || sfx, o.pan || 0);
    src.start(t, Math.random() * 1.4);
    src.stop(t + (o.dur || .15) + .04);
  }

  function shoot() {
    if (!ready) return;
    const t = ctx.currentTime;
    noiseBurst({ dur:.075, gain:.26, f0:2200, f1:420, filter:'bandpass', q:.55, when:t });
    noiseBurst({ dur:.14, gain:.10, f0:420, f1:120, filter:'lowpass', q:.9, when:t, delay:.012 });
    tone({ type:'square', f0:145, f1:52, dur:.14, gain:.16, when:t });
    tone({ type:'sawtooth', f0:620, f1:130, dur:.06, gain:.045, when:t, pan:.12 });
    tone({ type:'sine', f0:70, f1:38, dur:.18, gain:.12, when:t });
  }
  function dryFire() {
    noiseBurst({ dur:.035, gain:.12, f0:2600, q:2.2, filter:'bandpass' });
    tone({ type:'square', f0:320, f1:180, dur:.035, gain:.04 });
  }
  function reload(stage) {
    if (!ready) return;
    const t = ctx.currentTime + (stage === 1 ? .1 : stage === 2 ? .66 : 0);
    noiseBurst({ dur:.05, gain:.12, f0:1800, q:1.8, filter:'bandpass', when:t });
    tone({ type:'square', f0:190, f1:120, dur:.06, gain:.06, when:t });
    if (stage === 1) {
      noiseBurst({ dur:.045, gain:.08, f0:1100, q:1.2, filter:'bandpass', when:t, delay:.25 });
    }
    if (stage === 3) {
      noiseBurst({ dur:.04, gain:.1, f0:2500, q:2, filter:'bandpass', when:t });
      tone({ type:'sine', f0:730, f1:540, dur:.04, gain:.04, when:t, delay:.08 });
    }
  }
  function hit(head) {
    if (!ready) return;
    const t = ctx.currentTime;
    if (t - lastHit < .022) return;
    lastHit = t;
    tone({ type:'triangle', f0:head ? 1550 : 1120, f1:head ? 1250 : 900, dur:.055, gain:head ? .10 : .075, when:t });
    if (head) tone({ type:'sine', f0:2320, f1:1900, dur:.12, gain:.05, when:t, delay:.015 });
    noiseBurst({ dur:.028, gain:head?.09:.05, f0:4200, q:2.5, filter:'bandpass', when:t });
  }
  function kill(head) {
    if (!ready) return;
    tone({ type:'triangle', f0:head?1080:820, f1:head?1540:1100, dur:.14, gain:.09 });
    if (!head) noiseBurst({ dur:.1, gain:.1, f0:500, f1:160, filter:'lowpass' });
  }
  function hurt(amount) {
    if (!ready) return;
    const t = ctx.currentTime;
    noiseBurst({ dur:.18, gain:clamp(.16 + amount*.006, .16, .3), f0:600, f1:110, filter:'lowpass', q:.8, when:t });
    tone({ type:'sine', f0:95, f1:44, dur:.25, gain:.16, when:t });
    tone({ type:'sawtooth', f0:340, f1:80, dur:.12, gain:.03, when:t });
  }
  function shieldHit() {
    if (!ready) return;
    tone({ type:'triangle', f0:1200, f1:420, dur:.16, gain:.09 });
    noiseBurst({ dur:.08, gain:.06, f0:2800, q:1.2, filter:'highpass' });
  }
  function shieldBreak() {
    tone({ type:'sawtooth', f0:820, f1:80, dur:.4, gain:.1 });
    noiseBurst({ dur:.28, gain:.16, f0:3500, f1:300, filter:'bandpass', q:.5 });
  }
  function enemyShoot(pan, heavy) {
    if (!ready) return;
    tone({ type:'sawtooth', f0: heavy ? 260 : 520, f1: heavy ? 45 : 130, dur:heavy?.28:.14, gain: heavy?.07:.035, pan: pan || 0 });
    if (heavy) noiseBurst({ dur:.15, gain:.06, f0:400, f1:80, filter:'lowpass', pan:pan||0 });
  }
  function impact(pan) {
    if (!ready) return;
    noiseBurst({ dur:.05, gain:.055, f0:2900, f1:800, filter:'bandpass', q:1.3, pan:pan||0 });
  }
  function explosion(big) {
    if (!ready) return;
    const t = ctx.currentTime;
    noiseBurst({ dur: big?1.0:.45, gain: big?.42:.24, f0: big?620:700, f1:45, filter:'lowpass', q:.7, when:t });
    tone({ type:'sine', f0: big?110:90, f1:25, dur: big?.8:.4, gain: big?.35:.2, when:t });
    noiseBurst({ dur:.2, gain:.15, f0:2000, f1:400, filter:'bandpass', when:t });
    if (big) tone({ type:'sawtooth', f0:300, f1:30, dur:.9, gain:.06, when:t });
  }
  function pickup(kind) {
    if (!ready) return;
    const base = kind === 'health' ? 520 : 360;
    tone({ type:'sine', f0:base, f1:base*1.5, dur:.08, gain:.06 });
    tone({ type:'sine', f0:base*1.5, f1:base*2, dur:.12, gain:.045, delay:.08 });
  }
  function jump() {
    noiseBurst({ dur:.1, gain:.035, f0:800, f1:300, filter:'lowpass' });
  }
  function step(sprint) {
    if (!ready) return;
    const gain = sprint ? .032 : .022;
    noiseBurst({ dur:.065, gain, f0: sprint ? 420 : 330, f1:100, filter:'lowpass', q:.8, pan: rand(-.18,.18) });
    tone({ type:'sine', f0: sprint ? 95 : 78, f1:44, dur:.075, gain:gain*.7, pan: rand(-.12,.12) });
  }
  function heartbeat() {
    if (!ready) return;
    const t = ctx.currentTime;
    tone({ type:'sine', f0:66, f1:38, dur:.16, gain:.055, when:t });
    tone({ type:'sine', f0:52, f1:32, dur:.13, gain:.035, when:t, delay:.18 });
  }
  function land() {
    if (!ready) return;
    noiseBurst({ dur:.09, gain:.08, f0:280, f1:80, filter:'lowpass' });
    tone({ type:'sine', f0:90, f1:45, dur:.1, gain:.08 });
  }
  function dash() {
    noiseBurst({ dur:.22, gain:.13, f0:1800, f1:180, filter:'bandpass', q:.55 });
    tone({ type:'sine', f0:150, f1:60, dur:.16, gain:.04 });
  }
  function grenadeThrow() {
    noiseBurst({ dur:.11, gain:.055, f0:900, f1:350, filter:'bandpass' });
    tone({ type:'sine', f0:420, f1:250, dur:.08, gain:.03 });
  }
  function spawn() {
    if (!ready) return;
    tone({ type:'sawtooth', f0:140, f1:500, dur:.5, gain:.035 });
    noiseBurst({ dur:.35, gain:.035, f0:500, f1:2400, filter:'bandpass', q:1 });
  }
  function waveStart(boss) {
    if (!ready) return;
    if (boss) {
      tone({ type:'sawtooth', f0:55, f1:34, dur:2.2, gain:.15 });
      tone({ type:'sawtooth', f0:82, f1:50, dur:2.0, gain:.08, detune:12 });
      noiseBurst({ dur:1.8, gain:.07, f0:200, f1:80, filter:'lowpass' });
      for (let i=0;i<3;i++) tone({ type:'triangle', f0:400-i*35, f1:200, dur:.4, gain:.05, delay:.3+i*.25 });
    } else {
      tone({ type:'sawtooth', f0:110, f1:55, dur:.75, gain:.09 });
      tone({ type:'sine', f0:220, f1:130, dur:.55, gain:.05, delay:.06 });
      noiseBurst({ dur:.6, gain:.055, f0:1400, f1:300, filter:'bandpass', q:.6 });
    }
  }
  function waveClear() {
    if (!ready) return;
    const notes = [329.63, 392.00, 493.88, 659.25];
    notes.forEach((f,i)=>tone({ type:'triangle', f0:f, f1:f, dur:.35, gain:.06, delay:i*.085 }));
    tone({ type:'sine', f0:82.4, f1:82.4, dur:.6, gain:.08 });
  }
  function victory() {
    if (!ready) return;
    const notes = [220, 277.18, 329.63, 440, 554.37, 659.25];
    notes.forEach((f,i)=>tone({ type:'triangle', f0:f, f1:f, dur:.8, gain:.07, delay:i*.13 }));
    tone({ type:'sine', f0:110, f1:110, dur:2.2, gain:.08, delay:.2 });
  }
  function defeated() {
    if (!ready) return;
    const notes = [220, 196, 164.81, 110];
    notes.forEach((f,i)=>tone({ type:'sawtooth', f0:f, f1:f*.94, dur:1.0, gain:.055, delay:i*.24 }));
    noiseBurst({ dur:1.4, gain:.04, f0:900, f1:90, filter:'lowpass' });
  }
  function uiClick() {
    if (!ready) return;
    tone({ type:'square', f0:740, f1:980, dur:.035, gain:.025 });
  }
  function uiHover() {
    if (!ready) return;
    tone({ type:'sine', f0:880, f1:980, dur:.025, gain:.012 });
  }
  function lowAmmo() {
    if (!ready) return;
    tone({ type:'square', f0:880, f1:660, dur:.06, gain:.02 });
  }
  function warning() {
    if (!ready) return;
    tone({ type:'square', f0:420, f1:420, dur:.1, gain:.03 });
    tone({ type:'square', f0:420, f1:420, dur:.1, gain:.03, delay:.16 });
  }

  function startDrone() {
    if (!ctx) return;
    const g = ctx.createGain();
    g.gain.value = .04;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = .8;
    g.connect(f); f.connect(music);
    const freqs = [41.2, 55, 82.4];
    for (const [i, freq] of freqs.entries()) {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? .08 : .16;
      osc.connect(og); og.connect(g);
      osc.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = .05 + i*.017;
      const lg = ctx.createGain(); lg.gain.value = 1.5 + i;
      lfo.connect(lg); lg.connect(osc.detune);
      lfo.start();
      droneNodes.push(osc, lfo);
    }
    // airy wind/hum layer
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf; wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 340; wf.Q.value = .45;
    const wg = ctx.createGain(); wg.gain.value = .022;
    wind.connect(wf); wf.connect(wg); wg.connect(music);
    wind.start();
    droneNodes.push(wind);
  }

  function startScheduler() {
    nextStep = ctx.currentTime + .2;
    stepIndex = 0;
    scheduler = setInterval(() => {
      if (!ready || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (nextStep < now - 1) nextStep = now + .05;
      while (nextStep < now + .22) {
        scheduleStep(nextStep, stepIndex);
        nextStep += stepDuration();
        stepIndex++;
      }
    }, 65);
  }

  function stepDuration() {
    if (scene === 'paused') return .55;
    if (scene === 'boss') return .34;
    if (scene === 'combat') return .42;
    return .70;
  }

  const bassPattern = [55, 55, 65.41, 49, 55, 73.42, 65.41, 49];
  const highPattern = [0, 0, 1, 0, 0, 1, 0, 1];
  function scheduleStep(t, i) {
    if (scene === 'paused') return;
    const combat = scene === 'combat' || scene === 'boss';
    const boss = scene === 'boss';
    const bass = bassPattern[i % bassPattern.length] * (boss ? .5 : 1);
    if (i % 2 === 0) {
      const og = ctx.createGain();
      og.gain.setValueAtTime(.0001, t);
      og.gain.exponentialRampToValueAtTime(combat ? .10 : .045, t + .01);
      og.gain.exponentialRampToValueAtTime(.0001, t + .34);
      og.connect(music);
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(bass, t);
      osc.connect(og); osc.start(t); osc.stop(t+.36);
      // click transient for pulse definition
      if (combat) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=380;
        const g = ctx.createGain(); g.gain.setValueAtTime(.045, t); g.gain.exponentialRampToValueAtTime(.0001, t+.045);
        src.connect(f); f.connect(g); g.connect(music); src.start(t); src.stop(t+.06);
      }
    }
    if (combat && i % 2 === 1) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=6200;
      const g = ctx.createGain(); g.gain.setValueAtTime(boss?.025:.017, t); g.gain.exponentialRampToValueAtTime(.0001, t+.035);
      src.connect(f); f.connect(g); g.connect(music); src.start(t, Math.random()*1.5); src.stop(t+.05);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(.0001,t); hg.gain.exponentialRampToValueAtTime(.02,t+.005); hg.gain.exponentialRampToValueAtTime(.0001,t+.09);
      hg.connect(music);
      const h = ctx.createOscillator(); h.type='triangle'; h.frequency.value = highPattern[i%highPattern.length] ? 440 : 330;
      h.connect(hg); h.start(t); h.stop(t+.1);
    }
    if (combat && i % 8 === 4) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1500; f.Q.value=.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.022, t+.01); g.gain.exponentialRampToValueAtTime(.0001, t+.22);
      src.connect(f); f.connect(g); g.connect(music); src.start(t, Math.random()); src.stop(t+.25);
    }
  }

  function applyVolume() {
    if (!ready) return;
    const v = muted ? .0001 : Math.max(.0001, volume);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(v, ctx.currentTime, .04);
  }
  function setVolume(v) {
    volume = clamp(v, 0, 1);
    applyVolume();
  }
  function setMuted(m) {
    muted = !!m;
    applyVolume();
  }
  function isMuted() { return muted; }
  function setScene(s) {
    scene = s;
    if (!ready) return;
    const target = s === 'paused' ? .07 : s === 'menu' ? .17 : s === 'boss' ? .34 : .27;
    music.gain.setTargetAtTime(target, ctx.currentTime, .3);
    if (s !== 'paused') nextStep = Math.max(nextStep, ctx.currentTime + .08);
  }

  return {
    init, shoot, dryFire, reload, hit, kill, hurt, shieldHit, shieldBreak, enemyShoot, impact,
    explosion, pickup, jump, land, step, heartbeat, dash, grenadeThrow, spawn, waveStart, waveClear, victory, defeated,
    uiClick, uiHover, lowAmmo, warning, setVolume, setMuted, isMuted, setScene,
    get ready() { return ready; },
    get contextState() { return ctx ? ctx.state : 'none'; }
  };
})();
