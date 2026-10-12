/**
 * Sugar Rush — Board Logic
 * Manages the 8×8 grid, match detection, gravity (falling candies),
 * and cascade chains. Stateless utility functions operate on board state objects.
 *
 * Board state cell schema:
 * {
 *   color:    number,  // 0 = empty, 1-6 normal candy, 7-8 ingredient
 *   special:  number,  // Config.SPECIAL.*
 *   obstacle: number,  // Config.OBSTACLE.* (jelly / frosting / licorice)
 *   matched:  boolean, // flagged for removal this pass
 *   falling:  boolean, // currently animating downward
 * }
 */

'use strict';

const Board = (() => {

  const { COLS, ROWS, MATCH, SPECIAL, OBSTACLE, INGREDIENT, DEFAULT_CANDY_POOL } = Config;

  // ── Cell Factory ─────────────────────────────────────────────────────────────

  function makeCell(color = 0, special = SPECIAL.NONE, obstacle = 0) {
    return { color, special, obstacle, matched: false, falling: false };
  }

  function emptyCell() { return makeCell(0); }

  function cloneCell(c) {
    return { color: c.color, special: c.special, obstacle: c.obstacle,
             matched: c.matched, falling: c.falling };
  }

  // ── Board Factory ─────────────────────────────────────────────────────────────

  /**
   * Create a fresh board for a given level definition.
   * Ensures no pre-existing matches on initialisation.
   */
  function createBoard(levelDef, pool = DEFAULT_CANDY_POOL) {
    const grid = [];
    const candyPool = levelDef.candyPool || pool;

    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        let color;
        let tries = 0;
        do {
          color = candyPool[Math.floor(Math.random() * candyPool.length)];
          tries++;
          // Safety valve — if we can't find a non-matching color after many tries, just use it
          if (tries > 20) break;
        } while (
          (c >= 2 && grid[r][c-1].color === color && grid[r][c-2].color === color) ||
          (r >= 2 && grid[r-1][c].color === color && grid[r-2][c].color === color)
        );
        const obstacle = levelDef.jellyMap ? levelDef.jellyMap[r][c] : 0;
        grid[r][c] = makeCell(color, SPECIAL.NONE, obstacle);
      }
    }

    // Place ingredients for ingredient levels
    if (levelDef.ingredientCount && levelDef.ingredientTypes) {
      placeIngredients(grid, levelDef.ingredientCount, levelDef.ingredientTypes);
    }

    return grid;
  }

  /**
   * Place ingredients at random positions in the top 2 rows.
   */
  function placeIngredients(grid, count, types) {
    const positions = [];
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < COLS; c++)
        positions.push({ r, c });

    // Shuffle
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < count; i++) {
      const pos = positions[i % positions.length];
      const type = types[i % types.length];
      grid[pos.r][pos.c].color = type;
    }
  }

  // ── Match Detection ───────────────────────────────────────────────────────────

  /**
   * Scan the entire board and return an array of match-group objects.
   * A match-group: { cells: [{r, c}], special: SPECIAL.*, color: number }
   *
   * Supports: 3-in-a-row, 4-in-a-row, 5-in-a-row, L/T shapes.
   */
  function findAllMatches(grid) {
    const hMatches = findLinearMatches(grid, true);
    const vMatches = findLinearMatches(grid, false);
    return mergeOverlappingGroups([...hMatches, ...vMatches]);
  }

  function findLinearMatches(grid, horizontal) {
    const groups = [];
    for (let a = 0; a < (horizontal ? ROWS : COLS); a++) {
      let run = [];
      let runColor = -1;
      for (let b = 0; b < (horizontal ? COLS : ROWS); b++) {
        const cell = horizontal ? grid[a][b] : grid[b][a];
        const pos  = horizontal ? { r: a, c: b } : { r: b, c: a };

        if (cell.color > 0 && cell.color < 7 && !isIngredient(cell)) {
          if (cell.color === runColor) {
            run.push(pos);
          } else {
            if (run.length >= MATCH.MIN) groups.push({ cells: run, color: runColor });
            run = [pos];
            runColor = cell.color;
          }
        } else {
          if (run.length >= MATCH.MIN) groups.push({ cells: run, color: runColor });
          run = [];
          runColor = -1;
        }
      }
      if (run.length >= MATCH.MIN) {
        groups.push({ cells: run, color: runColor });
      }
    }
    return groups;
  }

  /**
   * Merge groups that share cells (for L/T shape detection).
   */
  function mergeOverlappingGroups(groups) {
    const merged = [];
    const used = new Array(groups.length).fill(false);

    for (let i = 0; i < groups.length; i++) {
      if (used[i]) continue;
      let combined = { cells: [...groups[i].cells], color: groups[i].color };
      for (let j = i + 1; j < groups.length; j++) {
        if (used[j]) continue;
        if (combined.color !== groups[j].color) continue;
        const overlap = groups[j].cells.some(cj =>
          combined.cells.some(ci => ci.r === cj.r && ci.c === cj.c)
        );
        if (overlap) {
          used[j] = true;
          const newCells = [...combined.cells];
          for (const cj of groups[j].cells) {
            if (!newCells.some(ci => ci.r === cj.r && ci.c === cj.c))
              newCells.push(cj);
          }
          combined.cells = newCells;
        }
      }
      used[i] = true;
      // Determine what special candy this match should produce
      combined.special = classifyMatchSpecial(combined);
      merged.push(combined);
    }
    return merged;
  }

  /**
   * Determine whether a match group produces a special candy, and what kind.
   * Returns SPECIAL.NONE if it's a plain 3-match.
   */
  function classifyMatchSpecial(group, swapDir = null) {
    const n = group.cells.length;
    if (n === 5) {
      // Check if it's a straight line → COLOR_BOMB
      const allSameRow = group.cells.every(c => c.r === group.cells[0].r);
      const allSameCol = group.cells.every(c => c.c === group.cells[0].c);
      if (allSameRow || allSameCol) return SPECIAL.COLOR_BOMB;
      return SPECIAL.WRAPPED;  // 5-cell L/T
    }
    if (n >= 6) return SPECIAL.COLOR_BOMB;  // Extended L/T
    if (n === 4) {
      // Determine striped direction from swap direction or group orientation
      const allSameRow = group.cells.every(c => c.r === group.cells[0].r);
      if (allSameRow) return SPECIAL.STRIPED_H;
      return SPECIAL.STRIPED_V;
    }
    return SPECIAL.NONE;
  }

  // ── Applying Matches ──────────────────────────────────────────────────────────

  /**
   * Apply matched groups to the grid. Returns:
   * {
   *   cleared: [{r, c}],    // cells that were cleared
   *   specials: [{r, c, special, color}],  // new special candies to place
   *   jellyCleared: [{r, c, layer}],       // jelly cells whose layer was reduced
   * }
   *
   * swapPos: optional {r, c} — position where new special candy should be placed
   */
  function applyMatches(grid, groups, swapPos = null) {
    const cleared = [];
    const newSpecials = [];
    const jellyCleared = [];
    const matched = new Set();

    for (const group of groups) {
      if (group.cells.length === 0) continue;
      const produceSpecial = group.special !== SPECIAL.NONE;
      const placeAt = swapPos && group.cells.some(c => c.r === swapPos.r && c.c === swapPos.c)
        ? swapPos
        : group.cells[Math.floor(group.cells.length / 2)];

      for (const pos of group.cells) {
        const key = `${pos.r},${pos.c}`;
        if (matched.has(key)) continue;
        matched.add(key);

        const cell = grid[pos.r][pos.c];

        // Handle jelly underneath
        if (cell.obstacle === OBSTACLE.JELLY_SINGLE) {
          cell.obstacle = 0;
          jellyCleared.push({ r: pos.r, c: pos.c, layer: 1 });
        } else if (cell.obstacle === OBSTACLE.JELLY_DOUBLE) {
          cell.obstacle = OBSTACLE.JELLY_SINGLE;
          jellyCleared.push({ r: pos.r, c: pos.c, layer: 2 });
        }

        cleared.push({ r: pos.r, c: pos.c, color: cell.color });
      }

      if (produceSpecial) {
        newSpecials.push({ r: placeAt.r, c: placeAt.c, special: group.special, color: group.color });
      }
    }

    // Remove matched candies (unless their position will hold a new special)
    const specialPositions = new Set(newSpecials.map(s => `${s.r},${s.c}`));
    for (const pos of cleared) {
      const key = `${pos.r},${pos.c}`;
      if (specialPositions.has(key)) {
        // Place the special candy here instead of clearing
        const s = newSpecials.find(sp => sp.r === pos.r && sp.c === pos.c);
        grid[pos.r][pos.c] = makeCell(s.color, s.special, grid[pos.r][pos.c].obstacle);
      } else {
        grid[pos.r][pos.c] = emptyCell();
      }
    }

    return { cleared, newSpecials, jellyCleared };
  }

  // ── Gravity & Refill ──────────────────────────────────────────────────────────

  /**
   * Apply gravity: drop cells downward to fill empty spaces.
   * Returns an array of { r, c, fromR } describing each dropped cell.
   */
  function applyGravity(grid, candyPool = DEFAULT_CANDY_POOL) {
    const drops = [];

    for (let c = 0; c < COLS; c++) {
      // Collect non-empty cells from bottom up
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const cell = grid[r][c];
        // Frosting and licorice stay in place
        if (cell.obstacle === OBSTACLE.FROSTING_1 || cell.obstacle === OBSTACLE.FROSTING_2 ||
            cell.obstacle === OBSTACLE.LICORICE) {
          if (write !== r) {
            drops.push({ r: write, c, fromR: r });
            grid[write][c] = cloneCell(cell);
            grid[r][c] = emptyCell();
          }
          write--;
        } else if (cell.color !== 0) {
          if (write !== r) {
            drops.push({ r: write, c, fromR: r });
            grid[write][c] = cloneCell(cell);
            grid[r][c] = emptyCell();
          }
          write--;
        }
      }
      // Refill from top with new candies
      while (write >= 0) {
        const color = candyPool[Math.floor(Math.random() * candyPool.length)];
        grid[write][c] = makeCell(color);
        drops.push({ r: write, c, fromR: write - ROWS - 1 });  // negative fromR = spawned from above board
        write--;
      }
    }

    return drops;
  }

  // ── Ingredient Physics ────────────────────────────────────────────────────────

  /**
   * Move ingredients one row down if the cell below is empty.
   * Returns positions that reached the bottom (exit row = ROWS-1).
   */
  function stepIngredients(grid) {
    const exited = [];
    // Process from bottom to top to avoid double-moving
    for (let r = ROWS - 2; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        if (isIngredient(grid[r][c]) && grid[r+1][c].color === 0 && grid[r+1][c].obstacle === 0) {
          grid[r+1][c] = cloneCell(grid[r][c]);
          grid[r][c] = emptyCell();
          if (r + 1 === ROWS - 1) exited.push({ r: r + 1, c });
        }
      }
    }
    // Check if ingredient is already on last row
    for (let c = 0; c < COLS; c++) {
      if (isIngredient(grid[ROWS-1][c])) exited.push({ r: ROWS - 1, c });
    }
    return exited;
  }

  // ── Swap Validation ───────────────────────────────────────────────────────────

  /**
   * Check whether swapping (r1,c1) and (r2,c2) produces at least one match.
   * Returns an array of match groups (empty if invalid swap).
   */
  function checkSwapValid(grid, r1, c1, r2, c2) {
    if (!isAdjacent(r1, c1, r2, c2)) return [];

    // Temporarily swap
    const tmp = cloneCell(grid[r1][c1]);
    grid[r1][c1] = cloneCell(grid[r2][c2]);
    grid[r2][c2] = tmp;

    const matches = findAllMatches(grid);

    // Undo swap
    const tmp2 = cloneCell(grid[r1][c1]);
    grid[r1][c1] = cloneCell(grid[r2][c2]);
    grid[r2][c2] = tmp2;

    return matches;
  }

  /**
   * Find a valid swap hint anywhere on the board.
   * Returns { r1, c1, r2, c2 } or null.
   */
  function findHint(grid) {
    const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const matches = checkSwapValid(grid, r, c, nr, nc);
          if (matches.length > 0) return { r1: r, c1: c, r2: nr, c2: nc };
        }
      }
    }
    return null;  // no valid moves → board should be reshuffled
  }

  /**
   * Reshuffle the board by randomly redistributing all non-obstacle cells.
   * Ensures no pre-existing matches and at least one valid move.
   */
  function reshuffle(grid, candyPool) {
    const colors = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c].color > 0 && grid[r][c].color < 7) colors.push(grid[r][c].color);

    let tries = 0;
    do {
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
      }
      let idx = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (grid[r][c].color > 0 && grid[r][c].color < 7) {
            grid[r][c].color = colors[idx++];
            grid[r][c].special = SPECIAL.NONE;
          }
      tries++;
    } while ((findAllMatches(grid).length > 0 || !findHint(grid)) && tries < 50);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function isAdjacent(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
  }

  function isIngredient(cell) {
    return cell.color === INGREDIENT.CHERRY || cell.color === INGREDIENT.HAZELNUT;
  }

  function isCellEmpty(cell) {
    return cell.color === 0 && cell.special === SPECIAL.NONE && cell.obstacle === 0;
  }

  function countJellies(grid) {
    let count = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c].obstacle === OBSTACLE.JELLY_SINGLE || grid[r][c].obstacle === OBSTACLE.JELLY_DOUBLE)
          count++;
    return count;
  }

  return {
    makeCell, emptyCell, cloneCell,
    createBoard,
    findAllMatches, applyMatches,
    applyGravity, stepIngredients,
    checkSwapValid, findHint, reshuffle,
    isAdjacent, isIngredient, isCellEmpty, countJellies,
    classifyMatchSpecial,
  };
})();
