/* ============================================================
   NEON BREACH — screens, HUD, settings, input and run transitions
   ============================================================ */
let announceTimeout = null, toastTimeout = null, hintTimeout = null;

function countAlive() {
  let n = 0;
  for (const e of G.enemies) if (!e.dead) n++;
  return n;
}
function currentEnemiesRemaining() {
  return countAlive() + G.waveQueue.length;
}

function updateHighScoreDisplays() {
  dom.menuHighScore.textContent = fmtInt(highScore);
  dom.highScoreHud.textContent = fmtInt(highScore);
}

/* ---------------- animated messages ---------------- */
function announce(kickerText, titleHtml, subText, style = '', duration = 2600) {
  clearTimeout(announceTimeout);
  dom.announcer.classList.remove('show', 'danger', 'success');
  if (style) dom.announcer.classList.add(style);
  dom.annKicker.textContent = kickerText;
  dom.annTitle.innerHTML = titleHtml;
  dom.annSub.textContent = subText || '';
  void dom.announcer.offsetWidth;
  dom.announcer.classList.add('show');
  announceTimeout = setTimeout(() => dom.announcer.classList.remove('show'), duration);
}
function toast(html, duration = 2300) {
  clearTimeout(toastTimeout);
  dom.toast.innerHTML = html;
  dom.toast.classList.add('show');
  toastTimeout = setTimeout(() => dom.toast.classList.remove('show'), duration);
}
function hitMarker(kind = 'hit') {
  const el = dom.hitmarker;
  el.classList.remove('hit', 'crit', 'kill');
  void el.offsetWidth;
  if (kind === 'head') el.classList.add('crit');
  if (kind === 'kill') el.classList.add('kill');
  el.classList.add('hit');
}
function addKillFeed(name, crit) {
  const row = document.createElement('div');
  row.className = 'kill-item' + (crit ? ' crit' : '');
  row.innerHTML = `<span class="kill-dot"></span><span>你</span><span class="kr">//</span><b>${name}</b>${crit ? '<span class="kr">· 暴击</span>' : ''}`;
  dom.killfeed.appendChild(row);
  while (dom.killfeed.children.length > 5) dom.killfeed.firstElementChild.remove();
  setTimeout(() => {
    row.classList.add('out');
    setTimeout(() => row.remove(), 400);
  }, 3300);
}
function clearMessages() {
  clearTimeout(announceTimeout); clearTimeout(toastTimeout); clearTimeout(hintTimeout);
  dom.announcer.classList.remove('show', 'danger', 'success');
  dom.toast.classList.remove('show');
  dom.killfeed.innerHTML = '';
  dom.announcer.classList.remove('show');
}

/* ---------------- wave / HUD state ---------------- */
function waveSegmentsHtml() {
  return WAVES.map((w, i) => {
    const isBoss = w.units.some(u => u[0] === 'boss');
    let cls = isBoss ? 'boss' : '';
    if (G.wave > i + 1) cls += ' done';
    else if (G.wave === i + 1) cls += ' active';
    return `<i class="${cls}"></i>`;
  }).join('');
}
function refreshWaveSegments() {
  dom.waveSegments.innerHTML = waveSegmentsHtml();
}
function setWaveHeader(waveIndex) {
  const def = WAVES[waveIndex - 1];
  dom.waveIndex.textContent = String(waveIndex).padStart(2, '0');
  if (def) {
    dom.waveName.textContent = def.name;
    dom.waveSub.textContent = `${def.en} / ASSAULT`;
  } else {
    dom.waveName.textContent = '待命';
    dom.waveSub.textContent = 'AWAITING SIGNAL';
  }
  refreshWaveSegments();
}
function syncSettingsUI() {
  dom.sensRange.value = settings.sensitivity;
  dom.sensValue.textContent = Number(settings.sensitivity).toFixed(2);
  dom.volRange.value = Math.round(settings.volume * 100);
  dom.volValue.textContent = Math.round(settings.volume * 100);
  dom.invertToggle.classList.toggle('on', settings.invertY);
  dom.invertToggle.setAttribute('aria-pressed', String(settings.invertY));
  dom.scanToggle.classList.toggle('on', settings.scanlines);
  dom.scanToggle.setAttribute('aria-pressed', String(settings.scanlines));
  dom.scanlinesEl.style.display = settings.scanlines ? '' : 'none';
  updateSoundUI();
}
function updateSoundUI() {
  dom.soundIconOn.classList.toggle('hidden', settings.muted);
  dom.soundIconOff.classList.toggle('hidden', !settings.muted);
}
function applyAudioSettings() {
  AUDIO.setVolume(settings.volume);
  AUDIO.setMuted(settings.muted);
  updateSoundUI();
}

