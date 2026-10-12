/**
 * Sugar Rush — Special Candy Activations & Cross-Combos
 *
 * Handles the detonation of all special candy types:
 *   • Striped (H/V)  — blasts full row or column
 *   • Wrapped        — 3×3 explosion (fires twice)
 *   • Color Bomb     — clears all candies of target colour
 *
 * Also handles all cross-combo interactions when two specials are swapped:
 *   • Striped + Striped        → cross-blast (full row + full column)
 *   • Striped + Wrapped        → giant 3-row × 3-col laser sweep
 *   • Color Bomb + Striped     → turn all of target colour into Striped & fire
 *   • Color Bomb + Wrapped     → turn all of target colour into Wrapped & fire
 *   • Color Bomb + Color Bomb  → clear entire board (supernova)
 */

'use strict';

const Specials = (() => {

  const { ROWS, COLS, SPECIAL, OBSTACLE } = Config;

  // ── Helper: mark cells for clearing ─────────────────────────────────────────

  /**
   * Mark a set of board positions as cleared and handle jelly damage.
   * Returns { cleared: [{r, c}], jellyCleared: [{r, c, layer}] }
   */
  function markCells(grid, positions) {
    const cleared = [];
    const jellyCleared = [];
    const seen = new Set();

    for (const pos of positions) {
      const key = `${pos.r},${pos.c}`;
      if (seen.has(key)) continue;
      if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
      seen.add(key);

      const cell = grid[pos.r][pos.c];

      // Licorice only destroyed by specials (not normal matches)
      if (cell.obstacle === OBSTACLE.LICORICE) {
        cell.obstacle = 0;
        cleared.push(pos);
        continue;
      }

      // Frosting hit
      if (cell.obstacle === OBSTACLE.FROSTING_2) {
        cell.obstacle = OBSTACLE.FROSTING_1;
        continue; // frosting absorbs the hit, candy underneath stays
      }
      if (cell.obstacle === OBSTACLE.FROSTING_1) {
        cell.obstacle = 0;
        continue;
      }

      // Jelly hit
      if (cell.obstacle === OBSTACLE.JELLY_DOUBLE) {
        cell.obstacle = OBSTACLE.JELLY_SINGLE;
        jellyCleared.push({ r: pos.r, c: pos.c, layer: 2 });
      } else if (cell.obstacle === OBSTACLE.JELLY_SINGLE) {
        cell.obstacle = 0;
        jellyCleared.push({ r: pos.r, c: pos.c, layer: 1 });
      }

      if (cell.color !== 0) {
        cleared.push({ r: pos.r, c: pos.c });
      }
    }

    // Actually clear the cells
    const { emptyCell } = Board;
    for (const pos of cleared) {
      grid[pos.r][pos.c] = emptyCell();
    }

    return { cleared, jellyCleared };
  }

  // ── Individual Special Activations ───────────────────────────────────────────

  /** Striped-H: clear entire row r. */
  function activateStripedH(grid, r, _c) {
    const positions = [];
    for (let c = 0; c < COLS; c++) positions.push({ r, c });
    AudioEngine.playLaser();
    return { type: 'striped_h', row: r, ...markCells(grid, positions) };
  }

  /** Striped-V: clear entire column c. */
  function activateStripedV(grid, _r, c) {
    const positions = [];
    for (let r = 0; r < ROWS; r++) positions.push({ r, c });
    AudioEngine.playLaser();
    return { type: 'striped_v', col: c, ...markCells(grid, positions) };
  }

  /** Wrapped: 3×3 blast centred on (r, c), triggered twice by match logic. */
  function activateWrapped(grid, r, c, pass = 1) {
    const positions = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        positions.push({ r: r + dr, c: c + dc });
    if (pass === 1) AudioEngine.playExplosion();
    return { type: 'wrapped', r, c, pass, ...markCells(grid, positions) };
  }

  /** Color Bomb: clear all candies of colour targetColor (or combo partner's colour). */
  function activateColorBomb(grid, _r, _c, targetColor) {
    const positions = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c].color === targetColor) positions.push({ r, c });
    AudioEngine.playColorBomb();
    return { type: 'color_bomb', targetColor, ...markCells(grid, positions) };
  }

  // ── Cross-Combo Activations ──────────────────────────────────────────────────

  /** Striped × Striped → cross-blast: row r1 + col c2 */
  function comboStripedStriped(grid, r1, c1, r2, c2) {
    const positions = new Map();
    for (let c = 0; c < COLS; c++) positions.set(`${r1},${c}`, { r: r1, c });
    for (let c = 0; c < COLS; c++) positions.set(`${r2},${c}`, { r: r2, c });
    for (let r = 0; r < ROWS; r++) positions.set(`${r},${c1}`, { r, c: c1 });
    for (let r = 0; r < ROWS; r++) positions.set(`${r},${c2}`, { r, c: c2 });
    AudioEngine.playLaser();
    setTimeout(() => AudioEngine.playLaser(), 120);
    return { type: 'combo_striped_striped', ...markCells(grid, [...positions.values()]) };
  }

  /** Striped × Wrapped → 3-row × 3-col cross laser sweep */
  function comboStripedWrapped(grid, r, c) {
    const positions = new Map();
    // Three rows centred on r
    for (let dr = -1; dr <= 1; dr++)
      for (let c2 = 0; c2 < COLS; c2++) {
        const nr = r + dr;
        if (nr >= 0 && nr < ROWS) positions.set(`${nr},${c2}`, { r: nr, c: c2 });
      }
    // Three cols centred on c
    for (let dc = -1; dc <= 1; dc++)
      for (let r2 = 0; r2 < ROWS; r2++) {
        const nc = c + dc;
        if (nc >= 0 && nc < COLS) positions.set(`${r2},${nc}`, { r: r2, c: nc });
      }
    AudioEngine.playExplosion();
    setTimeout(() => AudioEngine.playLaser(), 80);
    return { type: 'combo_striped_wrapped', ...markCells(grid, [...positions.values()]) };
  }

  /** Color Bomb × Striped → all of targetColor become Striped and detonate */
  function comboColorBombStriped(grid, r, c, targetColor, stripeDir) {
    const allCleared = [];
    const allJellyCleared = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (grid[row][col].color === targetColor) {
          // Turn into striped and fire it
          grid[row][col].special = stripeDir;
          let res;
          if (stripeDir === SPECIAL.STRIPED_H) res = activateStripedH(grid, row, col);
          else res = activateStripedV(grid, row, col);
          allCleared.push(...res.cleared);
          allJellyCleared.push(...res.jellyCleared);
        }
      }
    }
    AudioEngine.playColorBomb();
    return { type: 'combo_colorbomb_striped', cleared: allCleared, jellyCleared: allJellyCleared };
  }

  /** Color Bomb × Wrapped → all of targetColor become Wrapped and explode */
  function comboColorBombWrapped(grid, r, c, targetColor) {
    const allCleared = [];
    const allJellyCleared = [];
    const targets = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++)
        if (grid[row][col].color === targetColor) targets.push({ r: row, c: col });

    for (const pos of targets) {
      const res = activateWrapped(grid, pos.r, pos.c, 1);
      allCleared.push(...res.cleared);
      allJellyCleared.push(...res.jellyCleared);
    }
    AudioEngine.playColorBomb();
    return { type: 'combo_colorbomb_wrapped', cleared: allCleared, jellyCleared: allJellyCleared };
  }

  /** Color Bomb × Color Bomb → clear entire board (supernova!) */
  function comboColorBombColorBomb(grid) {
    const positions = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        positions.push({ r, c });
    AudioEngine.playColorBomb();
    setTimeout(() => AudioEngine.playColorBomb(), 300);
    return { type: 'combo_supernova', ...markCells(grid, positions) };
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────────

  /**
   * Activate a single special candy at (r, c).
   * targetColor is the colour of the candy being swapped with a color bomb.
   */
  function activate(grid, r, c, targetColor = null) {
    const cell = grid[r][c];
    const sp = cell.special;
    if (sp === SPECIAL.STRIPED_H) return activateStripedH(grid, r, c);
    if (sp === SPECIAL.STRIPED_V) return activateStripedV(grid, r, c);
    if (sp === SPECIAL.WRAPPED)   return activateWrapped(grid, r, c, 1);
    if (sp === SPECIAL.COLOR_BOMB && targetColor) return activateColorBomb(grid, r, c, targetColor);
    return { cleared: [], jellyCleared: [] };
  }

  /**
   * Handle swapping two special candies together.
   * Both are consumed; the cross-combo fires.
   * Returns a result object with all cleared cells.
   */
  function handleSpecialCombo(grid, r1, c1, r2, c2) {
    const sp1 = grid[r1][c1].special;
    const sp2 = grid[r2][c2].special;
    const color1 = grid[r1][c1].color;
    const color2 = grid[r2][c2].color;

    // Remove both special candies first
    grid[r1][c1] = Board.emptyCell();
    grid[r2][c2] = Board.emptyCell();

    const isStriped = s => s === SPECIAL.STRIPED_H || s === SPECIAL.STRIPED_V;
    const isWrapped = s => s === SPECIAL.WRAPPED;
    const isBomb   = s => s === SPECIAL.COLOR_BOMB;

    if (isBomb(sp1) && isBomb(sp2)) {
      return comboColorBombColorBomb(grid);
    }
    if (isBomb(sp1) && isStriped(sp2)) {
      return comboColorBombStriped(grid, r1, c1, color2, sp2);
    }
    if (isBomb(sp2) && isStriped(sp1)) {
      return comboColorBombStriped(grid, r2, c2, color1, sp1);
    }
    if (isBomb(sp1) && isWrapped(sp2)) {
      return comboColorBombWrapped(grid, r1, c1, color2);
    }
    if (isBomb(sp2) && isWrapped(sp1)) {
      return comboColorBombWrapped(grid, r2, c2, color1);
    }
    if (isStriped(sp1) && isWrapped(sp2)) {
      return comboStripedWrapped(grid, r1, c1);
    }
    if (isStriped(sp2) && isWrapped(sp1)) {
      return comboStripedWrapped(grid, r2, c2);
    }
    if (isStriped(sp1) && isStriped(sp2)) {
      return comboStripedStriped(grid, r1, c1, r2, c2);
    }
    if (isWrapped(sp1) && isWrapped(sp2)) {
      // Double wrapped = massive 5×5 explosion
      const positions = [];
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          positions.push({ r: r1 + dr, c: c1 + dc });
      AudioEngine.playExplosion();
      setTimeout(() => AudioEngine.playExplosion(), 200);
      return { type: 'combo_wrapped_wrapped', ...markCells(grid, positions) };
    }

    // Fallback: just activate both individually
    const res1 = activate(grid, r1, c1, color2);
    const res2 = activate(grid, r2, c2, color1);
    return {
      type: 'combo_fallback',
      cleared: [...res1.cleared, ...res2.cleared],
      jellyCleared: [...res1.jellyCleared, ...res2.jellyCleared],
    };
  }

  return {
    activate,
    handleSpecialCombo,
    activateStripedH,
    activateStripedV,
    activateWrapped,
    activateColorBomb,
  };
})();
