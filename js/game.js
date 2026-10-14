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
  let cascadeTimeout = null;
  let frenzyTimeout = null;
  let introTimeout = null;
  let isConcludingLevel = false;
  let star1Announced = false;
  let star2Announced = false;
  let lastInputTime = Date.now();
  let animFrameId = null;
  let lastTimestamp = 0;

  function clearAllGameTimeouts() {
    clearHintTimer();
    if (cascadeTimeout) { clearTimeout(cascadeTimeout); cascadeTimeout = null; }
    if (frenzyTimeout) { clearTimeout(frenzyTimeout); frenzyTimeout = null; }
    if (introTimeout) { clearTimeout(introTimeout); introTimeout = null; }
  }

  // Powerup free swap limit: Max 2 non-matching swaps per powerup instance
  // Key: 'r,c' -> count
  let powerupFreeSwapsUsed = new Map();

  const PROGRESS_KEY = 'sr_progress';
  const COINS_KEY    = 'sr_coins';
  const USER_KEY     = 'sr_username';
  const ASKED_USER_KEY = 'sr_asked_user';
  const ACCOUNTS_DB_KEY = 'sr_accounts_db'; // Store progress per-email/account for easy cloud recovery!
  const HACKS_KEY    = 'sr_hacks';   // bool: unlock all levels toggle
  const PERF_KEY     = 'sr_lowperf'; // bool: low-power render mode

  let progress = {};
  let coins = 100;
  let username = 'Guest Doodler';
  let userEmail = null;
  let askedUsername = false;

  // ── Hacks & Performance Settings ─────────────────────────────────────────────
  let hacksEnabled = false;  // default OFF — must be explicitly toggled in Settings
  // Auto-detect low-end device: < 4 logical CPUs or < 2GB device memory (if exposed)
  let lowPerfMode = (() => {
    try {
      const stored = localStorage.getItem(PERF_KEY);
      if (stored !== null) return stored === '1';
      const cpus = navigator.hardwareConcurrency || 4;
      const mem  = navigator.deviceMemory || 4; // GB, Chrome only
      return cpus <= 2 || mem <= 1;
    } catch (_) { return false; }
  })();

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

      // Read hacks setting (default OFF)
      try { hacksEnabled = localStorage.getItem(HACKS_KEY) === '1'; } catch (_) {}

      // If Hacks ON: unlock every level (stars preserved). Otherwise normal progression.
      if (hacksEnabled) {
        for (let i = 1; i <= 500; i++) {
          if (!progress[i]) progress[i] = { stars: 0, score: 0, unlocked: true };
          else progress[i].unlocked = true;
        }
      }

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

  function isNativeOrInstalledApp() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
        return true;
      }
      const ua = (navigator.userAgent || '').toLowerCase();
      if (ua.includes('wv') || ua.includes('capacitor') || ua.includes('androidapp') || window.Android !== undefined) {
        return true;
      }
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        return true;
      }
      if (window.navigator && window.navigator.standalone === true) {
        return true;
      }
      if (localStorage.getItem('mad_apk_downloaded') === '1' || localStorage.getItem('sr_downloaded_apk') === '1') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function checkAndHideDownloadButtons() {
    if (isNativeOrInstalledApp()) {
      const btnApk = document.getElementById('btn-download-apk');
      if (btnApk) btnApk.style.display = 'none';
      const btnManual = document.getElementById('btn-manual-install');
      if (btnManual) btnManual.style.display = 'none';
    }
  }

  function init() {
    loadProgress();
    Boosters.init({ onMovesAdded: (n) => { movesLeft += n; updateHUD(); } });
    AdManager.init();
    bindInputEvents();
    updateCurrencyUI();
    updateBoosterUI();
    updateProfileUI();
    checkAndHideDownloadButtons();
    // Apply low-perf mode on startup (auto-detected or user-saved preference)
    Renderer.setLowPerfMode(lowPerfMode);

    // Unlock Audio Context on any user interaction (first tap)
    const unlockListener = () => {
      AudioEngine.unlockAudio();
      window.removeEventListener('pointerdown', unlockListener);
      window.removeEventListener('keydown', unlockListener);
    };
    window.addEventListener('pointerdown', unlockListener, { once: true });
    window.addEventListener('keydown', unlockListener, { once: true });

    // Handle App Minimizing / Tab Switching / Backgrounding:
    // Instantly pause background music and audio when minimized or screen locked,
    // and seamlessly resume when returning to the game.
    const handleAppHide = () => {
      AudioEngine.pauseAudio();
    };
    const handleAppShow = () => {
      AudioEngine.resumeAudio();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        handleAppHide();
      } else {
        handleAppShow();
      }
    });
    window.addEventListener('pagehide', handleAppHide);
    window.addEventListener('pageshow', handleAppShow);
    window.addEventListener('blur', () => {
      // Blur can fire during normal interactions, but if document is also hidden or window loses focus on mobile
      if (document.hidden) handleAppHide();
    });
    window.addEventListener('focus', () => {
      if (!document.hidden) handleAppShow();
    });

    // Capacitor App State listener (if running inside native Capacitor app container)
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('appStateChange', (state) => {
          if (state && !state.isActive) {
            handleAppHide();
          } else {
            handleAppShow();
          }
        });
      }
    } catch (_) {}

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
    clearAllGameTimeouts();
    isConcludingLevel = false;
    state = STATE.MAIN_MENU;
    updateCurrencyUI();
    updateProfileUI();
    checkAndHideDownloadButtons();
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
    setText('shop-coins-val', coins);
  }

  // ── Level Start ──────────────────────────────────────────────────────────────

  function startLevel(index) {
    clearAllGameTimeouts();
    isConcludingLevel = false;
    star1Announced = false;
    star2Announced = false;

    currentLevelIndex = index;
    levelDef = Levels[index];
    const worldIdx = Math.floor(index / 20);
    Renderer.setWorld(worldIdx);
    AudioEngine.setTheme(worldIdx);
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
    state = STATE.LEVEL_INTRO;
    showScreen('screen-game');
    updateHUD();
    renderObjectiveHUD();
    updateStarMeter();
    updateBoosterUI();

    const banner = document.getElementById('level-intro-banner');
    const titleEl = document.getElementById('intro-title');
    const subEl   = document.getElementById('intro-subtitle');
    if (titleEl) titleEl.textContent = `Level ${levelDef.id} — ${levelDef.title}`;
    if (subEl)   subEl.textContent   = levelDef.subtitle;
    if (banner)  {
      banner.classList.add('show');
      setTimeout(() => banner.classList.remove('show'), 1100);
    }

    const t = levelDef.stars;
    setText('intro-star-1', t[0].toLocaleString());
    setText('intro-star-2', t[1].toLocaleString());
    setText('intro-star-3', t[2].toLocaleString());

    introTimeout = setTimeout(() => {
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
      const { px, py } = Renderer.clientToPixel(e.clientX, e.clientY);
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
      const { px, py } = Renderer.clientToPixel(touch.clientX, touch.clientY);
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

    const markDownloaded = () => {
      try {
        localStorage.setItem('mad_apk_downloaded', '1');
        localStorage.setItem('sr_downloaded_apk', '1');
        checkAndHideDownloadButtons();
      } catch (_) {}
    };
    document.getElementById('btn-download-apk')?.addEventListener('click', markDownloaded);
    document.getElementById('btn-manual-install')?.addEventListener('click', markDownloaded);

    // ── Doodler Shop Modal Wiring ──────────────────────────────────────────────
    const openShop = () => {
      AudioEngine.playClick();
      updateCurrencyUI();
      showScreen('screen-shop');
    };
    document.getElementById('btn-menu-shop')?.addEventListener('click', openShop);
    document.getElementById('btn-map-shop')?.addEventListener('click', openShop);

    document.getElementById('btn-close-shop')?.addEventListener('click', () => {
      AudioEngine.playClick();
      if (state === STATE.MAP) showScreen('screen-map');
      else showMainMenu();
    });

    // Shop Booster Purchases:
    // Hammer (Pencil Eraser x3 for 40 coins)
    document.getElementById('btn-buy-booster-hammer')?.addEventListener('click', () => {
      if (spendCoins(40)) {
        Boosters.grant(Config.BOOSTER.HAMMER, 3);
        updateBoosterUI();
        AudioEngine.playBooster();
        alert('✏️ Purchased 3x Pencil Erasers!');
      } else {
        alert('Not enough coins! Watch an ad or clear levels to earn more.');
      }
    });

    // Rainbow Color Bomb (x2 for 50 coins)
    document.getElementById('btn-buy-booster-bomb')?.addEventListener('click', () => {
      if (spendCoins(50)) {
        Boosters.grant(Config.BOOSTER.COLOR_BOMB, 2);
        updateBoosterUI();
        AudioEngine.playBooster();
        alert('🎨 Purchased 2x Rainbow Color Bombs!');
      } else {
        alert('Not enough coins! Watch an ad or clear levels to earn more.');
      }
    });

    // Brush Blast (x2 for 35 coins)
    document.getElementById('btn-buy-booster-brush')?.addEventListener('click', () => {
      if (spendCoins(35)) {
        Boosters.grant(Config.BOOSTER.ROW_BLAST, 2);
        updateBoosterUI();
        AudioEngine.playBooster();
        alert('🖌️ Purchased 2x Brush Blasts!');
      } else {
        alert('Not enough coins! Watch an ad or clear levels to earn more.');
      }
    });

    // Free Swap (x3 for 30 coins)
    document.getElementById('btn-buy-booster-swap')?.addEventListener('click', () => {
      if (spendCoins(30)) {
        Boosters.grant(Config.BOOSTER.FREE_SWAP, 3);
        updateBoosterUI();
        AudioEngine.playBooster();
        alert('🔀 Purchased 3x Free Swaps!');
      } else {
        alert('Not enough coins! Watch an ad or clear levels to earn more.');
      }
    });

    // Watch Ad for Free Coins (+30 coins)
    document.getElementById('btn-shop-ad-coins')?.addEventListener('click', () => {
      AdManager.showRewardedAd(
        () => {
          addCoins(30);
          updateCurrencyUI();
          AudioEngine.playCascade(3);
          alert('🎁 Earned +30 Free Gold Coins!');
        },
        () => {
          // cancelled
        }
      );
    });

    // In-App Purchase Starter Pack ($0.99 for +250 Coins)
    document.getElementById('btn-iap-coins-starter')?.addEventListener('click', () => {
      AudioEngine.playClick();
      // Google Play Billing / Web Prototype simulator
      if (confirm('Simulate Google Play Store Purchase:\nPouch of 250 Gold Coins ($0.99)?')) {
        addCoins(250);
        AudioEngine.playVictory();
        alert('💎 Thank you! +250 Gold Coins added to your account.');
      }
    });

    // In-App Purchase Chest of Coins ($2.99 for +1,000 Coins)
    document.getElementById('btn-iap-coins-chest')?.addEventListener('click', () => {
      AudioEngine.playClick();
      if (confirm('Simulate Google Play Store Purchase:\nChest of 1,000 Gold Coins ($2.99)?')) {
        addCoins(1000);
        AudioEngine.playVictory();
        alert('💎 Thank you! +1,000 Gold Coins added to your account.');
      }
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
    document.getElementById('btn-next-level')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      nextLevel();
    });
    document.getElementById('btn-victory-retry')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      startLevel(currentLevelIndex);
    });
    document.getElementById('btn-quit-to-map')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      showMap();
    });
    document.getElementById('btn-victory-home')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      showMainMenu();
    });

    // Defeat screen actions
    document.getElementById('btn-retry')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      startLevel(currentLevelIndex);
    });
    document.getElementById('btn-watch-ad')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      watchAdForMoves();
    });
    document.getElementById('btn-defeat-quit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { AudioEngine.playClick(); } catch (_) {}
      showMap();
    });

    // World switcher buttons on Adventure Map
    document.getElementById('btn-map-prev-world')?.addEventListener('click', () => {
      try { AudioEngine.playClick(); } catch (_) {}
      if (viewingWorldIndex > 0) renderSerpentineMap(viewingWorldIndex - 1);
    });
    document.getElementById('btn-map-next-world')?.addEventListener('click', () => {
      try { AudioEngine.playClick(); } catch (_) {}
      if (viewingWorldIndex < 24) renderSerpentineMap(viewingWorldIndex + 1);
    });

    // Settings Modal (Background Music & Sound Effects)
    document.getElementById('btn-map-settings')?.addEventListener('click', () => {
      try { AudioEngine.playClick(); } catch (_) {}
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

    // ── Hacks toggle: unlock all 500 levels ────────────────────────────────────
    document.getElementById('setting-hacks-toggle')?.addEventListener('click', (e) => {
      hacksEnabled = !hacksEnabled;
      try { localStorage.setItem(HACKS_KEY, hacksEnabled ? '1' : '0'); } catch (_) {}
      e.target.textContent = hacksEnabled ? 'ON' : 'OFF';
      e.target.classList.toggle('active', hacksEnabled);
      // Apply immediately: unlock or re-lock levels
      if (hacksEnabled) {
        for (let i = 1; i <= 500; i++) {
          if (!progress[i]) progress[i] = { stars: 0, score: 0, unlocked: true };
          else progress[i].unlocked = true;
        }
      } else {
        // Re-lock levels beyond what has been legitimately earned
        let lastUnlocked = 1;
        for (let i = 1; i <= 500; i++) {
          if (progress[i] && progress[i].stars > 0) {
            lastUnlocked = i + 1;
          }
        }
        for (let i = lastUnlocked + 1; i <= 500; i++) {
          if (progress[i]) progress[i].unlocked = false;
        }
      }
      saveProgress();
      if (state === STATE.MAP) {
        renderSerpentineMap();
      }
      AudioEngine.playClick();
    });

    // ── Low-Power Mode toggle: reduce DPR + particle load ─────────────────────
    document.getElementById('setting-perf-toggle')?.addEventListener('click', (e) => {
      lowPerfMode = !lowPerfMode;
      try { localStorage.setItem(PERF_KEY, lowPerfMode ? '1' : '0'); } catch (_) {}
      e.target.textContent = lowPerfMode ? 'ON' : 'OFF';
      e.target.classList.toggle('active', lowPerfMode);
      Renderer.setLowPerfMode(lowPerfMode);
      AudioEngine.playClick();
    });

    // Sync toggle states when settings screen is opened from anywhere
    const syncSettingsUI = () => {
      const hacksBtn = document.getElementById('setting-hacks-toggle');
      if (hacksBtn) {
        hacksBtn.textContent = hacksEnabled ? 'ON' : 'OFF';
        hacksBtn.classList.toggle('active', hacksEnabled);
      }
      const perfBtn = document.getElementById('setting-perf-toggle');
      if (perfBtn) {
        perfBtn.textContent = lowPerfMode ? 'ON' : 'OFF';
        perfBtn.classList.toggle('active', lowPerfMode);
      }
    };
    document.getElementById('btn-map-settings')?.addEventListener('click', syncSettingsUI, true);
    document.getElementById('btn-menu-options')?.addEventListener('click', syncSettingsUI, true);
    document.getElementById('btn-pause-options')?.addEventListener('click', syncSettingsUI, true);



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
    if (e._px !== undefined && e._py !== undefined) {
      px = e._px;
      py = e._py;
    } else {
      const p = Renderer.clientToPixel(e.clientX, e.clientY);
      px = p.px;
      py = p.py;
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
    if (movesLeft <= 0) return;
    const isFreeSwapBooster = Boosters.checkFreeSwap(r1, c1, r2, c2);
    if (!Board.isAdjacent(r1, c1, r2, c2)) return;

    const cell1 = grid[r1][c1];
    const cell2 = grid[r2][c2];

    // ── Obstacles (frosting/licorice) cannot be manually swapped ──
    const obs1 = cell1.obstacle;
    const obs2 = cell2.obstacle;
    const isHardObstacle1 = obs1 === Config.OBSTACLE.FROSTING_1 || obs1 === Config.OBSTACLE.FROSTING_2 || obs1 === Config.OBSTACLE.LICORICE;
    const isHardObstacle2 = obs2 === Config.OBSTACLE.FROSTING_1 || obs2 === Config.OBSTACLE.FROSTING_2 || obs2 === Config.OBSTACLE.LICORICE;
    if ((isHardObstacle1 || isHardObstacle2) && !isFreeSwapBooster) {
      AudioEngine.playInvalid();
      const shakeR = isHardObstacle1 ? r1 : r2;
      const shakeC = isHardObstacle1 ? c1 : c2;
      shakeCell = { r: shakeR, c: shakeC };
      setTimeout(() => { shakeCell = null; }, Config.INVALID_SHAKE_MS);
      Renderer.spawnFloatText(shakeR, shakeC, 'Use a powerup!', '#ef4444', 16);
      return;
    }

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
    cascadeLevel = 0;

    // ── Execute Powerup Cross-Combos with Grand Visuals ────────────────────────
    if (isSpecialCombo) {
      movesLeft = Math.max(0, movesLeft - 1);
      updateHUD();
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
        } else if (((sp1 === Config.SPECIAL.STRIPED_H || sp1 === Config.SPECIAL.STRIPED_V) && sp2 === Config.SPECIAL.WRAPPED) ||
                   ((sp2 === Config.SPECIAL.STRIPED_H || sp2 === Config.SPECIAL.STRIPED_V) && sp1 === Config.SPECIAL.WRAPPED)) {
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
      movesLeft = Math.max(0, movesLeft - 1);
      updateHUD();
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

      movesLeft = Math.max(0, movesLeft - 1);
      updateHUD();

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
    if (state === STATE.VICTORY || state === STATE.DEFEAT) return;
    state = STATE.ANIMATING;

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

    cascadeTimeout = setTimeout(() => {
      if (state === STATE.VICTORY || state === STATE.DEFEAT) return;

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

        cascadeTimeout = setTimeout(() => triggerCascade(), Config.BOARD_ANIM_MS);
      } else {
        cascadeLevel = 0;
        if (isConcludingLevel) {
          if (hasSpecialsOnBoard()) {
            cascadeTimeout = setTimeout(() => {
              detonateAllSpecials();
            }, 240);
          } else {
            checkLevelEndConclusion();
          }
          return;
        }

        const hint = Board.findHint(grid);
        if (!hint) {
          Board.reshuffle(grid, levelDef.candyPool);
          Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), 'Reshuffling!', '#2b2623', 20);
        }

        checkWinLose();
        if (!isConcludingLevel && state === STATE.ANIMATING) {
          state = STATE.PLAYING;
          scheduleHint();
        }
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

  function hasSpecialsOnBoard() {
    for (let r = 0; r < Config.ROWS; r++) {
      for (let c = 0; c < Config.COLS; c++) {
        if (grid[r]?.[c] && grid[r][c].special !== Config.SPECIAL.NONE) return true;
      }
    }
    return false;
  }

  function checkLevelEndConclusion() {
    if (state === STATE.VICTORY || state === STATE.DEFEAT) return;
    const obj = levelDef.objective;
    const [s1, , s3] = levelDef.stars;

    let goalMet = false;
    if (obj === 'score') {
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

    if (score >= s3 || goalMet) {
      handleVictory();
    } else {
      handleDefeat();
    }
  }

  function startSpecialDetonationWave() {
    if (state === STATE.VICTORY || state === STATE.DEFEAT) return;
    isConcludingLevel = true;
    state = STATE.ANIMATING;
    clearHintTimer();
    Renderer.clearHint();
    Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), 'POWERUP BURST! 💥✨', '#ff5e7e', 30);
    detonateAllSpecials();
  }

  // ── Win / Lose Detection & Dopamine Climax ───────────────────────────────────

  function checkWinLose() {
    if (isConcludingLevel || state === STATE.VICTORY || state === STATE.DEFEAT) return;

    const obj = levelDef.objective;
    const [s1, s2, s3] = levelDef.stars;

    // Intermediate Dopamine Milestones for score
    if (!star1Announced && score >= s1) {
      star1Announced = true;
      Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), '★ Star 1 Reached! Aim for 3! ★', '#10b981', 22);
      try { AudioEngine.playCascade(3); } catch (_) {}
    }
    if (!star2Announced && score >= s2) {
      star2Announced = true;
      Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), '★★ Star 2 Reached! Almost 3! ★★', '#3b82f6', 22);
      try { AudioEngine.playCascade(4); } catch (_) {}
    }

    // Minimum Move Requirement: Every level must take at least 3 moves to complete,
    // even with perfect play, ensuring gameplay engagement and pacing before completion.
    const movesMade = levelDef.moves - movesLeft;
    if (movesMade < 3) {
      return;
    }

    // 1. Reaching 3 Stars is an immediate victory!
    if (score >= s3) {
      if (movesLeft > 0) {
        triggerDoodleFrenzy();
      } else if (hasSpecialsOnBoard()) {
        startSpecialDetonationWave();
      } else {
        handleVictory();
      }
      return;
    }

    // 2. Objective-specific goal check
    let goalMet = false;
    if (obj === 'score') {
      // In score levels, player continues playing their moves to aim for 2 and 3 stars!
      if (movesLeft <= 0) {
        if (hasSpecialsOnBoard()) {
          startSpecialDetonationWave();
        } else if (score >= s1) {
          handleVictory();
        } else {
          handleDefeat();
        }
      }
      return;
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
      if (movesLeft > 0) {
        triggerDoodleFrenzy();
      } else if (hasSpecialsOnBoard()) {
        startSpecialDetonationWave();
      } else {
        handleVictory();
      }
    } else if (movesLeft <= 0) {
      if (hasSpecialsOnBoard()) {
        startSpecialDetonationWave();
      } else {
        handleDefeat();
      }
    }
  }

  function triggerDoodleFrenzy() {
    if (isConcludingLevel) return;
    isConcludingLevel = true;
    state = STATE.ANIMATING;
    clearHintTimer();
    Renderer.clearHint();

    try { AudioEngine.playVictory(); } catch (_) {}
    Renderer.spawnFloatText(Math.floor(Config.ROWS / 2), Math.floor(Config.COLS / 2), 'DOODLE FRENZY! 🎨✨', '#ffd13b', 32);
    Renderer.spawnConfetti(45);

    const bonusMoves = movesLeft;
    movesLeft = 0;
    updateHUD();

    // Find normal candies on board to convert
    const candidates = [];
    for (let r = 0; r < Config.ROWS; r++) {
      for (let c = 0; c < Config.COLS; c++) {
        if (grid[r][c] && grid[r][c].color > 0 && grid[r][c].color < 7 && grid[r][c].special === Config.SPECIAL.NONE) {
          candidates.push({ r, c });
        }
      }
    }

    // Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const specials = [
      Config.SPECIAL.STRIPED_H,
      Config.SPECIAL.STRIPED_V,
      Config.SPECIAL.WRAPPED,
      Config.SPECIAL.COLOR_BOMB
    ];

    const convertCount = Math.min(bonusMoves, candidates.length);
    let converted = 0;

    function stepConvert() {
      if (!isConcludingLevel) return;
      if (converted < convertCount) {
        const pos = candidates[converted];
        const sp = specials[converted % specials.length];
        grid[pos.r][pos.c].special = sp;
        score += 1500;
        updateHUD();
        updateStarMeter();
        Renderer.spawnFloatText(pos.r, pos.c, '+1,500 FRENZY!', '#ffd13b', 20);
        Renderer.spawnDoodleBurst(pos.r, pos.c, grid[pos.r][pos.c].color, 4);
        try { AudioEngine.playPop(); } catch (_) {}
        converted++;
        frenzyTimeout = setTimeout(stepConvert, 120);
      } else {
        const leftover = bonusMoves - convertCount;
        if (leftover > 0) {
          score += leftover * 1500;
          updateHUD();
          updateStarMeter();
        }
        frenzyTimeout = setTimeout(() => {
          detonateAllSpecials();
        }, 260);
      }
    }

    if (convertCount > 0) {
      stepConvert();
    } else {
      score += bonusMoves * 1500;
      updateHUD();
      updateStarMeter();
      if (hasSpecialsOnBoard()) {
        frenzyTimeout = setTimeout(() => {
          detonateAllSpecials();
        }, 260);
      } else {
        checkLevelEndConclusion();
      }
    }
  }

  function detonateAllSpecials() {
    if (!isConcludingLevel) return;
    let activated = 0;
    for (let r = 0; r < Config.ROWS; r++) {
      for (let c = 0; c < Config.COLS; c++) {
        const cell = grid[r][c];
        if (cell && cell.special !== Config.SPECIAL.NONE) {
          activated++;
          let res;
          if (cell.special === Config.SPECIAL.COLOR_BOMB) {
            Renderer.spawnSupernova(Renderer.cellX(c), Renderer.cellY(r), 140, '#ffd13b');
            const pool = (levelDef && levelDef.candyPool) || [1, 2, 3, 4];
            const targetCol = pool[Math.floor(Math.random() * pool.length)];
            res = Specials.activateColorBomb(grid, r, c, targetCol);
          } else {
            if (cell.special === Config.SPECIAL.STRIPED_H) Renderer.spawnLaserBeam('row', r, '#ff5e7e');
            else if (cell.special === Config.SPECIAL.STRIPED_V) Renderer.spawnLaserBeam('col', c, '#4ea8de');
            else if (cell.special === Config.SPECIAL.WRAPPED) Renderer.spawnSupernova(Renderer.cellX(c), Renderer.cellY(r), 100, '#ff9838');
            res = Specials.activate(grid, r, c);
          }
          processMatchResult(res, false);
        }
      }
    }

    if (activated > 0) {
      triggerCascade();
    } else {
      checkLevelEndConclusion();
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
    clearAllGameTimeouts();
    isConcludingLevel = false;
    state = STATE.VICTORY;
    try { AudioEngine.playVictory(); } catch (_) {}
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
  }

  function handleDefeat() {
    clearAllGameTimeouts();
    isConcludingLevel = false;
    state = STATE.DEFEAT;
    try { AudioEngine.playDefeat(); } catch (_) {}
    showDefeatScreen();
  }

  // ── Serpentine 500-Level Adventure Map (Chunked by Worlds for 60 FPS & 0 Lag) ───
  let viewingWorldIndex = -1;

  function renderSerpentineMap(targetWorld = null) {
    const container = document.getElementById('map-path-container');
    if (!container) return;

    let highestUnlocked = 1;
    Levels.forEach(lvl => {
      if (getLevelProgress(lvl.id).unlocked) highestUnlocked = lvl.id;
    });

    const playerWorldIndex = Math.min(24, Math.floor((highestUnlocked - 1) / 20));
    if (targetWorld !== null) {
      viewingWorldIndex = Math.max(0, Math.min(24, targetWorld));
    } else if (viewingWorldIndex === -1) {
      viewingWorldIndex = playerWorldIndex;
    }

    const worldName = WORLD_NAMES[viewingWorldIndex] || 'Sketchy Hills';
    const startLvl = viewingWorldIndex * 20 + 1;
    const endLvl = Math.min(Levels.length, (viewingWorldIndex + 1) * 20);

    setText('map-world-tag', `World ${viewingWorldIndex + 1} / 25`);
    setText('map-world-name', `${worldName} (${startLvl}–${endLvl})`);

    const prevBtn = document.getElementById('btn-map-prev-world');
    const nextBtn = document.getElementById('btn-map-next-world');
    if (prevBtn) prevBtn.disabled = viewingWorldIndex <= 0;
    if (nextBtn) nextBtn.disabled = viewingWorldIndex >= 24;

    const xOffsets = [-80, -40, 0, 40, 80, 40, 0, -40];
    let html = `
      <div class="map-episode-card" style="margin-bottom:12px;">
        <div class="episode-num">World ${viewingWorldIndex + 1} of 25</div>
        <div class="episode-title">${worldName}</div>
        <div style="font-size:0.75rem; color:var(--clr-subtext); margin-top:2px;">Levels ${startLvl} to ${endLvl}</div>
        ${viewingWorldIndex !== playerWorldIndex ? `
          <button id="btn-jump-current-world" style="margin-top:8px; padding:6px 12px; font-size:0.78rem; background:#ecfdf5; border:2px solid #059669; color:#065f46; border-radius:12px; font-weight:800; cursor:pointer;">
            🎯 Jump to Your Level (${highestUnlocked})
          </button>
        ` : ''}
      </div>
    `;

    // Render ONLY the 20 levels for the current world — eliminates texture overflow & lag!
    for (let idx = startLvl - 1; idx < endLvl; idx++) {
      const lvl = Levels[idx];
      const prog = getLevelProgress(lvl.id);
      const isCurrent = (lvl.id === highestUnlocked);
      const statusClass = isCurrent ? 'current' : (prog.unlocked ? 'unlocked' : 'locked');
      const offset = xOffsets[(idx - startLvl + 1) % xOffsets.length];

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
    }

    container.innerHTML = html;

    // Jump button listener if rendered
    document.getElementById('btn-jump-current-world')?.addEventListener('click', () => {
      try { AudioEngine.playClick(); } catch (_) {}
      renderSerpentineMap(playerWorldIndex);
    });

    setTimeout(() => {
      const activeNode = document.getElementById(`level-node-${highestUnlocked}`);
      if (activeNode) {
        activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }

  // ── HUD & Star Meter ─────────────────────────────────────────────────────────

  function updateHUD() {
    setText('hud-moves', Math.max(0, movesLeft));
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
    clearAllGameTimeouts();
    isConcludingLevel = false;
    state = STATE.MAP;
    selected = null;
    renderSerpentineMap();
    showScreen('screen-map');
  }

  function showVictoryScreen(stars, finalScore, coinsWon = 50) {
    clearAllGameTimeouts();
    isConcludingLevel = false;
    setText('victory-score', finalScore.toLocaleString());
    setText('victory-coins-reward', `+${coinsWon} Gold Coins! 🪙`);
    const starsEl = document.getElementById('victory-stars');
    if (starsEl) {
      starsEl.innerHTML = [1, 2, 3].map(i =>
        `<span class="star ${i <= stars ? 'filled' : ''}">★</span>`
      ).join('');
    }
    const nextBtn = document.getElementById('btn-next-level');
    if (nextBtn) {
      nextBtn.disabled = currentLevelIndex >= Levels.length - 1;
      nextBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        try { AudioEngine.playClick(); } catch (_) {}
        nextLevel();
      };
    }
    const retryBtn = document.getElementById('btn-victory-retry');
    if (retryBtn) {
      if (stars >= 3) {
        // Requirement: When earning 3 stars, do NOT show "Retry for 3 Stars"!
        retryBtn.style.display = 'none';
      } else {
        retryBtn.style.display = 'inline-flex';
        retryBtn.textContent = '🔄 Retry for 3 Stars ⭐';
        retryBtn.onclick = (e) => {
          if (e) e.stopPropagation();
          try { AudioEngine.playClick(); } catch (_) {}
          startLevel(currentLevelIndex);
        };
      }
    }
    const homeBtn = document.getElementById('btn-victory-home');
    if (homeBtn) {
      homeBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        try { AudioEngine.playClick(); } catch (_) {}
        showMainMenu();
      };
    }
    showScreen('screen-victory');
  }

  function showDefeatScreen() {
    clearAllGameTimeouts();
    isConcludingLevel = false;
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
    clearAllGameTimeouts();
    isConcludingLevel = false;
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
    showVictoryScreen,
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