function syncHUD() {
  const p = G.player;
  if (!G.started) return;
  dom.scoreValue.textContent = fmtInt(G.score);
  dom.highScoreHud.textContent = fmtInt(highScore);
  const alive = currentEnemiesRemaining();
  dom.enemiesLeft.textContent = String(alive).padStart(2, '0');
  dom.radarCount.textContent = String(countAlive()).padStart(2, '0');
  dom.hpValue.textContent = Math.max(0, Math.ceil(p.health));
  dom.hpBar.style.width = clamp(p.health / p.maxHealth * 100, 0, 100) + '%';
  dom.shieldValue.textContent = Math.max(0, Math.ceil(p.shield));
  dom.shieldBar.style.width = clamp(p.shield / p.maxShield * 100, 0, 100) + '%';
  dom.vitalsPanel.classList.toggle('danger', p.health < 32);
  document.body.classList.toggle('low-hp', p.health < 32 && G.state === 'playing');
  dom.ammoMag.textContent = String(p.mag).padStart(2, '0');
  dom.ammoMag.classList.toggle('low', p.mag <= 7 && p.mag > 0);
  dom.ammoMag.classList.toggle('empty', p.mag === 0);
  dom.weaponMode.textContent = p.reloading ? 'RELOADING' : (p.mag === 0 ? 'EMPTY' : (p.adsT > .55 ? 'STABILIZED' : 'READY'));
  dom.reloadTrack.classList.toggle('show', p.reloading);
  if (p.reloading) {
    dom.reloadFill.style.width = (clamp(1 - p.reloadTimer / RELOAD_TIME, 0, 1) * 100) + '%';
  } else {
    dom.reloadFill.style.width = '0%';
  }
  dom.crosshair.style.opacity = (G.state === 'dying' || G.state === 'victory') ? '0' : '';
  const showReloadHint = !p.reloading && p.mag <= 6 && G.state === 'playing';
  dom.reloadHint.classList.toggle('show', showReloadHint);
  dom.reloadHint.textContent = p.mag === 0 ? 'R · 弹匣已空' : 'R · 更换弹匣';
  const gap = 7 + G.currentSpread * 680;
  dom.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
  document.body.classList.toggle('ads', p.adsT > .55);

  // combo
  const active = G.combo > 1 && G.comboTimer > 0;
  dom.comboBadge.classList.toggle('show', active);
  if (active) {
    dom.comboValue.textContent = 'x' + comboMultiplier().toFixed(1);
    dom.comboMeter.style.transform = `scaleX(${clamp(G.comboTimer / 4, 0, 1)})`;
  }

  // grenades
  const g = p.grenades;
  dom.grenadeIcons.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const el = document.createElement('i');
    if (i < g) el.className = 'full';
    dom.grenadeIcons.appendChild(el);
  }

  // boss
  const boss = G.boss;
  if (boss && !boss.dead && G.wavePhase === 'boss') {
    dom.bossHud.classList.remove('hidden');
    const pct = clamp(boss.hp / boss.maxHp * 100, 0, 100);
    dom.bossFill.style.width = pct + '%';
    dom.bossPhase.textContent = 'PHASE ' + String(G.bossPhase || 1).padStart(2, '0');
  } else {
    dom.bossHud.classList.add('hidden');
  }

  // intermission countdown
  if (G.wavePhase === 'intermission') {
    dom.zoneTimer.classList.add('show');
    dom.zoneTimerValue.textContent = fmtTime(Math.max(0, G.waveTimer));
    dom.zoneTimerNext.textContent = G.wave >= WAVES.length ? '核心区域稳定' : `WAVE ${String(G.wave + 1).padStart(2,'0')} 即将抵达`;
  } else {
    dom.zoneTimer.classList.remove('show');
  }

  // pointer lock status
  const needsLock = G.state === 'playing' && !document.pointerLockElement && !G.debug;
  const delayDone = performance.now() - (G.startedAt || 0) > 850;
  if (needsLock && (G.lockFailed || delayDone || G.pointerEverLocked)) {
    if (!G.lockFailed) dom.pointerHint.textContent = '点击画面以锁定鼠标';
    dom.pointerHint.classList.add('show');
  } else {
    dom.pointerHint.classList.remove('show');
  }
}
function updatePauseStats() {
  dom.pauseWave.innerHTML = String(Math.max(1, G.wave)).padStart(2,'0') + ' <small>/05</small>';
  dom.pauseScore.textContent = fmtInt(G.score);
  dom.pauseKills.textContent = String(G.kills).padStart(2, '0');
}

