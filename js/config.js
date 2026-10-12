/**
 * Doodle Premium — Game Configuration
 * Central source of truth for all game constants, candy definitions, score tables, and rules.
 */

'use strict';

const Config = {

  // ─── Board ─────────────────────────────────────────────────────────────────
  COLS: 8,
  ROWS: 8,
  TILE_SIZE: 46,       // px; scaled by renderer based on viewport
  TILE_PADDING: 4,     // px gap between tiles
  BOARD_ANIM_MS: 180,  // duration of swap/drop animations

  // ─── Candy Types ────────────────────────────────────────────────────────────
  // IDs 1-6 are normal candies; 0 = empty cell during cascade
  CANDY_COLORS: {
    1: { name: 'red',    hue: 0,   sat: '80%', lit: '55%' },
    2: { name: 'orange', hue: 30,  sat: '90%', lit: '55%' },
    3: { name: 'yellow', hue: 50,  sat: '95%', lit: '55%' },
    4: { name: 'green',  hue: 110, sat: '65%', lit: '42%' },
    5: { name: 'blue',   hue: 215, sat: '80%', lit: '55%' },
    6: { name: 'purple', hue: 275, sat: '75%', lit: '55%' },
  },

  // Normal game uses 6 candy colours; early levels can restrict palette
  DEFAULT_CANDY_POOL: [1, 2, 3, 4, 5, 6],

  // ─── Special Candy Types (Tile Power-Ups) ──────────────────────────────────
  SPECIAL: {
    NONE:        0,
    STRIPED_H:   1,  // horizontal line blast (created by 4-in-a-row horizontal)
    STRIPED_V:   2,  // vertical line blast   (created by 4-in-a-row vertical)
    WRAPPED:     3,  // 3x3 blast / wrapped candy (created by L/T/5-cross)
    COLOR_BOMB:  4,  // rainbow color bomb (created by 5-in-a-straight-line)
  },

  // ─── Score Values ───────────────────────────────────────────────────────────
  SCORE: {
    MATCH_BASE:      60,   // per candy in a normal match-3
    MATCH_EXTRA:     120,  // per additional candy beyond 3
    JELLY_CLEAR:     30,   // bonus when a jelly cell is cleared
    JELLY_CLEAR_DBL: 60,   // bonus when double-jelly is fully cleared
    SPECIAL_USE:     200,  // base reward when a special activates
    CASCADE_MULT:    1.5,  // score multiplier applied per cascade chain level
    INGREDIENT_DROP: 500,  // bonus when an ingredient reaches the exit
  },

  // ─── Match Thresholds ───────────────────────────────────────────────────────
  MATCH: {
    MIN:          3,   // minimum candies in a line to count as a match
    MAKE_STRIPED: 4,   // 4-in-a-line produces a striped candy
    MAKE_WRAPPED: 5,   // 5-in-L/T or enclosed shapes produce a wrapped candy
    MAKE_BOMB:    5,   // 5-in-a-straight-line produces a colour bomb
  },

  // ─── Obstacles ──────────────────────────────────────────────────────────────
  OBSTACLE: {
    JELLY_SINGLE: 1,   // cleared by one adjacent/in-place match
    JELLY_DOUBLE: 2,   // requires two clears
    FROSTING_1:   3,   // sketch tape — 1 hit breaks it
    FROSTING_2:   4,   // thick tape — 2 hits
    LICORICE:     5,   // cannot be matched, only destroyed by special candies
  },

  // ─── Ingredients (for collection objective) ─────────────────────────────────
  INGREDIENT: {
    CHERRY: 7,
    HAZELNUT: 8,
  },

  // ─── Boosters / In-Game Powerups ────────────────────────────────────────────
  BOOSTER: {
    HAMMER:      'hammer',      // sketch pencil: destroy any single tile or obstacle
    FREE_SWAP:   'free_swap',   // swap wand: swap any two adjacent tiles (no match required)
    COLOR_BOMB:  'color_bomb',  // paint splash: turns selected tile into a Color Bomb powerup
    ROW_BLAST:   'row_blast',   // brush stroke: clears an entire row immediately
    EXTRA_MOVES: 'extra_moves', // +5 moves immediately
  },

  // ─── Ads ────────────────────────────────────────────────────────────────────
  ADS: {
    REWARD_EXTRA_MOVES: 5,      // moves granted after watching rewarded ad
    MOCK_AD_DURATION_MS: 5000,  // simulated ad video length
  },

  // ─── Stars ──────────────────────────────────────────────────────────────────
  STAR_THRESHOLDS: [1.0, 1.5, 2.0],

  // ─── Particles ──────────────────────────────────────────────────────────────
  PARTICLE: {
    COUNT:       14,
    LIFESPAN_MS: 600,
    SPEED:       5,
  },

  // ─── UI timing ──────────────────────────────────────────────────────────────
  HINT_DELAY_MS:    4000,  // show board hint after this many ms of inactivity
  INVALID_SHAKE_MS: 400,   // duration of the invalid-swap shake animation
};

Object.freeze(Config);
Object.freeze(Config.CANDY_COLORS);
Object.freeze(Config.SPECIAL);
Object.freeze(Config.SCORE);
Object.freeze(Config.MATCH);
Object.freeze(Config.OBSTACLE);
Object.freeze(Config.INGREDIENT);
Object.freeze(Config.BOOSTER);
Object.freeze(Config.ADS);
Object.freeze(Config.STAR_THRESHOLDS);
Object.freeze(Config.PARTICLE);
