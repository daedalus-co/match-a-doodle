/**
 * Doodle Premium — Canvas Renderer
 * Hand-drawn aesthetic inspired by Apple craftsmanship:
 * - Warm notebook paper / sketchbook background with fine dot grid
 * - Sketched vector doodle sweets with ink outlines and watercolor fills
 * - Distinct pulsating glow for all special powerup tiles (Striped, Wrapped, Color Bomb)
 * - Subtle selected-icon bounce & soft pencil drop-shadow
 * - Grand destruction animations for Powerup Combos (Giant Cross Laser, 5x5 Mega Blast, Prismatic Supernova)
 * - Doodle burst shockwave rings on 3 & 4 matches
 */

'use strict';

const Renderer = (() => {

  const { COLS, ROWS, SPECIAL, OBSTACLE, CANDY_COLORS, INGREDIENT, PARTICLE } = Config;

  let canvas, ctx;
  let tileSize = 46;
  let boardOffsetX = 0, boardOffsetY = 0;
  let dpr = 1;

  // Particle & Doodle Burst System
  const particles = [];
  const doodleBursts = [];
  const floatTexts = [];
  const comboBeams = [];  // Grand visual destruction beams/blasts for powerup combos

  // Hint & Glow Pulse Phase
  let hintCells = null;
  let hintPhase = 0;
  let globalAnimPhase = 0;

  // Swap & Drop Animations
  let activeSwapAnim = null;
  let activeDropAnims = [];

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  let currentWorld = 0;
  let bgPattern = null;

  function setWorld(worldIdx) {
    currentWorld = Math.max(0, worldIdx || 0);
    createBgPattern();
  }

  function getWorld() {
    return currentWorld;
  }

  function createBgPattern() {
    try {
      const pCanvas = document.createElement('canvas');
      const pCtx = pCanvas.getContext('2d');
      const theme = currentWorld % 8;

      if (theme === 1) {
        // Graph Paper Grove: blueprint grid lines
        pCanvas.width = 20;
        pCanvas.height = 20;
        pCtx.strokeStyle = 'rgba(78, 168, 222, 0.18)';
        pCtx.lineWidth = 1;
        pCtx.strokeRect(0.5, 0.5, 19, 19);
      } else if (theme === 3) {
        // Chalkboard Caverns: chalk dust flecks
        pCanvas.width = 24;
        pCanvas.height = 24;
        pCtx.fillStyle = 'rgba(60, 55, 50, 0.08)';
        pCtx.fillRect(4, 4, 2, 2);
        pCtx.fillRect(16, 12, 1.5, 1.5);
        pCtx.fillRect(8, 20, 1.5, 1.5);
      } else if (theme === 4) {
        // Origami Oasis: diagonal crease dashes
        pCanvas.width = 24;
        pCanvas.height = 24;
        pCtx.strokeStyle = 'rgba(80, 70, 60, 0.09)';
        pCtx.lineWidth = 1;
        pCtx.setLineDash([3, 5]);
        pCtx.beginPath();
        pCtx.moveTo(0, 0); pCtx.lineTo(24, 24);
        pCtx.stroke();
      } else if (theme === 5) {
        // Watercolor Waves: subtle wave ripples
        pCanvas.width = 28;
        pCanvas.height = 20;
        pCtx.strokeStyle = 'rgba(78, 168, 222, 0.14)';
        pCtx.lineWidth = 1.2;
        pCtx.beginPath();
        pCtx.moveTo(2, 10);
        pCtx.bezierCurveTo(9, 4, 19, 16, 26, 10);
        pCtx.stroke();
      } else if (theme === 6) {
        // Inkwell Valley: parchment ledger lines
        pCanvas.width = 20;
        pCanvas.height = 18;
        pCtx.strokeStyle = 'rgba(120, 80, 50, 0.12)';
        pCtx.lineWidth = 1;
        pCtx.beginPath();
        pCtx.moveTo(0, 9); pCtx.lineTo(20, 9);
        pCtx.stroke();
      } else {
        // Themes 0, 2, 7: Classic notebook paper dot grid
        pCanvas.width = 16;
        pCanvas.height = 16;
        pCtx.fillStyle = 'rgba(70, 60, 50, 0.08)';
        pCtx.beginPath();
        pCtx.arc(8, 8, 1, 0, Math.PI * 2);
        pCtx.fill();
      }
      bgPattern = ctx ? ctx.createPattern(pCanvas, 'repeat') : null;
    } catch (_) {
      bgPattern = null;
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const containerWidth  = Math.min(window.innerWidth, 460);
    const containerHeight = window.innerHeight - 250;
    const maxTile = Math.min(
      Math.floor((containerWidth - 24) / COLS),
      Math.floor((containerHeight - 24) / ROWS)
    );
    tileSize = Math.max(34, Math.min(50, maxTile));

    const boardW = tileSize * COLS;
    const boardH = tileSize * ROWS;

    canvas.width  = boardW * dpr;
    canvas.height = boardH * dpr;
    canvas.style.width  = boardW + 'px';
    canvas.style.height = boardH + 'px';
    ctx.scale(dpr, dpr);

    boardOffsetX = 0;
    boardOffsetY = 0;

    createBgPattern();
  }

  function getTileSize() { return tileSize; }
  function getBoardOffset() { return { x: boardOffsetX, y: boardOffsetY }; }

  function cellX(c) { return boardOffsetX + c * tileSize + tileSize / 2; }
  function cellY(r) { return boardOffsetY + r * tileSize + tileSize / 2; }

  function pixelToGrid(px, py) {
    const c = Math.floor((px - boardOffsetX) / tileSize);
    const r = Math.floor((py - boardOffsetY) / tileSize);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  }

  function clientToPixel(clientX, clientY) {
    if (!canvas) return { px: 0, py: 0 };
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { px: 0, py: 0 };
    const boardW = tileSize * COLS;
    const boardH = tileSize * ROWS;
    const px = (clientX - rect.left) * (boardW / rect.width);
    const py = (clientY - rect.top) * (boardH / rect.height);
    return { px, py };
  }

  function clientToGrid(clientX, clientY) {
    const { px, py } = clientToPixel(clientX, clientY);
    return pixelToGrid(px, py);
  }

  // ── Color & Palette ──────────────────────────────────────────────────────────
  const DOODLE_PALETTE = {
    1: { fill: '#ff5e7e', light: '#ffa3b5', dark: '#d81b47', ink: '#3b121e', glow: 'rgba(255, 94, 126, 0.70)' },
    2: { fill: '#ff9838', light: '#ffc885', dark: '#d96c00', ink: '#3b2105', glow: 'rgba(255, 152, 56, 0.70)' },
    3: { fill: '#ffd13b', light: '#ffeb8a', dark: '#cca000', ink: '#3b3005', glow: 'rgba(255, 209, 59, 0.75)' },
    4: { fill: '#4cd97b', light: '#98f5b4', dark: '#1ea64d', ink: '#0a3317', glow: 'rgba(76, 217, 123, 0.70)' },
    5: { fill: '#4ea8de', light: '#99d2f2', dark: '#187bb9', ink: '#0c263d', glow: 'rgba(78, 168, 222, 0.70)' },
    6: { fill: '#b57bed', light: '#dab6ff', dark: '#883ed6', ink: '#2d0f48', glow: 'rgba(181, 123, 237, 0.70)' },
  };

  function getDoodleColor(id) {
    return DOODLE_PALETTE[id] || { fill: '#9e9e9e', light: '#e0e0e0', dark: '#616161', ink: '#212121', glow: 'rgba(158, 158, 158, 0.5)' };
  }

  // ── Background: Premium Notebook Paper ───────────────────────────────────────
  function drawBackground() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = '#faf7f0';
    ctx.fillRect(0, 0, w, h);

    if (bgPattern) {
      ctx.fillStyle = bgPattern;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.strokeStyle = 'rgba(40, 30, 20, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  // ── Animations ───────────────────────────────────────────────────────────────

  function startSwapAnimation(r1, c1, r2, c2, duration = 180, onComplete = null) {
    activeSwapAnim = {
      r1, c1, r2, c2,
      duration,
      startTime: performance.now(),
      onComplete
    };
  }

  function startDropAnimations(drops, duration = 220) {
    const now = performance.now();
    activeDropAnims = drops.map(d => {
      const startY = d.fromR < 0 ? cellY(0) - (Math.abs(d.fromR)) * tileSize : cellY(d.fromR);
      const targetY = cellY(d.r);
      return {
        r: d.r,
        c: d.c,
        startY,
        targetY,
        currentY: startY,
        startTime: now,
        duration: duration + (d.r * 15)
      };
    });
  }

  function updateAnimations(now) {
    globalAnimPhase += 0.05;

    if (activeSwapAnim) {
      const elapsed = now - activeSwapAnim.startTime;
      activeSwapAnim.progress = Math.min(1, elapsed / activeSwapAnim.duration);
      if (activeSwapAnim.progress >= 1) {
        const cb = activeSwapAnim.onComplete;
        activeSwapAnim = null;
        if (cb) cb();
      }
    }

    if (activeDropAnims.length > 0) {
      let allDone = true;
      activeDropAnims.forEach(anim => {
        const elapsed = now - anim.startTime;
        const p = Math.min(1, elapsed / anim.duration);
        const ease = p < 0.8 ? (p / 0.8) : 1 + Math.sin((p - 0.8) / 0.2 * Math.PI) * 0.08;
        anim.currentY = anim.startY + (anim.targetY - anim.startY) * Math.min(1, ease);
        if (p < 1) allDone = false;
      });
      if (allDone) activeDropAnims = [];
    }
  }

  // ── Cell Rendering ───────────────────────────────────────────────────────────

  function drawCell(r, c, cell, shakeOffset = { x: 0, y: 0 }, customPos = null, isSelected = false) {
    const ts = tileSize;
    const pad = 3;
    let cx = customPos ? customPos.x : cellX(c) + shakeOffset.x;
    let cy = customPos ? customPos.y : cellY(r) + shakeOffset.y;
    const x = cx - ts / 2 + pad;
    const y = cy - ts / 2 + pad;
    const w = ts - pad * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, w);
    ctx.restore();

    // ── Obstacle: Ink Patches (Jelly) ─────────────────────────────────────────
    if (cell.obstacle === OBSTACLE.JELLY_SINGLE || cell.obstacle === OBSTACLE.JELLY_DOUBLE) {
      ctx.save();
      const isDouble = cell.obstacle === OBSTACLE.JELLY_DOUBLE;
      ctx.fillStyle = isDouble ? 'rgba(235, 75, 140, 0.28)' : 'rgba(235, 75, 140, 0.16)';
      ctx.strokeStyle = isDouble ? 'rgba(210, 45, 115, 0.65)' : 'rgba(210, 45, 115, 0.35)';
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';

      ctx.beginPath();
      roundRect(ctx, x + 2, y + 2, w - 4, w - 4, 8);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = isDouble ? 'rgba(210, 45, 115, 0.35)' : 'rgba(210, 45, 115, 0.2)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + w - 8, y + w - 5);
      ctx.moveTo(x + 10, y + 6); ctx.lineTo(x + w - 6, y + w - 10);
      ctx.stroke();

      ctx.restore();
    }

    // ── Obstacle: Sketch Tape / Frosting ──────────────────────────────────────
    if (cell.obstacle === OBSTACLE.FROSTING_1 || cell.obstacle === OBSTACLE.FROSTING_2) {
      ctx.save();
      const isThick = cell.obstacle === OBSTACLE.FROSTING_2;
      ctx.fillStyle = isThick ? 'rgba(200, 225, 245, 0.85)' : 'rgba(225, 240, 255, 0.72)';
      ctx.strokeStyle = '#6ca2c7';
      ctx.lineWidth = 2;

      ctx.beginPath();
      roundRect(ctx, x + 1, y + 1, w - 2, w - 2, 7);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(70, 130, 180, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + w - 4); ctx.lineTo(x + w - 4, y + 4);
      ctx.moveTo(x + w/2 - 4, y + 4); ctx.lineTo(x + w - 4, y + w/2 + 4);
      ctx.stroke();

      ctx.restore();
      return;
    }

    if (cell.color === 0) return;

    let radius = w / 2 - 1;

    // ── SUBTLE SELECTION ANIMATION & SHADOW ────────────────────────────────────
    if (isSelected) {
      const breath = 1.08 + Math.sin(globalAnimPhase * 2) * 0.04;
      radius *= breath;

      ctx.save();
      ctx.fillStyle = 'rgba(43, 38, 35, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, radius, radius * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── DISTINCT POWERUP GLOW ANIMATION ───────────────────────────────────────
    const isSpecial = (cell.special !== SPECIAL.NONE);
    if (isSpecial) {
      ctx.save();
      const pulse = 0.5 + Math.sin(globalAnimPhase * 2.5) * 0.5;
      const glowR = radius + 3 + pulse * 5;

      if (cell.special === SPECIAL.COLOR_BOMB) {
        const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, glowR + 6);
        glowGrad.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
        glowGrad.addColorStop(0.5, 'rgba(255, 94, 126, 0.4)');
        glowGrad.addColorStop(1, 'rgba(78, 168, 222, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR + 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const col = getDoodleColor(cell.color);
        ctx.fillStyle = col.glow || 'rgba(255, 209, 59, 0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Special: Rainbow Ink Splat / Doodle Color Bomb ───────────────────────
    if (cell.special === SPECIAL.COLOR_BOMB) {
      drawDoodleColorBomb(cx, cy, radius);
      if (isSelected) ctx.restore();
      return;
    }

    // Ingredients
    if (cell.color === INGREDIENT.CHERRY || cell.color === INGREDIENT.HAZELNUT) {
      drawDoodleIngredient(cx, cy, radius, cell.color);
      if (isSelected) ctx.restore();
      return;
    }

    // Main Doodle Sweet
    drawDoodleCandy(cx, cy, radius, cell.color);

    // Special Overlays
    if (cell.special === SPECIAL.STRIPED_H) drawDoodleStripedH(cx, cy, radius, cell.color);
    if (cell.special === SPECIAL.STRIPED_V) drawDoodleStripedV(cx, cy, radius, cell.color);
    if (cell.special === SPECIAL.WRAPPED)   drawDoodleWrapped(cx, cy, radius, cell.color);

    if (isSelected) ctx.restore();
  }

  // ── Hand-Drawn Doodle Sweet Geometries ───────────────────────────────────────
  function drawDoodleCandy(cx, cy, r, colorId) {
    const col = getDoodleColor(colorId);

    ctx.save();
    ctx.fillStyle = col.fill;
    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const theme = currentWorld % 8;
    if (theme === 1) {
      // World 2, 10, 18... Graph Paper Grove (Drafting & Blueprint Geometry)
      switch (colorId) {
        case 1: drawIsometricCubeDoodle(cx, cy, r); break;
        case 2: drawCompassDoodle(cx, cy, r); break;
        case 3: drawTriangleRulerDoodle(cx, cy, r); break;
        case 4: drawInfinityDoodle(cx, cy, r); break;
        case 5: drawTargetDoodle(cx, cy, r); break;
        case 6: drawCrystalPrismDoodle(cx, cy, r); break;
        default: drawTargetDoodle(cx, cy, r); break;
      }
    } else if (theme === 2) {
      // World 3, 11, 19... Crayon Canyon (Nature & Wilderness)
      switch (colorId) {
        case 1: drawAppleDoodle(cx, cy, r); break;
        case 2: drawSunshineDoodle(cx, cy, r); break;
        case 3: drawLightningDoodle(cx, cy, r); break;
        case 4: drawLeafDoodle(cx, cy, r); break;
        case 5: drawCloudRainDoodle(cx, cy, r); break;
        case 6: drawButterflyDoodle(cx, cy, r); break;
        default: drawAppleDoodle(cx, cy, r); break;
      }
    } else if (theme === 3) {
      // World 4, 12, 20... Chalkboard Caverns (Cosmos & Science)
      switch (colorId) {
        case 1: drawFlaskDoodle(cx, cy, r); break;
        case 2: drawSaturnDoodle(cx, cy, r); break;
        case 3: drawLightbulbDoodle(cx, cy, r); break;
        case 4: drawAtomDoodle(cx, cy, r); break;
        case 5: drawCrescentMoonDoodle(cx, cy, r); break;
        case 6: drawRocketDoodle(cx, cy, r); break;
        default: drawFlaskDoodle(cx, cy, r); break;
      }
    } else if (theme === 4) {
      // World 5, 13, 21... Origami Oasis (Paper Folding Art)
      switch (colorId) {
        case 1: drawOrigamiCraneDoodle(cx, cy, r); break;
        case 2: drawOrigamiBoatDoodle(cx, cy, r); break;
        case 3: drawOrigamiShurikenDoodle(cx, cy, r); break;
        case 4: drawOrigamiLotusDoodle(cx, cy, r); break;
        case 5: drawOrigamiPlaneDoodle(cx, cy, r); break;
        case 6: drawOrigamiFoxDoodle(cx, cy, r); break;
        default: drawOrigamiCraneDoodle(cx, cy, r); break;
      }
    } else if (theme === 5) {
      // World 6, 14, 22... Watercolor Waves (Marine & Aquatic)
      switch (colorId) {
        case 1: drawSeashellDoodle(cx, cy, r); break;
        case 2: drawStarfishDoodle(cx, cy, r); break;
        case 3: drawFishDoodle(cx, cy, r); break;
        case 4: drawOceanWaveDoodle(cx, cy, r); break;
        case 5: drawJellyfishDoodle(cx, cy, r); break;
        case 6: drawSeahorseDoodle(cx, cy, r); break;
        default: drawSeashellDoodle(cx, cy, r); break;
      }
    } else if (theme === 6) {
      // World 7, 15, 23... Inkwell Valley (Vintage Calligraphy)
      switch (colorId) {
        case 1: drawWaxSealDoodle(cx, cy, r); break;
        case 2: drawQuillPenDoodle(cx, cy, r); break;
        case 3: drawSkeletonKeyDoodle(cx, cy, r); break;
        case 4: drawTrebleClefDoodle(cx, cy, r); break;
        case 5: drawInkDropDoodle(cx, cy, r); break;
        case 6: drawCrownDoodle(cx, cy, r); break;
        default: drawWaxSealDoodle(cx, cy, r); break;
      }
    } else if (theme === 7) {
      // World 8, 16, 24... Pastel Peaks (Bakery & Confections)
      switch (colorId) {
        case 1: drawCupcakeDoodle(cx, cy, r); break;
        case 2: drawDonutDoodle(cx, cy, r); break;
        case 3: drawCroissantDoodle(cx, cy, r); break;
        case 4: drawLollipopDoodle(cx, cy, r); break;
        case 5: drawIceCreamDoodle(cx, cy, r); break;
        case 6: drawBonbonDoodle(cx, cy, r); break;
        default: drawCupcakeDoodle(cx, cy, r); break;
      }
    } else {
      // Theme 0: Sketchy Hills (Classic Sketch Doodles)
      switch (colorId) {
        case 1: drawHeartDoodle(cx, cy, r); break;
        case 2: drawOrangeSwirlDoodle(cx, cy, r); break;
        case 3: drawStarDoodle(cx, cy, r); break;
        case 4: drawCloverDoodle(cx, cy, r); break;
        case 5: drawDewdropDoodle(cx, cy, r); break;
        case 6: drawGrapeDoodle(cx, cy, r); break;
        default:
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
      }
    }

    ctx.restore();

    ctx.save();
    ctx.fillStyle = col.light;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.28, r * 0.28, r * 0.14, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHeartDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.7);
    ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.2, cx - s * 1.1, cy - s * 1.0, cx, cy - s * 0.45);
    ctx.bezierCurveTo(cx + s * 1.1, cy - s * 1.0, cx + s * 1.1, cy - s * 0.2, cx, cy + s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.8;
    ctx.arc(cx - s * 0.35, cy - s * 0.35, s * 0.22, Math.PI, Math.PI * 1.6);
    ctx.stroke();
  }

  function drawOrangeSwirlDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2.0;
    for (let a = 0; a < Math.PI * 3.5; a += 0.15) {
      const rad = (a / (Math.PI * 3.5)) * (s * 0.75);
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function drawStarDoodle(cx, cy, r) {
    const points = 5;
    const outer = r * 0.95;
    const inner = r * 0.44;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rad = (i % 2 === 0) ? outer : inner;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloverDoodle(cx, cy, r) {
    const s = r * 0.78;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const px = cx + Math.cos(a) * (s * 0.45);
      const py = cy + Math.sin(a) * (s * 0.45);
      ctx.arc(px, py, s * 0.48, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDewdropDoodle(cx, cy, r) {
    const s = r * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.bezierCurveTo(cx + s * 0.8, cy + s * 0.1, cx + s * 0.7, cy + s * 0.85, cx, cy + s * 0.95);
    ctx.bezierCurveTo(cx - s * 0.7, cy + s * 0.85, cx - s * 0.8, cy + s * 0.1, cx, cy - s * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx + s * 0.25, cy + s * 0.2, s * 0.35, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }

  function drawGrapeDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = cx + Math.cos(a) * s;
      const py = cy + Math.sin(a) * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(43, 38, 35, 0.4)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5); ctx.lineTo(cx, cy + s * 0.5);
    ctx.moveTo(cx - s * 0.45, cy); ctx.lineTo(cx + s * 0.45, cy);
    ctx.stroke();
  }

  // ── Theme 1: Graph Paper Grove (Geometry & Drafting) ─────────────────────────
  function drawIsometricCubeDoodle(cx, cy, r) {
    const s = r * 0.82;
    const topY = cy - s * 0.9;
    const midY = cy - s * 0.1;
    const botY = cy + s * 0.8;
    const leftX = cx - s * 0.85;
    const rightX = cx + s * 0.85;

    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(rightX, cy - s * 0.45);
    ctx.lineTo(rightX, cy + s * 0.35);
    ctx.lineTo(cx, botY);
    ctx.lineTo(leftX, cy + s * 0.35);
    ctx.lineTo(leftX, cy - s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, midY); ctx.lineTo(cx, botY);
    ctx.moveTo(cx, midY); ctx.lineTo(leftX, cy - s * 0.45);
    ctx.moveTo(cx, midY); ctx.lineTo(rightX, cy - s * 0.45);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(rightX, cy - s * 0.45);
    ctx.lineTo(cx, midY);
    ctx.lineTo(leftX, cy - s * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  function drawCompassDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.8);
    ctx.lineTo(cx - s * 0.75, cy + s * 0.85);
    ctx.lineTo(cx - s * 0.4, cy + s * 0.85);
    ctx.lineTo(cx, cy - s * 0.4);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.85);
    ctx.lineTo(cx + s * 0.75, cy + s * 0.85);
    ctx.lineTo(cx, cy - s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.75, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.1, s * 0.55, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  function drawTriangleRulerDoodle(cx, cy, r) {
    const s = r * 0.88;
    const x1 = cx - s * 0.75, y1 = cy + s * 0.85;
    const x2 = cx + s * 0.85, y2 = cy + s * 0.85;
    const x3 = cx - s * 0.75, y3 = cy - s * 0.85;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#faf7f0';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy + s * 0.55);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.55);
    ctx.lineTo(cx - s * 0.45, cy - s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const nx = cx - s * 0.5 + i * (s * 0.32);
      ctx.moveTo(nx, y2);
      ctx.lineTo(nx, y2 - s * 0.15);
    }
    ctx.stroke();
  }

  function drawInfinityDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    const w = s * 0.85;
    const h = s * 0.55;
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx - w * 0.6, cy - h, cx - w, cy - h, cx - w, cy);
    ctx.bezierCurveTo(cx - w, cy + h, cx - w * 0.6, cy + h, cx, cy);
    ctx.bezierCurveTo(cx + w * 0.6, cy - h, cx + w, cy - h, cx + w, cy);
    ctx.bezierCurveTo(cx + w, cy + h, cx + w * 0.6, cy + h, cx, cy);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#faf7f0';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.48, cy, s * 0.22, s * 0.18, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.48, cy, s * 0.22, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawTargetDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.95, cy); ctx.lineTo(cx + s * 0.95, cy);
    ctx.moveTo(cx, cy - s * 0.95); ctx.lineTo(cx, cy + s * 0.95);
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrystalPrismDoodle(cx, cy, r) {
    const s = r * 0.88;
    const topY = cy - s * 0.9;
    const botY = cy + s * 0.9;
    const yMid1 = cy - s * 0.35;
    const yMid2 = cy + s * 0.35;
    const xWide = s * 0.8;
    const xMid = s * 0.45;

    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx + xMid, yMid1);
    ctx.lineTo(cx + xWide, yMid2);
    ctx.lineTo(cx, botY);
    ctx.lineTo(cx - xWide, yMid2);
    ctx.lineTo(cx - xMid, yMid1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, topY); ctx.lineTo(cx, botY);
    ctx.moveTo(cx - xMid, yMid1); ctx.lineTo(cx + xMid, yMid1);
    ctx.moveTo(cx - xWide, yMid2); ctx.lineTo(cx + xWide, yMid2);
    ctx.stroke();
  }

  // ── Theme 2: Crayon Canyon (Nature & Wilderness) ─────────────────────────────
  function drawAppleDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.55);
    ctx.bezierCurveTo(cx + s * 0.4, cy - s * 0.85, cx + s * 0.95, cy - s * 0.4, cx + s * 0.9, cy + s * 0.3);
    ctx.bezierCurveTo(cx + s * 0.85, cy + s * 0.85, cx + s * 0.2, cy + s * 0.95, cx, cy + s * 0.75);
    ctx.bezierCurveTo(cx - s * 0.2, cy + s * 0.95, cx - s * 0.85, cy + s * 0.85, cx - s * 0.9, cy + s * 0.3);
    ctx.bezierCurveTo(cx - s * 0.95, cy - s * 0.4, cx - s * 0.4, cy - s * 0.85, cx, cy - s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2.4;
    ctx.moveTo(cx, cy - s * 0.55);
    ctx.quadraticCurveTo(cx + s * 0.15, cy - s * 0.9, cx + s * 0.35, cy - s * 0.88);
    ctx.stroke();

    ctx.fillStyle = '#4cd97b';
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.32, cy - s * 0.75, s * 0.22, s * 0.12, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawSunshineDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x1 = cx + Math.cos(a) * (s * 0.65);
      const y1 = cy + Math.sin(a) * (s * 0.65);
      const x2 = cx + Math.cos(a) * (s * 0.95);
      const y2 = cy + Math.sin(a) * (s * 0.95);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  function drawLightningDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.1, cy - s * 0.95);
    ctx.lineTo(cx - s * 0.65, cy - s * 0.05);
    ctx.lineTo(cx - s * 0.05, cy - s * 0.05);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.95);
    ctx.lineTo(cx + s * 0.65, cy + s * 0.05);
    ctx.lineTo(cx + s * 0.05, cy + s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawLeafDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.bezierCurveTo(cx + s * 0.85, cy - s * 0.3, cx + s * 0.75, cy + s * 0.6, cx, cy + s * 0.95);
    ctx.bezierCurveTo(cx - s * 0.75, cy + s * 0.6, cx - s * 0.85, cy - s * 0.3, cx, cy - s * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.75); ctx.lineTo(cx, cy + s * 0.85);
    ctx.moveTo(cx, cy - s * 0.3); ctx.lineTo(cx + s * 0.4, cy - s * 0.15);
    ctx.moveTo(cx, cy - s * 0.3); ctx.lineTo(cx - s * 0.4, cy - s * 0.15);
    ctx.moveTo(cx, cy + s * 0.2); ctx.lineTo(cx + s * 0.35, cy + s * 0.35);
    ctx.moveTo(cx, cy + s * 0.2); ctx.lineTo(cx - s * 0.35, cy + s * 0.35);
    ctx.stroke();
  }

  function drawCloudRainDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.8, cy + s * 0.25);
    ctx.arc(cx - s * 0.45, cy + s * 0.05, s * 0.4, Math.PI * 0.8, Math.PI * 1.8);
    ctx.arc(cx + s * 0.05, cy - s * 0.25, s * 0.45, Math.PI * 1.0, Math.PI * 2.0);
    ctx.arc(cx + s * 0.55, cy + s * 0.05, s * 0.35, Math.PI * 1.3, Math.PI * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.moveTo(cx - s * 0.45, cy + s * 0.45); ctx.lineTo(cx - s * 0.55, cy + s * 0.85);
    ctx.moveTo(cx, cy + s * 0.45);           ctx.lineTo(cx - s * 0.1, cy + s * 0.85);
    ctx.moveTo(cx + s * 0.45, cy + s * 0.45); ctx.lineTo(cx + s * 0.35, cy + s * 0.85);
    ctx.stroke();
  }

  function drawButterflyDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.2);
    ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.9, cx - s * 1.0, cy - s * 0.1, cx - s * 0.3, cy);
    ctx.bezierCurveTo(cx - s * 0.85, cy + s * 0.6, cx - s * 0.5, cy + s * 0.9, cx, cy + s * 0.3);
    ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.9, cx + s * 0.85, cy + s * 0.6, cx + s * 0.3, cy);
    ctx.bezierCurveTo(cx + s * 1.0, cy - s * 0.1, cx + s * 0.9, cy - s * 0.9, cx, cy - s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.05, s * 0.1, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 1.8;
    ctx.moveTo(cx, cy - s * 0.35); ctx.quadraticCurveTo(cx - s * 0.25, cy - s * 0.75, cx - s * 0.35, cy - s * 0.8);
    ctx.moveTo(cx, cy - s * 0.35); ctx.quadraticCurveTo(cx + s * 0.25, cy - s * 0.75, cx + s * 0.35, cy - s * 0.8);
    ctx.stroke();
  }

  // ── Theme 3: Chalkboard Caverns (Cosmos & Science) ───────────────────────────
  function drawFlaskDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.25, cy - s * 0.85);
    ctx.lineTo(cx + s * 0.25, cy - s * 0.85);
    ctx.lineTo(cx + s * 0.25, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.85, cy + s * 0.75);
    ctx.quadraticCurveTo(cx, cy + s * 0.95, cx - s * 0.85, cy + s * 0.75);
    ctx.lineTo(cx - s * 0.25, cy - s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, cy - s * 0.85);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy + s * 0.25);
    ctx.quadraticCurveTo(cx, cy + s * 0.35, cx + s * 0.55, cy + s * 0.25);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - s * 0.2, cy + s * 0.55, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.25, cy + s * 0.45, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSaturnDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.05, s * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawLightbulbDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, cy + s * 0.4);
    ctx.bezierCurveTo(cx - s * 0.85, cy + s * 0.1, cx - s * 0.85, cy - s * 0.8, cx, cy - s * 0.8);
    ctx.bezierCurveTo(cx + s * 0.85, cy - s * 0.8, cx + s * 0.85, cy + s * 0.1, cx + s * 0.35, cy + s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - s * 0.25, cy + s * 0.4, s * 0.5, s * 0.35);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy + s * 0.15);
    ctx.lineTo(cx - s * 0.15, cy - s * 0.25);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.25);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.15);
    ctx.stroke();
  }

  function drawAtomDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.9, s * 0.32, 0.5, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, s * 0.9, s * 0.32, -0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx + s * 0.7, cy - s * 0.35, 2.5, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.65, cy - s * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrescentMoonDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.8, -Math.PI * 0.45, Math.PI * 0.75, false);
    ctx.arc(cx + s * 0.42, cy - s * 0.18, s * 0.65, Math.PI * 0.72, -Math.PI * 0.42, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(43, 38, 35, 0.35)';
    ctx.beginPath();
    ctx.arc(cx - s * 0.3, cy - s * 0.15, 2.5, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.22, cy + s * 0.3, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRocketDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.3, cx + s * 0.45, cy + s * 0.55);
    ctx.lineTo(cx - s * 0.45, cy + s * 0.55);
    ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.3, cx, cy - s * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.45, cy + s * 0.2); ctx.lineTo(cx - s * 0.85, cy + s * 0.7); ctx.lineTo(cx - s * 0.45, cy + s * 0.55);
    ctx.moveTo(cx + s * 0.45, cy + s * 0.2); ctx.lineTo(cx + s * 0.85, cy + s * 0.7); ctx.lineTo(cx + s * 0.45, cy + s * 0.55);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#faf7f0';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.15, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ── Theme 4: Origami Oasis (Folded Paper) ───────────────────────────────────
  function drawOrigamiCraneDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.95, cy - s * 0.75);
    ctx.lineTo(cx + s * 0.35, cy + s * 0.35);
    ctx.lineTo(cx + s * 0.75, cy + s * 0.8);
    ctx.lineTo(cx, cy + s * 0.5);
    ctx.lineTo(cx - s * 0.75, cy + s * 0.35);
    ctx.lineTo(cx - s * 0.9, cy - s * 0.1);
    ctx.lineTo(cx - s * 0.65, cy - s * 0.15);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.4, cy - s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.35); ctx.lineTo(cx, cy + s * 0.5);
    ctx.moveTo(cx, cy - s * 0.35); ctx.lineTo(cx + s * 0.35, cy + s * 0.35);
    ctx.stroke();
  }

  function drawOrigamiBoatDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.9, cy + s * 0.2);
    ctx.lineTo(cx + s * 0.9, cy + s * 0.2);
    ctx.lineTo(cx + s * 0.6, cy + s * 0.75);
    ctx.lineTo(cx - s * 0.6, cy + s * 0.75);
    ctx.closePath();
    ctx.moveTo(cx, cy - s * 0.85);
    ctx.lineTo(cx + s * 0.55, cy + s * 0.2);
    ctx.lineTo(cx - s * 0.55, cy + s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.85); ctx.lineTo(cx, cy + s * 0.75);
    ctx.stroke();
  }

  function drawOrigamiShurikenDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.95, cy);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.3);
    ctx.lineTo(cx, cy + s * 0.95);
    ctx.lineTo(cx - s * 0.3, cy + s * 0.3);
    ctx.lineTo(cx - s * 0.95, cy);
    ctx.lineTo(cx - s * 0.3, cy - s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95); ctx.lineTo(cx, cy + s * 0.95);
    ctx.moveTo(cx - s * 0.95, cy); ctx.lineTo(cx + s * 0.95, cy);
    ctx.stroke();
  }

  function drawOrigamiLotusDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.6);
    ctx.lineTo(cx - s * 0.85, cy);
    ctx.lineTo(cx - s * 0.45, cy - s * 0.5);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy - s * 0.9);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.85, cy);
    ctx.lineTo(cx, cy + s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.9); ctx.lineTo(cx, cy + s * 0.6);
    ctx.stroke();
  }

  function drawOrigamiPlaneDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.85, cy + s * 0.7);
    ctx.lineTo(cx + s * 0.25, cy + s * 0.5);
    ctx.lineTo(cx, cy + s * 0.85);
    ctx.lineTo(cx - s * 0.25, cy + s * 0.5);
    ctx.lineTo(cx - s * 0.85, cy + s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95); ctx.lineTo(cx, cy + s * 0.85);
    ctx.stroke();
  }

  function drawOrigamiFoxDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.85);
    ctx.lineTo(cx + s * 0.85, cy - s * 0.05);
    ctx.lineTo(cx + s * 0.65, cy - s * 0.9);
    ctx.lineTo(cx, cy - s * 0.3);
    ctx.lineTo(cx - s * 0.65, cy - s * 0.9);
    ctx.lineTo(cx - s * 0.85, cy - s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx - s * 0.3, cy + s * 0.15, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.3, cy + s * 0.15, 2.5, 0, Math.PI * 2);
    ctx.arc(cx, cy + s * 0.65, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Theme 5: Watercolor Waves (Marine & Aquatic) ─────────────────────────────
  function drawSeashellDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, cy + s * 0.8);
    ctx.lineTo(cx - s * 0.85, cy + s * 0.1);
    ctx.bezierCurveTo(cx - s * 0.8, cy - s * 0.8, cx + s * 0.8, cy - s * 0.8, cx + s * 0.85, cy + s * 0.1);
    ctx.lineTo(cx + s * 0.35, cy + s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.8); ctx.lineTo(cx, cy - s * 0.7);
    ctx.moveTo(cx, cy + s * 0.8); ctx.lineTo(cx - s * 0.45, cy - s * 0.55);
    ctx.moveTo(cx, cy + s * 0.8); ctx.lineTo(cx + s * 0.45, cy - s * 0.55);
    ctx.stroke();
  }

  function drawStarfishDoodle(cx, cy, r) {
    const s = r * 0.9;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = (i % 2 === 0) ? s * 0.92 : s * 0.42;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.arc(cx, cy - s * 0.45, 2.0, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.4, cy - s * 0.15, 2.0, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.4, cy - s * 0.15, 2.0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFishDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.7, cy);
    ctx.quadraticCurveTo(cx, cy - s * 0.7, cx - s * 0.45, cy);
    ctx.lineTo(cx - s * 0.9, cy - s * 0.55);
    ctx.lineTo(cx - s * 0.9, cy + s * 0.55);
    ctx.lineTo(cx - s * 0.45, cy);
    ctx.quadraticCurveTo(cx, cy + s * 0.7, cx + s * 0.7, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx + s * 0.35, cy - s * 0.15, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + s * 0.15, cy, s * 0.35, -Math.PI * 0.35, Math.PI * 0.35);
    ctx.stroke();
  }

  function drawOceanWaveDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy + s * 0.7);
    ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.7, cx, cy + s * 0.2);
    ctx.bezierCurveTo(cx + s * 0.3, cy - s * 0.3, cx + s * 0.85, cy - s * 0.85, cx + s * 0.85, cy - s * 0.2);
    ctx.bezierCurveTo(cx + s * 0.85, cy + s * 0.3, cx + s * 0.4, cy - s * 0.1, cx + s * 0.35, cy - s * 0.4);
    ctx.quadraticCurveTo(cx + s * 0.1, cy + s * 0.5, cx - s * 0.85, cy + s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + s * 0.4, cy - s * 0.5, 3.0, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.65, cy - s * 0.65, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawJellyfishDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.75, cy + s * 0.15);
    ctx.bezierCurveTo(cx - s * 0.8, cy - s * 0.85, cx + s * 0.8, cy - s * 0.85, cx + s * 0.75, cy + s * 0.15);
    ctx.quadraticCurveTo(cx, cy + s * 0.3, cx - s * 0.75, cy + s * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2.0;
    ctx.moveTo(cx - s * 0.4, cy + s * 0.2);
    ctx.quadraticCurveTo(cx - s * 0.6, cy + s * 0.55, cx - s * 0.4, cy + s * 0.85);
    ctx.moveTo(cx, cy + s * 0.25);
    ctx.quadraticCurveTo(cx + s * 0.15, cy + s * 0.55, cx, cy + s * 0.9);
    ctx.moveTo(cx + s * 0.4, cy + s * 0.2);
    ctx.quadraticCurveTo(cx + s * 0.6, cy + s * 0.55, cx + s * 0.4, cy + s * 0.85);
    ctx.stroke();
  }

  function drawSeahorseDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy - s * 0.85);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.65);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.45);
    ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.1, cx + s * 0.35, cy + s * 0.35);
    ctx.quadraticCurveTo(cx + s * 0.1, cy + s * 0.85, cx - s * 0.35, cy + s * 0.75);
    ctx.quadraticCurveTo(cx - s * 0.15, cy + s * 0.45, cx - s * 0.15, cy + s * 0.2);
    ctx.quadraticCurveTo(cx - s * 0.55, cy - s * 0.3, cx - s * 0.1, cy - s * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx + s * 0.05, cy - s * 0.55, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Theme 6: Inkwell Valley (Vintage Calligraphy) ────────────────────────────
  function drawWaxSealDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const rad = (i % 2 === 0) ? s * 0.75 : s * 0.62;
      const px = cx + Math.cos(a) * rad;
      const py = cy - s * 0.15 + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.15, s * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy + s * 0.45); ctx.lineTo(cx - s * 0.4, cy + s * 0.9); ctx.lineTo(cx - s * 0.1, cy + s * 0.8);
    ctx.moveTo(cx + s * 0.2, cy + s * 0.45); ctx.lineTo(cx + s * 0.4, cy + s * 0.9); ctx.lineTo(cx + s * 0.1, cy + s * 0.8);
    ctx.stroke();
  }

  function drawQuillPenDoodle(cx, cy, r) {
    const s = r * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.65, cy + s * 0.8);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.45);
    ctx.bezierCurveTo(cx - s * 0.2, cy, cx + s * 0.25, cy - s * 0.85, cx + s * 0.7, cy - s * 0.9);
    ctx.bezierCurveTo(cx + s * 0.85, cy - s * 0.4, cx + s * 0.2, cy + s * 0.3, cx - s * 0.35, cy + s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.65, cy + s * 0.8);
    ctx.lineTo(cx + s * 0.6, cy - s * 0.8);
    ctx.stroke();
  }

  function drawSkeletonKeyDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.52, s * 0.48, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#faf7f0';
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.52, s * 0.24, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.15);
    ctx.lineTo(cx, cy + s * 0.85);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.85);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.6);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.6);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.45);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.45);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.3);
    ctx.lineTo(cx, cy + s * 0.3);
    ctx.stroke();
  }

  function drawTrebleClefDoodle(cx, cy, r) {
    const s = r * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.85);
    ctx.bezierCurveTo(cx - s * 0.25, cy + s * 0.85, cx - s * 0.25, cy + s * 0.65, cx, cy + s * 0.65);
    ctx.lineTo(cx, cy - s * 0.55);
    ctx.bezierCurveTo(cx, cy - s * 0.9, cx + s * 0.4, cy - s * 0.9, cx + s * 0.25, cy - s * 0.45);
    ctx.bezierCurveTo(cx - s * 0.55, cy - s * 0.2, cx - s * 0.55, cy + s * 0.4, cx, cy + s * 0.4);
    ctx.bezierCurveTo(cx + s * 0.45, cy + s * 0.4, cx + s * 0.45, cy + s * 0.1, cx + s * 0.1, cy + s * 0.05);
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx - s * 0.15, cy + s * 0.78, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawInkDropDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.9);
    ctx.bezierCurveTo(cx + s * 0.75, cy - s * 0.05, cx + s * 0.75, cy + s * 0.75, cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 0.75, cy + s * 0.75, cx - s * 0.75, cy - s * 0.05, cx, cy - s * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b2623';
    ctx.beginPath();
    ctx.arc(cx + s * 0.65, cy - s * 0.55, 2.5, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.55, cy + s * 0.75, 2.0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrownDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy + s * 0.65);
    ctx.lineTo(cx + s * 0.85, cy + s * 0.65);
    ctx.lineTo(cx + s * 0.75, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.35, cy + s * 0.05);
    ctx.lineTo(cx, cy - s * 0.75);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.05);
    ctx.lineTo(cx - s * 0.75, cy - s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - s * 0.75, cy - s * 0.38, 2.8, 0, Math.PI * 2);
    ctx.arc(cx, cy - s * 0.78, 3.2, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.75, cy - s * 0.38, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ── Theme 7: Pastel Peaks (Sweet Bakery Treats) ──────────────────────────────
  function drawCupcakeDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.65, cy + s * 0.1);
    ctx.lineTo(cx + s * 0.65, cy + s * 0.1);
    ctx.lineTo(cx + s * 0.45, cy + s * 0.85);
    ctx.lineTo(cx - s * 0.45, cy + s * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx - s * 0.3, cy - s * 0.05, s * 0.35, Math.PI * 0.8, Math.PI * 1.8);
    ctx.arc(cx, cy - s * 0.35, s * 0.38, Math.PI * 1.0, Math.PI * 2.0);
    ctx.arc(cx + s * 0.3, cy - s * 0.05, s * 0.35, Math.PI * 1.2, Math.PI * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff5e7e';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.68, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawDonutDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#faf7f0';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy - s * 0.3); ctx.lineTo(cx - s * 0.35, cy - s * 0.45);
    ctx.moveTo(cx + s * 0.3, cy - s * 0.45); ctx.lineTo(cx + s * 0.45, cy - s * 0.3);
    ctx.moveTo(cx - s * 0.45, cy + s * 0.4); ctx.lineTo(cx - s * 0.3, cy + s * 0.45);
    ctx.moveTo(cx + s * 0.35, cy + s * 0.4); ctx.lineTo(cx + s * 0.5, cy + s * 0.35);
    ctx.stroke();
  }

  function drawCroissantDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy + s * 0.45);
    ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.75, cx + s * 0.7, cy - s * 0.75, cx + s * 0.85, cy + s * 0.45);
    ctx.quadraticCurveTo(cx + s * 0.35, cy + s * 0.1, cx, cy + s * 0.25);
    ctx.quadraticCurveTo(cx - s * 0.35, cy + s * 0.1, cx - s * 0.85, cy + s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy - s * 0.45); ctx.lineTo(cx - s * 0.2, cy + s * 0.15);
    ctx.moveTo(cx, cy - s * 0.6);            ctx.lineTo(cx, cy + s * 0.25);
    ctx.moveTo(cx + s * 0.3, cy - s * 0.45); ctx.lineTo(cx + s * 0.2, cy + s * 0.15);
    ctx.stroke();
  }

  function drawLollipopDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.2, s * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.18) {
      const rad = (a / (Math.PI * 3.2)) * (s * 0.5);
      const px = cx + Math.cos(a) * rad;
      const py = cy - s * 0.2 + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 2.4;
    ctx.moveTo(cx, cy + s * 0.45); ctx.lineTo(cx, cy + s * 0.95);
    ctx.stroke();
  }

  function drawIceCreamDoodle(cx, cy, r) {
    const s = r * 0.88;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy);
    ctx.lineTo(cx + s * 0.55, cy);
    ctx.lineTo(cx, cy + s * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.25, cy); ctx.lineTo(cx + s * 0.15, cy + s * 0.65);
    ctx.moveTo(cx + s * 0.25, cy); ctx.lineTo(cx - s * 0.15, cy + s * 0.65);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.28, s * 0.55, Math.PI * 0.95, Math.PI * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawBonbonDoodle(cx, cy, r) {
    const s = r * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy);
    ctx.lineTo(cx - s * 0.95, cy - s * 0.45);
    ctx.lineTo(cx - s * 0.95, cy + s * 0.45);
    ctx.closePath();
    ctx.moveTo(cx + s * 0.5, cy);
    ctx.lineTo(cx + s * 0.95, cy - s * 0.45);
    ctx.lineTo(cx + s * 0.95, cy + s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawDoodleStripedH(cx, cy, r, colorId) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.82, cy - 3.5); ctx.lineTo(cx + r * 0.82, cy - 3.5);
    ctx.moveTo(cx - r * 0.88, cy + 3.5); ctx.lineTo(cx + r * 0.88, cy + 3.5);
    ctx.stroke();

    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cy - 8); ctx.lineTo(cx - r * 0.75, cy - 8);
    ctx.moveTo(cx - r * 0.75, cy + 8); ctx.lineTo(cx + r * 0.75, cy + 8);
    ctx.stroke();

    drawSparkle(cx + r * 0.4, cy - r * 0.4, 4.5, '#ffffff');
    ctx.restore();
  }

  function drawDoodleStripedV(cx, cy, r, colorId) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy - r * 0.82); ctx.lineTo(cx - 3.5, cy + r * 0.82);
    ctx.moveTo(cx + 3.5, cy - r * 0.88); ctx.lineTo(cx + 3.5, cy + r * 0.88);
    ctx.stroke();

    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - r * 0.75); ctx.lineTo(cx - 8, cy + r * 0.75);
    ctx.moveTo(cx + 8, cy - r * 0.75); ctx.lineTo(cx + 8, cy + r * 0.75);
    ctx.stroke();

    drawSparkle(cx + r * 0.4, cy - r * 0.4, 4.5, '#ffffff');
    ctx.restore();
  }

  function drawDoodleWrapped(cx, cy, r, colorId) {
    ctx.save();
    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2.4;
    ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.ellipse(cx - r * 0.55, cy, r * 0.38, r * 0.2, Math.PI / 4, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.55, cy, r * 0.38, r * 0.2, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawSparkle(cx, cy, 5, '#ffd13b');
    ctx.restore();
  }

  function drawDoodleColorBomb(cx, cy, r) {
    ctx.save();
    ctx.fillStyle = '#26211e';
    ctx.strokeStyle = '#141110';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const dots = [
      { a: 0, rad: r * 0.5, col: '#ff5e7e' },
      { a: 1.0, rad: r * 0.55, col: '#ff9838' },
      { a: 2.1, rad: r * 0.45, col: '#ffd13b' },
      { a: 3.2, rad: r * 0.55, col: '#4cd97b' },
      { a: 4.3, rad: r * 0.48, col: '#4ea8de' },
      { a: 5.4, rad: r * 0.52, col: '#b57bed' },
    ];
    dots.forEach(d => {
      ctx.fillStyle = d.col;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(d.a) * d.rad, cy + Math.sin(d.a) * d.rad, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    drawSparkle(cx, cy, 7, '#ffffff');
    ctx.restore();
  }

  function drawDoodleIngredient(cx, cy, r, type) {
    ctx.save();
    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2;

    if (type === INGREDIENT.CHERRY) {
      ctx.fillStyle = '#d49b57';
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.15, r * 0.65, 0, Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#7a4e2d';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.1, r * 0.72, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#3a2e39';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── GRAND DESTRUCTION ANIMATIONS (COMBO BEAMS & EXPLOSIONS) ──────────────────

  /**
   * Spawns a grand laser beam across row or column
   */
  function spawnLaserBeam(type, index, color = '#ff5e7e') {
    comboBeams.push({
      type, // 'row' or 'col'
      index,
      color,
      life: 0,
      maxLife: 18
    });
  }

  /**
   * Spawns a massive 5x5 / Supernova blast aura
   */
  function spawnSupernova(cx, cy, maxR = 140, color = '#ffd13b') {
    comboBeams.push({
      type: 'supernova',
      cx, cy,
      maxR,
      color,
      life: 0,
      maxLife: 26
    });
  }

  function spawnDoodleBurst(r, c, colorId, matchCount = 3) {
    const cx = cellX(c);
    const cy = cellY(r);
    const col = getDoodleColor(colorId);

    doodleBursts.push({
      x: cx,
      y: cy,
      maxRadius: matchCount >= 4 ? tileSize * 1.5 : tileSize * 1.1,
      currentRadius: 4,
      color: col.fill,
      alpha: 1,
      isSuper: matchCount >= 4,
      life: 0,
      maxLife: 22
    });

    const particleCount = matchCount >= 4 ? 20 : 12;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
      const speed = (matchCount >= 4 ? 3.5 : 2.2) + Math.random() * 3.5;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        color: (i % 3 === 0) ? '#2b2623' : ((i % 3 === 1) ? col.fill : col.light),
        size: (matchCount >= 4 ? 4 : 3) + Math.random() * 3,
        isStar: (matchCount >= 4 && i % 2 === 0),
        alpha: 1,
        life: 0,
        maxLife: 24 + Math.random() * 12
      });
    }
  }

  function spawnMatchParticles(r, c, colorId) {
    spawnDoodleBurst(r, c, colorId, 3);
  }

  function spawnFloatText(r, c, text, color = '#2b2623', size = 20) {
    floatTexts.push({
      x: cellX(c),
      y: cellY(r),
      text,
      color,
      size,
      alpha: 1,
      yOffset: 0,
      life: 0,
      maxLife: 35
    });
  }

  function updateAndDrawParticles() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // 1. Render Combo Beams & Supernova Blasts
    for (let i = comboBeams.length - 1; i >= 0; i--) {
      const beam = comboBeams[i];
      beam.life++;
      const p = beam.life / beam.maxLife;
      const alpha = Math.max(0, 1 - p);

      ctx.save();
      ctx.globalAlpha = alpha;

      if (beam.type === 'row') {
        const y = cellY(beam.index);
        const beamH = tileSize * (0.8 + Math.sin(p * Math.PI) * 0.6);
        ctx.fillStyle = beam.color;
        ctx.fillRect(0, y - beamH / 2, w, beamH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y - beamH * 0.25, w, beamH * 0.5);
      } else if (beam.type === 'col') {
        const x = cellX(beam.index);
        const beamW = tileSize * (0.8 + Math.sin(p * Math.PI) * 0.6);
        ctx.fillStyle = beam.color;
        ctx.fillRect(x - beamW / 2, 0, beamW, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - beamW * 0.25, 0, beamW * 0.5, h);
      } else if (beam.type === 'supernova') {
        const r = beam.maxR * Math.sin(p * Math.PI * 0.5);
        ctx.fillStyle = beam.color;
        ctx.beginPath();
        ctx.arc(beam.cx, beam.cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.restore();

      if (beam.life >= beam.maxLife) comboBeams.splice(i, 1);
    }

    // 2. Render Doodle Shockwave Bursts
    for (let i = doodleBursts.length - 1; i >= 0; i--) {
      const b = doodleBursts[i];
      b.life++;
      const p = b.life / b.maxLife;
      b.currentRadius = 4 + (b.maxRadius - 4) * Math.sin(p * Math.PI * 0.5);
      b.alpha = Math.max(0, 1 - p);

      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.isSuper ? 3 : 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.currentRadius, 0, Math.PI * 2);
      ctx.stroke();

      if (b.isSuper) {
        const sDist = b.currentRadius * 0.8;
        drawSparkle(b.x + sDist, b.y, 4, '#ffd13b');
        drawSparkle(b.x - sDist, b.y, 4, '#ffd13b');
        drawSparkle(b.x, b.y + sDist, 4, '#ffd13b');
        drawSparkle(b.x, b.y - sDist, 4, '#ffd13b');
      }
      ctx.restore();

      if (b.life >= b.maxLife) doodleBursts.splice(i, 1);
    }

    // 3. Render Flying Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.isStar) {
        drawSparkle(p.x, p.y, p.size, p.color);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (p.life >= p.maxLife) particles.splice(i, 1);
    }

    // 4. Floating Text
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.life++;
      ft.yOffset -= 1.4;
      ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.font = `800 ${ft.size}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y + ft.yOffset);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y + ft.yOffset);
      ctx.restore();

      if (ft.life >= ft.maxLife) floatTexts.splice(i, 1);
    }
  }

  // ── Selection Highlight ──────────────────────────────────────────────────────

  function drawSelectedHighlight(r, c) {
    const cx = cellX(c);
    const cy = cellY(r);
    const s = tileSize * 0.44;

    ctx.save();
    ctx.strokeStyle = '#2b2623';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
    ctx.restore();
  }

  function drawHintHighlight(r1, c1, r2, c2) {
    hintPhase += 0.08;
    const pulse = 0.5 + Math.sin(hintPhase) * 0.5;

    [ { r: r1, c: c1 }, { r: r2, c: c2 } ].forEach(p => {
      const cx = cellX(p.c);
      const cy = cellY(p.r);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 180, 0, ${0.4 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, tileSize * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function setHint(cells) { hintCells = cells; hintPhase = 0; }
  function clearHint() { hintCells = null; }

  // ── Main Render Frame ────────────────────────────────────────────────────────

  function renderFrame(grid, selected, shakeCell, dt) {
    const now = performance.now();
    updateAnimations(now);

    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    drawBackground();

    const dropMap = {};
    activeDropAnims.forEach(d => { dropMap[`${d.r},${d.c}`] = d.currentY; });

    // Render cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (activeSwapAnim) {
          const isCell1 = (r === activeSwapAnim.r1 && c === activeSwapAnim.c1);
          const isCell2 = (r === activeSwapAnim.r2 && c === activeSwapAnim.c2);
          if (isCell1 || isCell2) continue;
        }

        const cell = grid[r][c];
        const shake = (shakeCell && shakeCell.r === r && shakeCell.c === c)
          ? { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 }
          : { x: 0, y: 0 };

        const customY = dropMap[`${r},${c}`];
        const customPos = customY !== undefined ? { x: cellX(c), y: customY } : null;
        const isSelected = (selected && selected.r === r && selected.c === c);

        drawCell(r, c, cell, shake, customPos, isSelected);
      }
    }

    // Render swapping cells with visual elevation shadow
    if (activeSwapAnim) {
      const p = activeSwapAnim.progress;
      const x1 = cellX(activeSwapAnim.c1), y1 = cellY(activeSwapAnim.r1);
      const x2 = cellX(activeSwapAnim.c2), y2 = cellY(activeSwapAnim.r2);

      const curX1 = x1 + (x2 - x1) * p;
      const curY1 = y1 + (y2 - y1) * p;
      const curX2 = x2 + (x1 - x2) * p;
      const curY2 = y2 + (y1 - y2) * p;

      const cell1 = grid[activeSwapAnim.r1][activeSwapAnim.c1];
      const cell2 = grid[activeSwapAnim.r2][activeSwapAnim.c2];

      ctx.save();

      drawCell(activeSwapAnim.r1, activeSwapAnim.c1, cell1, {x:0,y:0}, { x: curX1, y: curY1 }, true);
      drawCell(activeSwapAnim.r2, activeSwapAnim.c2, cell2, {x:0,y:0}, { x: curX2, y: curY2 }, true);

      ctx.restore();
    }

    if (selected) {
      drawSelectedHighlight(selected.r, selected.c);
    }

    if (hintCells) {
      drawHintHighlight(hintCells.r1, hintCells.c1, hintCells.r2, hintCells.c2);
    }

    updateAndDrawParticles();
  }

  // ── Shape Utilities ──────────────────────────────────────────────────────────

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSparkle(cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.3, cy - size * 0.3);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx + size * 0.3, cy + size * 0.3);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.3, cy + size * 0.3);
    ctx.lineTo(cx - size, cy);
    ctx.lineTo(cx - size * 0.3, cy - size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function spawnConfetti(count = 40) {
    const colors = ['#ff5e7e', '#ff9838', '#ffd13b', '#4cd97b', '#4ea8de', '#b57bed'];
    const boardW = tileSize * COLS;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * boardW,
        y: Math.random() * 50,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 5 + Math.random() * 4,
        isStar: Math.random() > 0.35,
        alpha: 1,
        life: 0,
        maxLife: 55 + Math.random() * 25
      });
    }
  }

  return {
    init,
    resize,
    getTileSize,
    getBoardOffset,
    pixelToGrid,
    clientToPixel,
    clientToGrid,
    cellX,
    cellY,
    renderFrame,
    startSwapAnimation,
    startDropAnimations,
    spawnMatchParticles,
    spawnDoodleBurst,
    spawnLaserBeam,
    spawnSupernova,
    spawnFloatText,
    spawnConfetti,
    setHint,
    clearHint,
    setWorld,
    getWorld,
  };
})();