/* ---------------- screen transitions ---------------- */
function hideAllScreens() {
  dom.start.classList.add('hidden');
  dom.pause.classList.add('hidden');
  dom.end.classList.add('hidden');
  dom.settings.classList.add('hidden');
}
function enablePointerFallback() {
  G.lockFailed = true;
  dom.pointerHint.textContent = '鼠标锁定不可用 · 移动鼠标瞄准 · 点击射击';
  dom.pointerHint.classList.add('show');
}
function requestPointerLock() {
  if (G.debug) return;
  if (document.pointerLockElement) return;
  G.lockRequested = true;
  try {
    const promise = dom.gl.requestPointerLock();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => enablePointerFallback());
    }
    setTimeout(() => {
      if (G.state === 'playing' && !document.pointerLockElement && G.lockRequested) enablePointerFallback();
    }, 900);
  } catch (e) {
    enablePointerFallback();
  }
}
function releasePointerLock() {
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch (e) {}
  }
}

function resetRunState() {
  G.player = makePlayer();
  G.enemies.length = 0;
  G.projectiles.length = 0;
  G.particles.length = 0;
  G.rings.length = 0;
  G.pickups.length = 0;
  G.grenades.length = 0;
  G.dangerZones.length = 0;
  G.tracers.length = 0;
  G.damageNumbers.length = 0;
  G.hurtArcs.length = 0;
  G.score = 0; G.kills = 0; G.runTime = 0; G.time = 0;
  G.wave = 0; G.wavePhase = 'pre'; G.waveTimer = 1.15; G.waveQueue = []; G.waveKills = 0;
  G.spawnTimer = 0; G.boss = null; G.bossPhase = 0; G.bossDeathTimer = 0; G.bossSummoned = [false,false];
  G.combo = 0; G.comboTimer = 0; G.maxMultiplier = 1;
  G.shake = 0; G.damageFlash = 0; G.hitstop = 0; G.deathTimer = 0; G.victoryTimer = 0;
  G.aimTarget = null; G.adsTarget = null; G.currentSpread = .012;
  G.pointerLocked = false; G.pointerEverLocked = false; G.lockFailed = false; G.startedAt = performance.now();
  G.lookSwayX = 0; G.lookSwayY = 0;
  G.lowAmmoWarned = false;
  G.input.fire = false; G.input.ads = false; G.input.keys = Object.create(null);
  G.lastPlayerPos = [0,0,24.5];
  G.runFinalized = false;
  G.deathCause = '';
  clearMessages();
  dom.damageFlash.style.opacity = '0';
  dom.scoreValue.textContent = '000000';
  dom.hpValue.textContent = '100'; dom.hpBar.style.width = '100%';
  dom.shieldValue.textContent = '50'; dom.shieldBar.style.width = '100%';
  dom.ammoMag.textContent = '30'; dom.reloadHint.classList.remove('show');
  dom.hitmarker.classList.remove('hit','crit','kill');
  dom.bossHud.classList.add('hidden');
  dom.zoneTimer.classList.remove('show');
  dom.killfeed.innerHTML = '';
  document.body.classList.remove('low-hp','ads');
  dom.crosshair.style.opacity = '';
  dom.screenFlash.classList.remove('flash');
  setWaveHeader(0);
  G.started = true;
  // clear nearby small props / player camera into place
  G.player.pos = [PLAYER_START.x, 0, PLAYER_START.z];
  G.player.yaw = PLAYER_START.yaw;
  beginWave(1);
}

