/**
 * Doodle Premium — Boosters / Power-Ups
 * Manages the in-game powerup inventory, activation logic, and distinct effects:
 *   • Pencil (Hammer)     — erase any single tile or obstacle
 *   • Free Swap           — swap any two adjacent tiles without needing a match
 *   • Paint Splat (Bomb)  — spawn an instant Rainbow Ink Color Bomb on chosen tile
 *   • Brush Blast (Row)   — draw a brushstroke sweeping across an entire row
 *   • +5 Extra Moves      — grant 5 moves immediately
 *
 * All powerup tiles feature distinct pulsating glow animations to clearly showcase them.
 */

'use strict';

const Boosters = (() => {

  const { BOOSTER } = Config;
  const STORAGE_KEY = 'doodle_boosters';

  // Default starting inventory (generous starter pack)
  const DEFAULT_INVENTORY = {
    [BOOSTER.HAMMER]:      3,
    [BOOSTER.FREE_SWAP]:   2,
    [BOOSTER.COLOR_BOMB]:  2,
    [BOOSTER.ROW_BLAST]:   2,
    [BOOSTER.EXTRA_MOVES]: 3,
  };

  let inventory = {};
  let activeBooster = null;
  let _onMovesAdded = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      inventory = raw ? JSON.parse(raw) : { ...DEFAULT_INVENTORY };
      // Ensure all keys exist
      Object.keys(DEFAULT_INVENTORY).forEach(k => {
        if (inventory[k] === undefined) inventory[k] = DEFAULT_INVENTORY[k];
      });
    } catch (_) {
      inventory = { ...DEFAULT_INVENTORY };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
    } catch (_) {}
  }

  function getCount(type) {
    return inventory[type] || 0;
  }

  function grant(type, amount = 1) {
    inventory[type] = (inventory[type] || 0) + amount;
    save();
  }

  function consume(type) {
    if (getCount(type) <= 0) return false;
    inventory[type]--;
    save();
    return true;
  }

  function select(type, gameState) {
    if (getCount(type) <= 0) return false;
    if (activeBooster === type) {
      activeBooster = null;
      return false;
    }

    if (type === BOOSTER.EXTRA_MOVES) {
      if (!consume(type)) return false;
      AudioEngine.playBooster();
      if (_onMovesAdded) _onMovesAdded(5);
      return true;
    }

    // Interactive powerups awaiting player tile selection
    activeBooster = type;
    AudioEngine.playBooster();
    return true;
  }

  function cancel() { activeBooster = null; }
  function getActive() { return activeBooster; }

  // ── Booster In-Game Effects ──────────────────────────────────────────────────

  /**
   * Pencil / Hammer: erase cell at (r, c)
   */
  function applyHammer(grid, r, c) {
    if (activeBooster !== BOOSTER.HAMMER) return null;
    if (!consume(BOOSTER.HAMMER)) return null;

    const cell = grid[r][c];
    const cleared = [];
    const jellyCleared = [];

    if (cell.color === 0 && cell.obstacle === 0) {
      activeBooster = null;
      return null;
    }

    if (cell.obstacle === Config.OBSTACLE.FROSTING_2) {
      cell.obstacle = Config.OBSTACLE.FROSTING_1;
    } else if (cell.obstacle === Config.OBSTACLE.FROSTING_1) {
      cell.obstacle = 0;
    } else if (cell.obstacle === Config.OBSTACLE.JELLY_DOUBLE) {
      cell.obstacle = Config.OBSTACLE.JELLY_SINGLE;
      jellyCleared.push({ r, c, layer: 2 });
    } else if (cell.obstacle === Config.OBSTACLE.JELLY_SINGLE) {
      cell.obstacle = 0;
      jellyCleared.push({ r, c, layer: 1 });
    }

    if (cell.color !== 0) {
      cleared.push({ r, c, color: cell.color });
      grid[r][c] = Board.emptyCell();
    }

    AudioEngine.playExplosion();
    activeBooster = null;
    return { cleared, jellyCleared };
  }

  /**
   * Free Swap: check if free swap is active
   */
  function checkFreeSwap(r1, c1, r2, c2) {
    if (activeBooster !== BOOSTER.FREE_SWAP) return false;
    if (!Board.isAdjacent(r1, c1, r2, c2)) return false;
    if (!consume(BOOSTER.FREE_SWAP)) return false;
    activeBooster = null;
    AudioEngine.playBooster();
    return true;
  }

  /**
   * Color Bomb Spawner: turns chosen tile into a Rainbow Color Bomb
   */
  function applyColorBomb(grid, r, c) {
    if (activeBooster !== BOOSTER.COLOR_BOMB) return false;
    if (!consume(BOOSTER.COLOR_BOMB)) return false;

    grid[r][c].special = Config.SPECIAL.COLOR_BOMB;
    AudioEngine.playColorBomb();
    activeBooster = null;
    return true;
  }

  /**
   * Row Brush Blast: sweeps across row r and clears all tiles in that row
   */
  function applyRowBlast(grid, r, c) {
    if (activeBooster !== BOOSTER.ROW_BLAST) return null;
    if (!consume(BOOSTER.ROW_BLAST)) return null;

    const cleared = [];
    const jellyCleared = [];

    for (let col = 0; col < Config.COLS; col++) {
      const cell = grid[r][col];
      if (cell.obstacle === Config.OBSTACLE.JELLY_SINGLE) {
        cell.obstacle = 0;
        jellyCleared.push({ r, c: col, layer: 1 });
      } else if (cell.obstacle === Config.OBSTACLE.JELLY_DOUBLE) {
        cell.obstacle = Config.OBSTACLE.JELLY_SINGLE;
        jellyCleared.push({ r, c: col, layer: 2 });
      }
      if (cell.obstacle === Config.OBSTACLE.FROSTING_1 || cell.obstacle === Config.OBSTACLE.FROSTING_2) {
        cell.obstacle = 0;
      }
      if (cell.color !== 0) {
        cleared.push({ r, c: col, color: cell.color });
        grid[r][col] = Board.emptyCell();
      }
    }

    AudioEngine.playLaser();
    activeBooster = null;
    return { cleared, jellyCleared };
  }

  function init(callbacks = {}) {
    load();
    _onMovesAdded = callbacks.onMovesAdded || null;
  }

  return {
    init, load, save,
    getCount, grant, consume,
    select, cancel, getActive,
    applyHammer, checkFreeSwap,
    applyColorBomb, applyRowBlast,
  };
})();
