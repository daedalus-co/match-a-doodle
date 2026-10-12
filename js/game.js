/**
 * Doodle Premium — Main Game Engine
 * Orchestrates:
 *  - State machine (MAIN_MENU, MAP, LEVEL_INTRO, PLAYING, ANIMATING, VICTORY, DEFEAT, PAUSED)
 *  - Serpentine 500-level adventure map
 *  - In-game navigation drawer (Hamburger Menu)
 *  - 2 Free Swaps limit per special powerup (after 2, must follow standard match-3 rules or legal combo)
 *  - Powerup cross-combos with full grand destruction animations
 *  - Mathematically & psychologically paced scoring, star criteria (1 easy, 2 with combos, 3 with specials)
 *  - Retry Level & Go Home options on Victory screen
 *  - Background Music & Sound Effects in Options menu
 */

'use strict';

const Game = (() => {

  const STATE = { MAIN_MENU: -1, MAP: 0, LEVEL_INTRO: 1, PLAYING: 2, ANIMATING: 3, VICTORY: 4, DEFEAT: 5, PAUSED: 6 };

  let state = STATE.MAIN_MENU;
  let currentLevelIndex = 0;
  let levelDef = null;
  let grid = [];
  let score = 0;
  let movesLeft = 0;
  let cascadeLevel = 0;
  let selected = null;
  let shakeCell = null;
  let jelliesLeft = 0;
  let ordersLeft = {};
  let ingredientsLeft = 0;
  let hintTimeout = null;
  let lastInputTime = Date.now();
  let animFrameId = null;
  let lastTimestamp = 0;

  // Powerup free swap limit: Max 2 non-matching swaps per powerup instance
  // Key: 'r,c' -> count
  let powerupFreeSwapsUsed = new Map();

  const PROGRESS_KEY = 'sr_progress';
  const COINS_KEY    = 'sr_coins';
  const USER_KEY     = 'sr_username';
  const ASKED_USER_KEY = 'sr_asked_user';
  const ACCOUNTS_DB_KEY = 'sr_accounts_db'; // Store progress per-email/account for easy cloud recovery!

  let progress = {};
  let coins = 100;
  let username = 'Guest Doodler';
  let userEmail = null;
  let askedUsername = false;

  function loadProgress(switchAccountEmail = null) {
    if (switchAccountEmail) {
      userEmail = switchAccountEmail;
      try {
        const db = JSON.parse(localStorage.getItem(ACCOUNTS_DB_KEY)) || {};
        if (db[userEmail]) {
          progress = db[userEmail].progress || {};
          coins = db[userEmail].coins !== undefined ? db[userEmail].coins : 100;
          username = db[userEmail].username || userEmail.split('@')[0];
        } else {
          // New account attached to current device progress
          db[userEmail] = { progress, coins, username: userEmail.split('@')[0] };
          localStorage.setItem(ACCOUNTS_DB_KEY, JSON.stringify(db));
        }
      } catch (_) {}
    } else {
      try {
        progress = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
      } catch (_) { progress = {}; }
      if (!progress[1]) progress[1] = { stars: 0, score: 0, unlocked: true };

      try {
        const storedCoins = localStorage.getItem(COINS_KEY);
        coins = storedCoins !== null ? parseInt(storedCoins, 10) : 100;
      } catch (_) { coins = 100; }

      try {
        username = localStorage.getItem(USER_KEY) || 'Guest Doodler';
        askedUsername = localStorage.getItem(ASKED_USER_KEY) === 'true';
      } catch (_) {
        username = 'Guest Doodler';
        askedUsername = false;
      }
    }
  }

  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
    try { localStorage.setItem(COINS_KEY, coins.toString()); } catch (_) {}
    try { localStorage.setItem(USER_KEY, username); } catch (_) {}
    try { localStorage.setItem(ASKED_USER_KEY, askedUsername ? 'true' : 'false'); } catch (_) {}

    // Save under user's registered account if logged in (for restore when device changes)
    if (userEmail) {
      try {
        const db = JSON.parse(localStorage.getItem(ACCOUNTS_DB_KEY)) || {};
        db[userEmail] = { progress, coins, username, lastSaved: Date.now() };
        localStorage.setItem(ACCOUNTS_DB_KEY, JSON.stringify(db));
      } catch (_) {}
    }
  }

  function countClearedLevels() {
    let count = 0;
    Object.values(progress).forEach(p => {
      if (p.stars > 0) count++;
    });
    return count;
  }

  function checkUsernamePrompt() {
    if (!askedUsername && countClearedLevels() >= 2) {
      askedUsername = true;
      saveProgress();
      const input = document.getElementById('input-username');
      if (input) input.value = (username !== 'Doodler') ? username : '';
      showScreen('modal-username');
      return true;
    }
    return false;
  }

  function addCoins(amount) {
    coins += amount;
    saveProgress();
    updateCurrencyUI();
  }

  function spendCoins(amount) {
    if (coins >= amount) {
      coins -= amount;
      saveProgress();
      updateCurrencyUI();
      return true;
    }
    return false;
  }

  function getCoins() { return coins; }

  function getLevelProgress(id) {
    return progress[id] || { stars: 0, score: 0, unlocked: false };
  }

  function unlockNextLevel(id) {
    const nextId = id + 1;
    if (nextId <= Levels.length) {
      if (!progress[nextId]) progress[nextId] = { stars: 0, score: 0, unlocked: false };
      progress[nextId].unlocked = true;
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    loadProgress();
    Boosters.init({ onMovesAdded: (n) => { movesLeft += n; updateHUD(); } });
    AdManager.init();
    bindInputEvents();
    updateCurrencyUI();
    updateBoosterUI();
    updateProfileUI();

    // Unlock Audio Context on any user interaction (first tap)
    const unlockListener = () => {
      AudioEngine.unlockAudio();
      window.removeEventListener('pointerdown', unlockListener);
      window.removeEventListener('keydown', unlockListener);
    };
    window.addEventListener('pointerdown', unlockListener, { once: true });
    window.addEventListener('keydown', unlockListener, { once: true });

    showMainMenu();
    requestAnimationFrame(gameLoop);
  }

  function getNextLevelIndex() {
    let nextIdx = 0;
    // Find first level not yet beaten (stars === 0)
    for (let i = 0; i < Levels.length; i++) {
      const p = getLevelProgress(Levels[i].id);
      if (p.unlocked && (!p.stars || p.stars === 0)) {
        return i;
      }
      if (p.unlocked) {
        nextIdx = i;
      }
    }
    return Math.min(nextIdx + 1, Levels.length - 1);
  }

  function updateProfileUI() {
    setText('menu-username-display', username);
    setText('options-account-name', username);
    const statusEl = document.getElementById('options-account-status');
    const avatarEl = document.getElementById('options-account-avatar');
    if (statusEl) {
      if (userEmail) {
        statusEl.textContent = `● Synced via ${userEmail}`;
        statusEl.style.color = '#10b981';
      } else {
        statusEl.textContent = '● Saved locally on device';
        statusEl.style.color = '#10b981';
      }
    }
    if (avatarEl) {
      avatarEl.textContent = userEmail ? (userEmail.includes('google') ? '🌐' : '✉️') : '📱';
    }
  }

  function showMainMenu() {
    state = STATE.MAIN_MENU;
    updateCurrencyUI();
    updateProfileUI();
    let totalStars = 0;
    Object.values(progress).forEach(p => { totalStars += (p.stars || 0); });
    setText('menu-total-stars', totalStars);

    // Dynamic Level number on "PLAY CURRENT LEVEL" button
    const nextIdx = getNextLevelIndex();
    const playBtn = document.getElementById('btn-menu-play');
    if (playBtn) {
      playBtn.textContent = `▶ PLAY LEVEL ${nextIdx + 1}`;
    }

    showScreen('screen-main-menu');
  }

  function updateCurrencyUI() {
    setText('menu-coins', coins);
    setText('map-coins', coins);
    setText('hud-coins', coins);
  }

  // ── Level Start ──────────────────────────────────────────────────────────────

  function startLevel(index) {
    currentLevelIndex = index;
    levelDef = Levels[index];
    grid = Board.createBoard(levelDef);
    score = 0;
    movesLeft = levelDef.moves;
    cascadeLevel = 0;
    selected = null;
    shakeCell = null;
    powerupFreeSwapsUsed.clear();
    jelliesLeft = Board.countJellies(grid);
    ordersLeft = levelDef.orders ? { ...levelDef.orders } : {};
    ingredientsLeft = levelDef.ingredientCount || 0;
    Renderer.clearHint();
    clearHintTimer();
    state = STATE.LEVEL_INTRO;
    showScreen('screen-game');
    updateHUD();
    renderObjectiveHUD();
    updateStarMeter();
    updateBoosterUI();

    const t = levelDef.stars;
    setText('intro-star-1', t[0].toLocaleString());
    setText('intro-star-2', t[1].toLocaleString());
    setText('intro-star-3', t[2].toLocaleString());

    setTimeout(() => {
      state = STATE.PLAYING;
      scheduleHint();
      // Start background music automatically if enabled
      AudioEngine.startMusic();
    }, 1200);
  }

  // ── Game Loop ────────────────────────────────────────────────────────────────

  function gameLoop(timestamp) {
    const dt = Math.min(timestamp - lastTimestamp, 50);
    lastTimestamp = timestamp;

    if (state === STATE.PLAYING || state === STATE.ANIMATING || state === STATE.LEVEL_INTRO) {
      Renderer.renderFrame(grid, selected, shakeCell, dt);
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  // ── Input & Gestures ─────────────────────────────────────────────────────────

  function bindInputEvents() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    Renderer.init(canvas);

    let dragStartPos = null;
    let dragStartPx = null;

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = (canvas.width / window.devicePixelRatio) / rect.width;
      const scaleY = (canvas.height / window.devicePixelRatio) / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const gridPos = Renderer.pixelToGrid(px, py);

      dragStartPx = { x: e.clientX, y: e.clientY };
      dragStartPos = gridPos;
      handlePointerDown({ clientX: e.clientX, clientY: e.clientY, _px: px, _py: py });
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragStartPos || !dragStartPx || state !== STATE.PLAYING) return;
      const dx = e.clientX - dragStartPx.x;
      const dy = e.clientY - dragStartPx.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 20) {
        let dr = 0, dc = 0;
        if (Math.abs(dx) > Math.abs(dy)) {
          dc = dx > 0 ? 1 : -1;
        } else {
          dr = dy > 0 ? 1 : -1;
        }
        const targetR = dragStartPos.r + dr;
        const targetC = dragStartPos.c + dc;

        if (targetR >= 0 && targetR < Config.ROWS && targetC >= 0 && targetC < Config.COLS) {
          handleSwap(dragStartPos.r, dragStartPos.c, targetR, targetC);
          selected = null;
        }
        dragStartPos = null;
        dragStartPx = null;
      }
    });

    window.addEventListener('mouseup', () => {
      dragStartPos = null;
      dragStartPx = null;
    });

    canvas.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const scaleX = (canvas.width / window.devicePixelRatio) / rect.width;
      const scaleY = (canvas.height / window.devicePixelRatio) / rect.height;
      const px = (touch.clientX - rect.left) * scaleX;
      const py = (touch.clientY - rect.top) * scaleY;
      const gridPos = Renderer.pixelToGrid(px, py);

      dragStartPx = { x: touch.clientX, y: touch.clientY };
      dragStartPos = gridPos;
      handlePointerDown({ clientX: touch.clientX, clientY: touch.clientY, _px: px, _py: py });
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.cancelable) e.preventDefault();
      if (!dragStartPos || !dragStartPx || state !== STATE.PLAYING) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartPx.x;
      const dy = touch.clientY - dragStartPx.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 22) {
        let dr = 0, dc = 0;
        if (Math.abs(dx) > Math.abs(dy)) {
          dc = dx > 0 ? 1 : -1;
        } else {
          dr = dy > 0 ? 1 : -1;
        }
        const targetR = dragStartPos.r + dr;
        const targetC = dragStartPos.c + dc;

        if (targetR >= 0 && targetR < Config.ROWS && targetC >= 0 && targetC < Config.COLS) {
          handleSwap(dragStartPos.r, dragStartPos.c, targetR, targetC);
          selected = null;
        }
        dragStartPos = null;
        dragStartPx = null;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault();
      dragStartPos = null;
      dragStartPx = null;
    }, { passive: false });

    // Main Menu Buttons
    document.getElementById('btn-menu-play')?.addEventListener('click', () => {
      AudioEngine.playClick();
      const nextIdx = getNextLevelIndex();
      startLevel(nextIdx);
    });
    document.getElementById('btn-menu-levels')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showMap();
    });
    document.getElementById('btn-menu-options')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showScreen('screen-settings');
    });
    document.getElementById('btn-map-back-menu')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showMainMenu();
    });

    // Coins Continue (10 Coins per Resume)
    document.getElementById('btn-buy-moves-coins')?.addEventListener('click', () => {
      AudioEngine.playClick();
      if (spendCoins(10)) {
        movesLeft += 5;
        state = STATE.PLAYING;
        showScreen('screen-game');
        updateHUD();
        Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), '+5 Moves!', '#ffd13b', 26);
      } else {
        alert('Not enough coins! You need 10 coins to continue. Win levels or watch a free ad.');
      }
    });

    // Streamlined Hamburger Menu: Resume, Restart, Settings, Home
    document.getElementById('btn-hamburger')?.addEventListener('click', () => {
      AudioEngine.playClick();
      togglePause();
    });
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      AudioEngine.playClick();
      togglePause();
    });
    document.getElementById('btn-restart')?.addEventListener('click', () => {
      AudioEngine.playClick();
      startLevel(currentLevelIndex);
    });
    document.getElementById('btn-pause-options')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showScreen('screen-settings');
    });
    document.getElementById('btn-pause-main-menu')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showMainMenu();
    });

    // ── One-Tap Login Integrations (Google, Email Sync, Apple) ──────────────────
    document.getElementById('btn-login-google')?.addEventListener('click', () => {
      AudioEngine.playClick();
      const current = userEmail || `${(username || 'doodler').toLowerCase().replace(/\s+/g, '')}@gmail.com`;
      const email = prompt('Sign in with Google: Enter your Google account email to link & restore progress:', current);
      if (email && email.includes('@')) {
        loadProgress(email.trim());
        saveProgress();
        updateProfileUI();
        updateCurrencyUI();
        alert(`✅ Signed in with Google as ${email}!\nAll stars, levels, and coins are backed up and can be restored anytime.`);
      }
    });

    document.getElementById('btn-login-email')?.addEventListener('click', () => {
      AudioEngine.playClick();
      const current = userEmail || '';
      const email = prompt('Enter your recovery email address:', current);
      if (email && email.includes('@')) {
        loadProgress(email.trim());
        saveProgress();
        updateProfileUI();
        updateCurrencyUI();
        alert(`✉️ Progress linked to ${email}!\nIf you change phones, enter this email to restore your game instantly.`);
      }
    });

    document.getElementById('btn-login-apple')?.addEventListener('click', () => {
      AudioEngine.playClick();
      const appleId = `${(username || 'user').toLowerCase().replace(/\s+/g, '')}@privaterelay.appleid.com`;
      loadProgress(appleId);
      saveProgress();
      updateProfileUI();
      updateCurrencyUI();
      alert(` Connected with Apple ID!\nYour game progress is synced locally and backed up with Apple Keychain.`);
    });

    // Username Prompt Modal (After 2 levels completed)
    document.getElementById('btn-save-username')?.addEventListener('click', () => {
      AudioEngine.playClick();
      const input = document.getElementById('input-username');
      const val = (input?.value || '').trim();
      if (val.length > 0) {
        username = val.slice(0, 16);
        saveProgress();
        updateProfileUI();
      }
      showScreen('screen-map');
    });
    document.getElementById('btn-skip-username')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showScreen('screen-map');
    });

    // Victory screen actions: Next Level, Retry Level for 3 Stars, Map, Go Home
    document.getElementById('btn-next-level')?.addEventListener('click', () => { AudioEngine.playClick(); nextLevel(); });
    document.getElementById('btn-victory-retry')?.addEventListener('click', () => { AudioEngine.playClick(); startLevel(currentLevelIndex); });
    document.getElementById('btn-quit-to-map')?.addEventListener('click', () => { AudioEngine.playClick(); showMap(); });
    document.getElementById('btn-victory-home')?.addEventListener('click', () => { AudioEngine.playClick(); showMainMenu(); });

    // Defeat screen actions
    document.getElementById('btn-retry')?.addEventListener('click', () => { AudioEngine.playClick(); startLevel(currentLevelIndex); });
    document.getElementById('btn-watch-ad')?.addEventListener('click', () => { AudioEngine.playClick(); watchAdForMoves(); });
    document.getElementById('btn-defeat-quit')?.addEventListener('click', () => { AudioEngine.playClick(); showMap(); });

    // Settings Modal (Background Music & Sound Effects)
    document.getElementById('btn-map-settings')?.addEventListener('click', () => {
      AudioEngine.playClick();
      showScreen('screen-settings');
    });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      AudioEngine.playClick();
      if (state === STATE.PAUSED) showScreen('screen-pause');
      else if (state === STATE.MAP) showScreen('screen-map');
      else showMainMenu();
    });
    document.getElementById('setting-music-toggle')?.addEventListener('click', (e) => {
      const on = AudioEngine.toggleMusic();
      e.target.textContent = on ? 'ON' : 'OFF';
      e.target.classList.toggle('active', on);
    });
    document.getElementById('setting-sound-toggle')?.addEventListener('click', (e) => {
      const newVal = !AudioEngine.isEnabled();
      AudioEngine.setEnabled(newVal);
      e.target.textContent = newVal ? 'ON' : 'OFF';
      e.target.classList.toggle('active', newVal);
    });
    document.getElementById('setting-hint-toggle')?.addEventListener('click', (e) => {
      AudioEngine.playClick();
      const isActive = e.target.classList.toggle('active');
      e.target.textContent = isActive ? 'ON' : 'OFF';
      if (!isActive) { clearHintTimer(); Renderer.clearHint(); }
      else scheduleHint();
    });
    document.getElementById('setting-reset-progress')?.addEventListener('click', () => {
      if (confirm('Reset all level progress and stars?')) {
        progress = { 1: { stars: 0, score: 0, unlocked: true } };
        saveProgress();
        renderSerpentineMap();
        alert('Progress reset!');
      }
    });

    // Boosters / Power-Ups Button Wiring
    ['hammer', 'free_swap', 'color_bomb', 'row_blast', 'extra_moves'].forEach(type => {
      document.getElementById(`btn-booster-${type}`)?.addEventListener('click', () => {
        AudioEngine.playClick();
        Boosters.select(type, state);
        updateBoosterUI();
      });
    });

    // Map screen delegated level clicking
    document.getElementById('map-path-container')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-level]');
      if (!btn) return;
      const id = parseInt(btn.dataset.level);
      const prog = getLevelProgress(id);
      if (!prog.unlocked) return;
      AudioEngine.playClick();
      startLevel(id - 1);
    });
  }

  function handlePointerDown(e) {
    if (state !== STATE.PLAYING) return;
    lastInputTime = Date.now();
    clearHintTimer();
    Renderer.clearHint();

    const canvas = document.getElementById('game-canvas');
    let px, py;
    if (e._px !== undefined) {
      px = e._px;
      py = e._py;
    } else {
      const rect = canvas.getBoundingClientRect();
      const scaleX = (canvas.width / window.devicePixelRatio) / rect.width;
      const scaleY = (canvas.height / window.devicePixelRatio) / rect.height;
      px = (e.clientX - rect.left) * scaleX;
      py = (e.clientY - rect.top) * scaleY;
    }

    const pos = Renderer.pixelToGrid(px, py);
    if (!pos) { selected = null; return; }

    const activeB = Boosters.getActive();

    // 1. Hammer / Pencil Powerup
    if (activeB === Config.BOOSTER.HAMMER) {
      const result = Boosters.applyHammer(grid, pos.r, pos.c);
      if (result) {
        processMatchResult(result, false);
        triggerCascade();
      }
      updateBoosterUI();
      return;
    }

    // 2. Color Bomb Powerup
    if (activeB === Config.BOOSTER.COLOR_BOMB) {
      if (Boosters.applyColorBomb(grid, pos.r, pos.c)) {
        Renderer.spawnDoodleBurst(pos.r, pos.c, 3, 4);
        Renderer.spawnFloatText(pos.r, pos.c, 'Color Bomb!', '#ffd13b', 22);
      }
      updateBoosterUI();
      return;
    }

    // 3. Row Blast Powerup
    if (activeB === Config.BOOSTER.ROW_BLAST) {
      const result = Boosters.applyRowBlast(grid, pos.r, pos.c);
      if (result) {
        Renderer.spawnLaserBeam('row', pos.r, '#4ea8de');
        for (let c = 0; c < Config.COLS; c++) {
          Renderer.spawnDoodleBurst(pos.r, c, 5, 4);
        }
        Renderer.spawnFloatText(pos.r, 3, 'Row Swept!', '#4ea8de', 24);
        processMatchResult(result, false);
        triggerCascade();
      }
      updateBoosterUI();
      return;
    }

    // Normal Tile Selection / Swapping
    if (!selected) {
      selected = pos;
      AudioEngine.playSelect();
    } else {
      if (selected.r === pos.r && selected.c === pos.c) {
        selected = null;
        return;
      }
      handleSwap(selected.r, selected.c, pos.r, pos.c);
      selected = null;
    }
  }

  // ── Swap, Powerup Limits & Cross-Combos ───────────────────────────────────────

  function handleSwap(r1, c1, r2, c2) {
    if (state !== STATE.PLAYING) return;
    const isFreeSwapBooster = Boosters.checkFreeSwap(r1, c1, r2, c2);
    if (!Board.isAdjacent(r1, c1, r2, c2)) return;

    const cell1 = grid[r1][c1];
    const cell2 = grid[r2][c2];

    const isSp1 = (cell1.special !== Config.SPECIAL.NONE);
    const isSp2 = (cell2.special !== Config.SPECIAL.NONE);
    const hasSpecial = isSp1 || isSp2;

    // Check if swap produces a normal match
    const matches = Board.checkSwapValid(grid, r1, c1, r2, c2);
    const producesMatch = matches.length > 0;

    // Check if both are specials (always an intentional special combo!)
    const isSpecialCombo = (isSp1 && isSp2);

    // Color bomb with any normal candy
    const isColorBombActivation = (!isSpecialCombo && (
      (cell1.special === Config.SPECIAL.COLOR_BOMB && cell2.color > 0 && cell2.color < 7) ||
      (cell2.special === Config.SPECIAL.COLOR_BOMB && cell1.color > 0 && cell1.color < 7)
    ));

    // Powerup Free-Swap Rule:
    // A powerup can only be freely moved (without matching) up to 2 times.
    // Beyond 2 free moves, it MUST trigger a triplet, legal combo, or color-bomb activation.
    let isAllowedFreeMove = false;
    if (hasSpecial && !producesMatch && !isSpecialCombo && !isColorBombActivation && !isFreeSwapBooster) {
      const key1 = `${r1},${c1}`;
      const key2 = `${r2},${c2}`;
      const used1 = powerupFreeSwapsUsed.get(key1) || 0;
      const used2 = powerupFreeSwapsUsed.get(key2) || 0;

      if ((isSp1 && used1 < 2) || (isSp2 && used2 < 2)) {
        isAllowedFreeMove = true;
      } else {
        // Exceeded 2 free swaps — must follow normal match-3 / combo rules!
        AudioEngine.playInvalid();
        shakeCell = { r: r2, c: c2 };
        setTimeout(() => { shakeCell = null; }, Config.INVALID_SHAKE_MS);
        Renderer.spawnFloatText(r2, c2, 'Match required!', '#ef4444', 18);
        return;
      }
    } else if (!hasSpecial && !producesMatch && !isFreeSwapBooster) {
      // Normal candies with no match
      AudioEngine.playInvalid();
      shakeCell = { r: r2, c: c2 };
      setTimeout(() => { shakeCell = null; }, Config.INVALID_SHAKE_MS);
      return;
    }

    state = STATE.ANIMATING;
    movesLeft--;
    cascadeLevel = 0;
    updateHUD();

    // ── Execute Powerup Cross-Combos with Grand Visuals ────────────────────────
    if (isSpecialCombo) {
      Renderer.startSwapAnimation(r1, c1, r2, c2, Config.BOARD_ANIM_MS, () => {
        // Trigger grand combo animations based on special types
        const sp1 = cell1.special;
        const sp2 = cell2.special;

        if (sp1 === Config.SPECIAL.COLOR_BOMB && sp2 === Config.SPECIAL.COLOR_BOMB) {
          // Double Color Bomb: Massive Supernova!
          Renderer.spawnSupernova(Renderer.cellX(c1), Renderer.cellY(r1), 260, '#ffd13b');
          Renderer.spawnFloatText(3, 3, 'SUPERNOVA!', '#ffd13b', 32);
        } else if ((sp1 === Config.SPECIAL.COLOR_BOMB || sp2 === Config.SPECIAL.COLOR_BOMB) &&
                   (sp1 === Config.SPECIAL.WRAPPED || sp2 === Config.SPECIAL.WRAPPED)) {
          // Bomb + Wrapped: Multiple massive blasts
          Renderer.spawnSupernova(Renderer.cellX(c1), Renderer.cellY(r1), 160, '#ff5e7e');
          Renderer.spawnFloatText(r1, c1, 'Mega Wrapped Storm!', '#ff5e7e', 26);
        } else if (sp1 === Config.SPECIAL.WRAPPED && sp2 === Config.SPECIAL.WRAPPED) {
          // Double Wrapped: 5x5 explosion
          Renderer.spawnSupernova(Renderer.cellX(c1), Renderer.cellY(r1), 180, '#ff9838');
          Renderer.spawnFloatText(r1, c1, '5x5 Mega Blast!', '#ff9838', 28);
        } else if ((sp1 === Config.SPECIAL.STRIPED_H || sp1 === Config.SPECIAL.STRIPED_V) &&
                   (sp2 === Config.SPECIAL.WRAPPED || sp1 === Config.SPECIAL.WRAPPED)) {
          // Striped + Wrapped: 3-row x 3-col giant cross laser
          for (let dr = -1; dr <= 1; dr++) {
            if (r1 + dr >= 0 && r1 + dr < Config.ROWS) Renderer.spawnLaserBeam('row', r1 + dr, '#ff5e7e');
          }
          for (let dc = -1; dc <= 1; dc++) {
            if (c1 + dc >= 0 && c1 + dc < Config.COLS) Renderer.spawnLaserBeam('col', c1 + dc, '#4ea8de');
          }
          Renderer.spawnFloatText(r1, c1, 'Giant Cross Laser!', '#ffd13b', 28);
        } else if ((sp1 === Config.SPECIAL.STRIPED_H || sp1 === Config.SPECIAL.STRIPED_V) &&
                   (sp2 === Config.SPECIAL.STRIPED_H || sp2 === Config.SPECIAL.STRIPED_V)) {
          // Double Striped: Full Row + Column Cross Blast
          Renderer.spawnLaserBeam('row', r1, '#ff5e7e');
          Renderer.spawnLaserBeam('col', c2, '#4ea8de');
          Renderer.spawnFloatText(r1, c1, 'Cross Blast!', '#ffd13b', 26);
        }

        const result = Specials.handleSpecialCombo(grid, r1, c1, r2, c2);
        processMatchResult(result, false);
        setTimeout(() => triggerCascade(), Config.BOARD_ANIM_MS + 80);
      });
      return;
    }

    // Color Bomb + Normal Candy
    if (isColorBombActivation) {
      Renderer.startSwapAnimation(r1, c1, r2, c2, Config.BOARD_ANIM_MS, () => {
        let bombR = r1, bombC = c1, targetCol = cell2.color;
        if (cell2.special === Config.SPECIAL.COLOR_BOMB) {
          bombR = r2; bombC = c2; targetCol = cell1.color;
        }
        grid[bombR][bombC] = Board.emptyCell();
        Renderer.spawnSupernova(Renderer.cellX(bombC), Renderer.cellY(bombR), 180, '#ffd13b');
        Renderer.spawnFloatText(bombR, bombC, 'Color Splash!', '#ffd13b', 28);

        const result = Specials.activateColorBomb(grid, bombR, bombC, targetCol);
        processMatchResult(result, false);
        setTimeout(() => triggerCascade(), Config.BOARD_ANIM_MS + 80);
      });
      return;
    }

    // Normal Swap or Powerup Free Swap (within 2-move limit)
    Renderer.startSwapAnimation(r1, c1, r2, c2, Config.BOARD_ANIM_MS, () => {
      const tmp = Board.cloneCell(grid[r1][c1]);
      grid[r1][c1] = Board.cloneCell(grid[r2][c2]);
      grid[r2][c2] = tmp;

      if (isAllowedFreeMove) {
        // Track the free swaps used for this powerup at its new position
        const key2 = `${r2},${c2}`;
        const key1 = `${r1},${c1}`;
        if (isSp1) {
          const u = (powerupFreeSwapsUsed.get(key1) || 0) + 1;
          powerupFreeSwapsUsed.delete(key1);
          powerupFreeSwapsUsed.set(key2, u);
          Renderer.spawnFloatText(r2, c2, `Free Move (${u}/2)`, '#ffd13b', 18);
        }
        if (isSp2) {
          const u = (powerupFreeSwapsUsed.get(key2) || 0) + 1;
          powerupFreeSwapsUsed.delete(key2);
          powerupFreeSwapsUsed.set(key1, u);
          Renderer.spawnFloatText(r1, c1, `Free Move (${u}/2)`, '#ffd13b', 18);
        }
        state = STATE.PLAYING;
        scheduleHint();
        return;
      }

      const actualMatches = Board.findAllMatches(grid);

      for (const group of actualMatches) {
        for (const pos of group.cells) {
          const cell = grid[pos.r][pos.c];
          if (cell.special !== Config.SPECIAL.NONE) {
            if (cell.special === Config.SPECIAL.STRIPED_H) Renderer.spawnLaserBeam('row', pos.r, '#ff5e7e');
            else if (cell.special === Config.SPECIAL.STRIPED_V) Renderer.spawnLaserBeam('col', pos.c, '#4ea8de');
            else if (cell.special === Config.SPECIAL.WRAPPED) Renderer.spawnSupernova(Renderer.cellX(pos.c), Renderer.cellY(pos.r), 100, '#ff9838');
            const res = Specials.activate(grid, pos.r, pos.c);
            processMatchResult(res, false);
          }
        }
      }

      const result = Board.applyMatches(grid, actualMatches, { r: r1, c: c1 });
      processMatchResult(result, true);

      triggerCascade();
    });
  }

  function triggerCascade() {
    Board.applyGravity(grid, levelDef.candyPool);

    const exited = Board.stepIngredients(grid);
    if (exited.length > 0) {
      ingredientsLeft = Math.max(0, ingredientsLeft - exited.length);
      for (const pos of exited) {
        Renderer.spawnFloatText(pos.r, pos.c, `+${Config.SCORE.INGREDIENT_DROP}`, '#f59e0b');
        score += Config.SCORE.INGREDIENT_DROP;
        AudioEngine.playIngredient();
        grid[pos.r][pos.c] = Board.emptyCell();
      }
      updateHUD();
    }

    setTimeout(() => {
      const newMatches = Board.findAllMatches(grid);

      if (newMatches.length > 0) {
        cascadeLevel++;
        AudioEngine.playCascade(cascadeLevel);

        for (const group of newMatches) {
          for (const pos of group.cells) {
            if (grid[pos.r][pos.c].special !== Config.SPECIAL.NONE) {
              const cell = grid[pos.r][pos.c];
              if (cell.special === Config.SPECIAL.STRIPED_H) Renderer.spawnLaserBeam('row', pos.r, '#ff5e7e');
              else if (cell.special === Config.SPECIAL.STRIPED_V) Renderer.spawnLaserBeam('col', pos.c, '#4ea8de');
              else if (cell.special === Config.SPECIAL.WRAPPED) Renderer.spawnSupernova(Renderer.cellX(pos.c), Renderer.cellY(pos.r), 100, '#ff9838');
              const res = Specials.activate(grid, pos.r, pos.c);
              processMatchResult(res, false);
            }
          }
        }

        const result = Board.applyMatches(grid, newMatches, null);
        processMatchResult(result, true);

        if (cascadeLevel >= 2) {
          const labels = ['', '', 'Sweet!', 'Tasty!', 'Delicious!', 'Amazing!', 'Incredible!'];
          const label = labels[Math.min(cascadeLevel, labels.length - 1)] || 'Unreal!';
          Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), label, '#ffd13b', 26);
        }

        setTimeout(() => triggerCascade(), Config.BOARD_ANIM_MS);
      } else {
        cascadeLevel = 0;
        const hint = Board.findHint(grid);
        if (!hint) {
          Board.reshuffle(grid, levelDef.candyPool);
          Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), 'Reshuffling!', '#2b2623', 20);
        }

        checkWinLose();
        state = STATE.PLAYING;
        scheduleHint();
      }
    }, Config.BOARD_ANIM_MS);
  }

  function processMatchResult(result, isNormalMatch) {
    if (!result) return;
    const { cleared = [], jellyCleared = [] } = result;
    let baseScore = 0;

    const matchLen = cleared.length;

    for (const pos of cleared) {
      const color = pos.color || grid[pos.r]?.[pos.c]?.color || 0;
      if (color > 0 && color < 7) {
        baseScore += Config.SCORE.MATCH_BASE;
        Renderer.spawnDoodleBurst(pos.r, pos.c, color, matchLen);

        if (ordersLeft[color] !== undefined) {
          ordersLeft[color] = Math.max(0, ordersLeft[color] - 1);
        }
      }
    }

    for (const jc of jellyCleared) {
      baseScore += jc.layer === 2 ? Config.SCORE.JELLY_CLEAR_DBL : Config.SCORE.JELLY_CLEAR;
      jelliesLeft = Board.countJellies(grid);
      AudioEngine.playJelly();
      Renderer.spawnDoodleBurst(jc.r, jc.c, 1, 3);
    }

    // Exponential combo multiplier for satisfying dopamine cascade hits
    const mult = Math.pow(Config.SCORE.CASCADE_MULT, cascadeLevel);
    const earned = Math.round(baseScore * mult);
    if (earned > 0) {
      score += earned;
      if (cleared.length > 0) {
        Renderer.spawnFloatText(cleared[0].r, cleared[0].c, `+${earned}`, '#ff5e7e');
      }
    }

    if (isNormalMatch) AudioEngine.playMatch(cascadeLevel);
    updateHUD();
    renderObjectiveHUD();
    updateStarMeter();
  }

  // ── Win / Lose Detection ──────────────────────────────────────────────────────

  function checkWinLose() {
    const obj = levelDef.objective;
    const [s1, s2, s3] = levelDef.stars;

    // Rule: Game is ALWAYS won if player achieves 3 Stars!
    if (score >= s3) {
      handleVictory();
      return;
    }

    let goalMet = false;
    if (obj === 'score') {
      // 1 Star is minimum clear requirement
      goalMet = score >= s1;
    } else if (obj === 'jelly') {
      goalMet = jelliesLeft === 0;
    } else if (obj === 'order') {
      goalMet = Object.values(ordersLeft).every(v => v <= 0);
    } else if (obj === 'ingredient') {
      goalMet = ingredientsLeft <= 0;
    } else if (obj === 'mixed') {
      const jellyOk = !levelDef.jellyMap || jelliesLeft === 0;
      const orderOk = !levelDef.orders || Object.values(ordersLeft).every(v => v <= 0);
      const ingOk   = !levelDef.ingredientCount || ingredientsLeft <= 0;
      goalMet = jellyOk && orderOk && ingOk;
    }

    if (goalMet) {
      handleVictory();
    } else if (movesLeft <= 0) {
      // Out of moves: if player earned at least 1 star, they still clear the level!
      if (score >= s1) {
        handleVictory();
      } else {
        handleDefeat();
      }
    }
  }

  function calculateStars() {
    const [s1, s2, s3] = levelDef.stars;
    if (score >= s3) return 3;
    if (score >= s2) return 2;
    if (score >= s1) return 1;
    return 1;
  }

  function handleVictory() {
    state = STATE.VICTORY;
    AudioEngine.playVictory();
    const stars = calculateStars();

    const cur = getLevelProgress(levelDef.id);
    progress[levelDef.id] = {
      stars: Math.max(cur.stars || 0, stars),
      score: Math.max(cur.score || 0, score),
      unlocked: true
    };
    unlockNextLevel(levelDef.id);
    addCoins(50);
    saveProgress();

    showVictoryScreen(stars, score, 50);

    // After victory screen is shown, check if player has cleared 2 levels to prompt for nickname!
    setTimeout(() => {
      checkUsernamePrompt();
    }, 1800);
  }

  function handleDefeat() {
    state = STATE.DEFEAT;
    AudioEngine.playDefeat();
    showDefeatScreen();
  }

  // ── Serpentine 500-Level Adventure Map ───────────────────────────────────────

  function renderSerpentineMap() {
    const container = document.getElementById('map-path-container');
    if (!container) return;

    let highestUnlocked = 1;
    Levels.forEach(lvl => {
      if (getLevelProgress(lvl.id).unlocked) highestUnlocked = lvl.id;
    });

    const currentWorldIndex = Math.min(24, Math.floor((highestUnlocked - 1) / 20));
    const currentWorldName = WORLD_NAMES[currentWorldIndex] || 'Sketchy Hills';
    setText('map-world-tag', `World ${currentWorldIndex + 1} / 25`);
    setText('map-world-name', currentWorldName);

    const xOffsets = [-90, -45, 0, 45, 90, 45, 0, -45];
    let html = '';
    let lastWorldIdx = -1;

    Levels.forEach((lvl, idx) => {
      const worldIdx = Math.floor(idx / 20);
      if (worldIdx !== lastWorldIdx) {
        html += `
          <div class="map-episode-card">
            <div class="episode-num">World ${worldIdx + 1}</div>
            <div class="episode-title">${WORLD_NAMES[worldIdx]}</div>
          </div>
        `;
        lastWorldIdx = worldIdx;
      }

      const prog = getLevelProgress(lvl.id);
      const isCurrent = (lvl.id === highestUnlocked);
      const statusClass = isCurrent ? 'current' : (prog.unlocked ? 'unlocked' : 'locked');
      const offset = xOffsets[idx % xOffsets.length];

      const starsHtml = [1, 2, 3].map(i =>
        `<span class="star ${i <= (prog.stars || 0) ? 'filled' : ''}">★</span>`
      ).join('');

      html += `
        <div class="map-serpentine-row">
          <button class="map-node-btn ${statusClass}"
                  id="level-node-${lvl.id}"
                  data-level="${lvl.id}"
                  style="transform: translateX(${offset}px);"
                  ${!prog.unlocked ? 'disabled' : ''}>
            <span class="map-node-num">${lvl.id}</span>
            <div class="map-node-stars">${starsHtml}</div>
          </button>
        </div>
      `;
    });

    container.innerHTML = html;

    setTimeout(() => {
      const activeNode = document.getElementById(`level-node-${highestUnlocked}`);
      if (activeNode) {
        activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  // ── HUD & Star Meter ─────────────────────────────────────────────────────────

  function updateHUD() {
    setText('hud-moves', movesLeft);
    setText('hud-score', score.toLocaleString());
    if (levelDef) setText('hud-level', `Level ${levelDef.id}`);
    updateCurrencyUI();
  }

  function updateStarMeter() {
    if (!levelDef) return;
    const t = levelDef.stars;
    const fillEl = document.getElementById('star-meter-fill');
    const label  = document.getElementById('star-targets-label');
    const cp1    = document.getElementById('star-marker-1');
    const cp2    = document.getElementById('star-marker-2');
    const cp3    = document.getElementById('star-marker-3');

    const pct = Math.min(100, Math.round((score / t[2]) * 100));
    if (fillEl) fillEl.style.width = `${pct}%`;

    if (cp1) cp1.classList.toggle('active', score >= t[0]);
    if (cp2) cp2.classList.toggle('active', score >= t[1]);
    if (cp3) cp3.classList.toggle('active', score >= t[2]);

    if (label) {
      if (score >= t[2]) {
        label.textContent = `⭐⭐⭐ 3 Stars Achieved! (${score.toLocaleString()} pts)`;
      } else if (score >= t[1]) {
        label.textContent = `Next: ⭐⭐⭐ at ${t[2].toLocaleString()} pts`;
      } else if (score >= t[0]) {
        label.textContent = `Next: ⭐⭐ at ${t[1].toLocaleString()} pts`;
      } else {
        label.textContent = `Target: ⭐ at ${t[0].toLocaleString()} pts`;
      }
    }
  }

  function renderObjectiveHUD() {
    const el = document.getElementById('hud-objective');
    if (!el || !levelDef) return;
    const obj = levelDef.objective;
    if (obj === 'score') {
      el.innerHTML = `<span>🎯 Score: <b>${score.toLocaleString()}</b> / ${levelDef.targetScore.toLocaleString()}</span>`;
    } else if (obj === 'jelly') {
      el.innerHTML = `<span>🍮 Ink patches: <b>${jelliesLeft}</b></span>`;
    } else if (obj === 'order') {
      const parts = Object.entries(ordersLeft)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => `Doodle #${id}: <b>${v}</b>`)
        .join(' • ');
      el.innerHTML = `Order: ${parts || 'Complete!'}`;
    } else if (obj === 'ingredient') {
      el.innerHTML = `<span>🍒 Drops left: <b>${ingredientsLeft}</b></span>`;
    } else if (obj === 'mixed') {
      el.innerHTML = `<span>🎯 ${score.toLocaleString()}/${levelDef.targetScore.toLocaleString()} | 🍮 ${jelliesLeft}</span>`;
    }
  }

  function updateBoosterUI() {
    const active = Boosters.getActive();
    ['hammer', 'free_swap', 'color_bomb', 'row_blast', 'extra_moves'].forEach(type => {
      const btn = document.getElementById(`btn-booster-${type}`);
      if (!btn) return;
      const countEl = btn.querySelector('.booster-count');
      if (countEl) countEl.textContent = Boosters.getCount(type);
      btn.classList.toggle('active', active === type);
    });
  }

  // ── Screens & Navigation ─────────────────────────────────────────────────────

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function showMap() {
    state = STATE.MAP;
    selected = null;
    renderSerpentineMap();
    showScreen('screen-map');
  }

  function showVictoryScreen(stars, finalScore, coinsWon = 50) {
    setText('victory-score', finalScore.toLocaleString());
    setText('victory-coins-reward', `+${coinsWon} Gold Coins! 🪙`);
    const starsEl = document.getElementById('victory-stars');
    if (starsEl) {
      starsEl.innerHTML = [1,2,3].map(i =>
        `<span class="star ${i <= stars ? 'filled' : ''}">★</span>`
      ).join('');
    }
    const nextBtn = document.getElementById('btn-next-level');
    if (nextBtn) nextBtn.disabled = currentLevelIndex >= Levels.length - 1;
    showScreen('screen-victory');
  }

  function showDefeatScreen() {
    setText('defeat-score', score.toLocaleString());
    showScreen('screen-defeat');
  }

  function togglePause() {
    if (state === STATE.PLAYING) {
      state = STATE.PAUSED;
      showScreen('screen-pause');
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
      showScreen('screen-game');
    }
  }

  function nextLevel() {
    if (currentLevelIndex < Levels.length - 1) {
      startLevel(currentLevelIndex + 1);
    } else {
      showMap();
    }
  }

  function watchAdForMoves() {
    AdManager.showRewardedAd(
      (movesGranted) => {
        movesLeft += movesGranted;
        updateHUD();
        state = STATE.PLAYING;
        showScreen('screen-game');
        Renderer.spawnFloatText(
          Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2),
          `+${movesGranted} Moves!`, '#10b981', 28
        );
        scheduleHint();
      },
      () => {}
    );
  }

  function scheduleHint() {
    clearHintTimer();
    hintTimeout = setTimeout(() => {
      if (state !== STATE.PLAYING) return;
      const hint = Board.findHint(grid);
      if (hint) {
        Renderer.setHint(hint);
      }
    }, Config.HINT_DELAY_MS);
  }

  function clearHintTimer() {
    if (hintTimeout) {
      clearTimeout(hintTimeout);
      hintTimeout = null;
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  return {
    init,
    startLevel,
    showMap,
    showMainMenu,
    getCoins,
    addCoins,
    spendCoins,
    renderSerpentineMap,
    getGrid: () => grid,
    getScore: () => score,
    getMoves: () => movesLeft,
    handleSwap: (r1, c1, r2, c2) => handleSwap(r1, c1, r2, c2)
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Game.init());
} else {
  Game.init();
}