function startGame(fromDebug = false) {
  if (!R.isReady) return;
  AUDIO.init();
  AUDIO.setMuted(settings.muted);
  AUDIO.setVolume(settings.volume);
  hideAllScreens();
  dom.boot.classList.add('done');
  document.body.classList.add('playing');
  document.body.classList.remove('low-hp');
  dom.hud.classList.remove('hidden');
  G.state = 'playing';
  G.started = true;
  resetRunState();
  G.state = 'playing';
  AUDIO.setScene('combat');
  updateHighScoreDisplays();
  if (!fromDebug) requestPointerLock();
  G.lastFrame = performance.now();
  if (!G.debug) {
    dom.pointerHint.classList.remove('show');
  }
}
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.fire = false;
  G.input.ads = false;
  G.player.ads = false;
  G.player.adsT = 0;
  updatePauseStats();
  dom.pause.classList.remove('hidden');
  document.body.classList.remove('playing');
  dom.pointerHint.classList.remove('show');
  AUDIO.setScene('paused');
  releasePointerLock();
}
function resumeGame() {
  if (G.state !== 'paused') return;
  dom.pause.classList.add('hidden');
  G.state = 'playing';
  G.lastFrame = performance.now();
  document.body.classList.add('playing');
  AUDIO.setScene(G.boss && !G.boss.dead ? 'boss' : 'combat');
  requestPointerLock();
}
function goToMenu() {
  G.state = 'menu';
  G.started = false;
  G.input.fire = false;
  G.input.ads = false;
  G.enemies.length = 0;
  G.projectiles.length = 0;
  G.grenades.length = 0;
  G.dangerZones.length = 0;
  G.pickups.length = 0;
  G.boss = null;
  releasePointerLock();
  hideAllScreens();
  dom.hud.classList.add('hidden');
  dom.bossHud.classList.add('hidden');
  dom.start.classList.remove('hidden');
  document.body.classList.remove('playing','low-hp','ads');
  document.body.style.cursor = '';
  AUDIO.setScene('menu');
  clearMessages();
  updateHighScoreDisplays();
  G.menuTime = 0;
}
function prepareMenu() {
  G.state = 'menu';
  G.started = false;
  dom.boot.classList.add('done');
  hideAllScreens();
  dom.start.classList.remove('hidden');
  dom.hud.classList.add('hidden');
  updateHighScoreDisplays();
  refreshWaveSegments();
  AUDIO.setScene('menu');
}

function comboMultiplier() {
  return Math.min(5, 1 + G.combo * .15);
}
function rankFor(win) {
  const acc = G.player.shots ? G.player.hits / G.player.shots : 0;
  const n = G.score + (win ? 2500 : 0) + Math.round(acc * 2600);
  if (win && n >= 21000) return 'S';
  if (n >= 15000) return 'A';
  if (n >= 9000) return 'B';
  if (n >= 4500) return 'C';
  return 'D';
}
function finishRun(win, cause) {
  if (G.runFinalized) return;
  G.runFinalized = true;
  G.state = 'ended';
  G.input.fire = false; G.input.ads = false;
  document.body.classList.remove('playing','low-hp','ads');
  dom.hud.classList.add('hidden');
  dom.pointerHint.classList.remove('show');
  releasePointerLock();
  clearMessages();
  const acc = G.player.shots > 0 ? Math.round(G.player.hits / G.player.shots * 100) : 0;
  const rank = rankFor(win);
  const oldHigh = highScore;
  highScore = Math.max(highScore, G.score);
  saveGame();
  updateHighScoreDisplays();

  dom.end.classList.remove('hidden');
  dom.end.classList.toggle('failure', !win);
  dom.endKicker.textContent = win ? 'OPERATION COMPLETE / 行动完成' : 'SIGNAL LOST / 信号中断';
  dom.endTitleMain.textContent = win ? '区域' : '信号';
  dom.endTitleOutline.textContent = win ? '净化' : '中断';
  if (win) {
    dom.endCause.innerHTML = '典狱长核心已离线。竞技场重新归于寂静。<b>任务完成。</b>';
    dom.endFoot.textContent = highScore > oldHigh ? '新纪录写入战术终端 · NEON BREACH // SECTOR 07' : '战术记录已同步 · NEON BREACH // SECTOR 07';
  } else {
    dom.endCause.innerHTML = `${G.deathCause || '生命体征归零'}。<b>连接永久中断。</b>`;
    dom.endFoot.textContent = G.wave >= 3 ? '警告：竞技场仍处于失控状态' : '建议：保持移动，利用掩体等待护盾再生';
  }
  dom.endScore.textContent = fmtInt(G.score);
  dom.endRank.textContent = rank;
  dom.endRank.style.color = win ? '' : 'var(--pink)';
  dom.endKills.textContent = String(G.kills);
  dom.endHeadshots.textContent = String(G.player.headshots);
  dom.endAccuracy.textContent = acc + '%';
  dom.endWave.textContent = `${Math.max(1, G.wave)} / 5`;
  dom.endTime.textContent = fmtTime(G.runTime);
  dom.endCombo.textContent = 'x' + G.maxMultiplier.toFixed(1);
  dom.highScoreHud.textContent = fmtInt(highScore);
  AUDIO.setScene('menu');
  if (win) AUDIO.victory(); else AUDIO.defeated();
}

/* ---------------- settings / sound ---------------- */
function openSettings() {
  syncSettingsUI();
  dom.settings.classList.remove('hidden');
  if (G.state === 'playing') pauseGame();
}
function closeSettings() {
  dom.settings.classList.add('hidden');
}
function toggleMute() {
  settings.muted = !settings.muted;
  saveGame();
  AUDIO.init();
  AUDIO.setMuted(settings.muted);
  updateSoundUI();
  if (G.state === 'playing' || G.state === 'paused') toast(settings.muted ? '音频通道 <b>已静音</b>' : '音频通道 <b>已恢复</b>', 1500);
}
function resetSettings() {
  settings.sensitivity = defaultSettings.sensitivity;
  settings.volume = defaultSettings.volume;
  settings.invertY = defaultSettings.invertY;
  settings.muted = false;
  settings.scanlines = true;
  saveGame();
  applyAudioSettings();
  syncSettingsUI();
  AUDIO.uiClick();
}

/* ---------------- input ---------------- */
function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
function bindInput() {
  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (isTypingTarget(e.target)) return;
    if (['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','KeyR','KeyG','KeyM','Escape'].includes(code)) {
      if (G.state === 'playing') e.preventDefault();
    }
    if (code === 'Escape') {
      if (!dom.settings.classList.contains('hidden')) { closeSettings(); return; }
      if (G.state === 'playing') { pauseGame(); return; }
      if (G.state === 'paused') { resumeGame(); return; }
      return;
    }
    if (G.state !== 'playing') {
      if (code === 'KeyM') toggleMute();
      return;
    }
    G.input.keys[code] = true;
    if (e.repeat) return;
    if (code === 'Space') {
      G.player.jumpBuffer = .14;
    } else if (code === 'KeyR') {
      startReload();
    } else if (code === 'KeyG') {
      throwGrenade();
    } else if (code === 'KeyM') {
      toggleMute();
    }
  });
  window.addEventListener('keyup', (e) => {
    G.input.keys[e.code] = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (G.state !== 'playing') return;
    if (!document.pointerLockElement && !G.lockFailed) return;
    const sens = .00205 * settings.sensitivity * (G.player.adsT > .55 ? .7 : 1);
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    G.player.yaw += mx * sens;
    G.player.pitch += (settings.invertY ? my : -my) * sens;
    G.player.pitch = clamp(G.player.pitch, -1.45, 1.45);
    G.lookSwayX = clamp(G.lookSwayX + mx * .00055, -.035, .035);
    G.lookSwayY = clamp(G.lookSwayY + my * .00055, -.035, .035);
    G.player.yaw = ((G.player.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
  });
  document.addEventListener('mousedown', (e) => {
    if (G.state !== 'playing') return;
    if (!document.pointerLockElement && !G.debug && !G.lockFailed) {
      requestPointerLock();
      return;
    }
    if (G.settings && !dom.settings.classList.contains('hidden')) return;
    if (e.button === 0) {
      G.input.fire = true;
      attemptFire();
    } else if (e.button === 2) {
      G.input.ads = true;
      e.preventDefault();
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) { G.input.fire = false; G.input.dryLatch = false; }
    if (e.button === 2) G.input.ads = false;
  });
  document.addEventListener('contextmenu', (e) => {
    if (G.state === 'playing' || G.state === 'paused') e.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === dom.gl) {
      G.pointerLocked = true;
      G.pointerEverLocked = true;
      G.lockFailed = false;
      dom.pointerHint.classList.remove('show');
    } else {
      const was = G.pointerLocked;
      G.pointerLocked = false;
      if (was && G.state === 'playing') pauseGame();
    }
  });
  document.addEventListener('pointerlockerror', () => {
    enablePointerFallback();
  });
  window.addEventListener('blur', () => {
    G.input.keys = Object.create(null);
    if (G.state === 'playing' && !G.debug) {
      // pointerlockchange will cover the normal case; this covers focus loss
      pauseGame();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') pauseGame();
  });
  dom.gl.addEventListener('click', () => {
    if (G.state === 'playing' && !document.pointerLockElement) requestPointerLock();
  });
}

/* ---------------- UI wiring ---------------- */
function bindUI() {
  dom.startBtn.addEventListener('click', () => { AUDIO.init(); AUDIO.uiClick(); startGame(); });
  dom.resumeBtn.addEventListener('click', () => { AUDIO.init(); AUDIO.uiClick(); resumeGame(); });
  dom.restartFromPause.addEventListener('click', () => { AUDIO.uiClick(); hideAllScreens(); startGame(); });
  dom.menuFromPause.addEventListener('click', () => { AUDIO.uiClick(); goToMenu(); });
  dom.retryBtn.addEventListener('click', () => { AUDIO.uiClick(); hideAllScreens(); startGame(); });
  dom.menuFromEnd.addEventListener('click', () => { AUDIO.uiClick(); goToMenu(); });
  dom.soundBtn.addEventListener('click', () => { AUDIO.init(); AUDIO.uiClick(); toggleMute(); });
  dom.openSettings = document.querySelectorAll('.open-settings');
  for (const b of document.querySelectorAll('.open-settings')) {
    b.addEventListener('click', () => { AUDIO.init(); AUDIO.uiClick(); openSettings(); });
  }
  dom.closeSettings.addEventListener('click', () => { AUDIO.uiClick(); closeSettings(); });
  dom.doneSettings.addEventListener('click', () => { AUDIO.uiClick(); closeSettings(); });
  dom.settings.addEventListener('mousedown', (e) => { if (e.target === dom.settings) closeSettings(); });
  dom.sensRange.addEventListener('input', () => {
    settings.sensitivity = parseFloat(dom.sensRange.value);
    dom.sensValue.textContent = settings.sensitivity.toFixed(2);
    saveGame();
  });
  dom.volRange.addEventListener('input', () => {
    settings.volume = parseFloat(dom.volRange.value) / 100;
    dom.volValue.textContent = Math.round(settings.volume * 100);
    AUDIO.init();
    AUDIO.setVolume(settings.volume);
    saveGame();
  });
  dom.invertToggle.addEventListener('click', () => {
    settings.invertY = !settings.invertY;
    dom.invertToggle.classList.toggle('on', settings.invertY);
    saveGame();
    AUDIO.uiClick();
  });
  dom.scanToggle.addEventListener('click', () => {
    settings.scanlines = !settings.scanlines;
    dom.scanToggle.classList.toggle('on', settings.scanlines);
    dom.scanlinesEl.style.display = settings.scanlines ? '' : 'none';
    saveGame();
    AUDIO.uiClick();
  });
  dom.resetSettings.addEventListener('click', resetSettings);
  for (const el of document.querySelectorAll('button')) {
    el.addEventListener('mouseenter', () => { if (AUDIO.ready) AUDIO.uiHover(); });
  }
  window.addEventListener('resize', () => R.resize());
  window.addEventListener('pagehide', () => saveGame());
}
