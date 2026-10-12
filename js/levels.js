/**
 * Doodle Premium — Level Definitions & Procedural Generator
 * Produces 500 beautifully paced, mathematically balanced levels
 * structured into Episodes / Worlds of 20 levels each.
 *
 * Scoring & Star Formula:
 *  - 1 Star (Easy pass): reached target score / base objectives
 *  - 2 Stars (Dopamine target): achievable with a few good combos (1.4x base)
 *  - 3 Stars (Challenge goal): requires special powerup combos & cascades (2.0x base)
 *  - Early levels (1-10) use 4-5 tile types and attainable thresholds so 3 stars can be earned with combos.
 */

'use strict';

const J1 = 1;  // single jelly / ink patch
const J2 = 2;  // double jelly / dense ink
const F1 = 3;  // sketch tape / frosting 1
const F2 = 4;  // double tape / frosting 2
const _  = 0;  // clean cell

const CH = 7;  // cherry / doodle acorn
const HZ = 8;  // hazelnut / ink drop

const WORLD_NAMES = [
  'Sketchy Hills',
  'Graph Paper Grove',
  'Crayon Canyon',
  'Chalkboard Caverns',
  'Origami Oasis',
  'Watercolor Waves',
  'Inkwell Valley',
  'Pastel Peaks',
  'Blueprint Basin',
  'Doodle Dunes',
  'Sticker Shore',
  'Charcoal Cliffs',
  'Highlighter Heights',
  'Mosaic Meadow',
  'Pencil Point Plateau',
  'Fountain Pen Falls',
  'Acrylic Archway',
  'Calligraphy Cove',
  'Canvas Crest',
  'Stencil Savannah',
  'Prism Pass',
  'Palette Plains',
  'Etching Enclave',
  'Gouache Gorge',
  'Masterpiece Mountain'
];

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2D679F;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateJellyMap(rng, density, doubleRate) {
  const map = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
      if (isCorner && rng() > 0.3) {
        row.push(_);
        continue;
      }
      if (rng() < density) {
        row.push(rng() < doubleRate ? J2 : J1);
      } else {
        row.push(_);
      }
    }
    map.push(row);
  }
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (map[r][c] > 0) count++;
    }
  }
  if (count < 6) {
    for (let r = 2; r <= 5; r++) {
      for (let c = 2; c <= 5; c++) {
        map[r][c] = J1;
      }
    }
  }
  return map;
}

function generateLevels(total = 500) {
  const list = [];

  // Seeded curated foundational levels 1 to 10
  // Reduced candy pool (4-5 colors) makes apparent combos and 3 stars easily reachable!
  const curated = [
    {
      id: 1,
      title: 'First Sketch',
      subtitle: 'Score 2,400 points to pass! Reach 5,200 for 3 Stars! ⭐⭐⭐',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'score',
      moves: 20,
      candyPool: [1, 2, 3, 4], // 4 colors: lots of natural 4-in-a-row & T/L combos!
      targetScore: 2400,
      stars: [2400, 3600, 5200], // mathematically requires >= 3 moves even with combos
      jellyMap: null,
      orders: null,
      ingredientCount: 0,
    },
    {
      id: 2,
      title: 'Ink Splat',
      subtitle: 'Clear all sketch ink patches with combos!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'jelly',
      moves: 26,
      candyPool: [1, 2, 3, 4],
      targetScore: 0,
      stars: [1400, 2100, 3000],
      jellyMap: [
        [J1,J1, _,J1,J1, _,J1,J1],
        [J1, _,J1, _,J1,J1, _,J1],
        [ _,J1,J1,J1, _,J1,J1, _],
        [J1,J1, _,J1,J1, _,J1,J1],
        [J1, _,J1,J1, _,J1, _,J1],
        [ _,J1,J1, _,J1,J1,J1, _],
        [J1, _,J1,J1,J1, _,J1,J1],
        [J1,J1, _,J1, _,J1, _,J1],
      ],
      orders: null,
      ingredientCount: 0,
    },
    {
      id: 3,
      title: 'Color Palette',
      subtitle: 'Collect 15 Red Hearts and 15 Yellow Stars!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'order',
      moves: 28,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 0,
      stars: [1600, 2400, 3500],
      jellyMap: null,
      orders: { 1: 15, 3: 15 },
      ingredientCount: 0,
    },
    {
      id: 4,
      title: 'Frosting Tape',
      subtitle: 'Break through the sketch tape with line blasts!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'jelly',
      moves: 30,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 0,
      stars: [1800, 2700, 3900],
      jellyMap: [
        [F2,F2,F2,F2,F2,F2,F2,F2],
        [F2,F1,F1,F1,F1,F1,F1,F2],
        [F2,F1, _,J1,J1, _,F1,F2],
        [F2,F1,J1,J2,J2,J1,F1,F2],
        [F2,F1,J1,J2,J2,J1,F1,F2],
        [F2,F1, _,J1,J1, _,F1,F2],
        [F2,F1,F1,F1,F1,F1,F1,F2],
        [F2,F2,F2,F2,F2,F2,F2,F2],
      ],
      orders: null,
      ingredientCount: 0,
    },
    {
      id: 5,
      title: 'Golden Acorns',
      subtitle: 'Bring down 3 acorns to the bottom row!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'ingredient',
      moves: 30,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 1800,
      stars: [1800, 2700, 4000],
      jellyMap: null,
      orders: null,
      ingredientCount: 3,
      ingredientTypes: [CH],
    },
    {
      id: 6,
      title: 'Doodle Medley',
      subtitle: 'Reach 2,500 points AND clear all sketch patches!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'mixed',
      moves: 32,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 2500,
      stars: [2500, 3800, 5500],
      jellyMap: [
        [ _,J1,J1, _,J1,J1, _,J1],
        [J1,J2, _,J1,J1, _,J2,J1],
        [J1, _,J2,J1,J1,J2, _,J1],
        [ _,J1,J1,J2,J2,J1,J1, _],
        [ _,J1,J1,J2,J2,J1,J1, _],
        [J1, _,J2,J1,J1,J2, _,J1],
        [J1,J2, _,J1,J1, _,J2,J1],
        [ _,J1,J1, _,J1,J1, _,J1],
      ],
      orders: null,
      ingredientCount: 0,
    },
    {
      id: 7,
      title: 'Ink Drops',
      subtitle: 'Guide 4 ink drops down and collect 12 Orange doodles!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'ingredient',
      moves: 32,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 2400,
      stars: [2400, 3600, 5200],
      jellyMap: null,
      orders: { 2: 12 },
      ingredientCount: 4,
      ingredientTypes: [CH, HZ],
    },
    {
      id: 8,
      title: 'Pencil Maze',
      subtitle: 'Clear all tape and ink across the drawing pad!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'jelly',
      moves: 30,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 0,
      stars: [2500, 3800, 5400],
      jellyMap: [
        [F2,F2, _,F2,F2, _,F2,F2],
        [F2,J2,J1,J2,J2,J1,J2,F2],
        [ _,J1,J2,J1,J1,J2,J1, _],
        [F2,J2,J1,J2,J2,J1,J2,F2],
        [F2,J2,J1,J2,J2,J1,J2,F2],
        [ _,J1,J2,J1,J1,J2,J1, _],
        [F2,J2,J1,J2,J2,J1,J2,F2],
        [F2,F2, _,F2,F2, _,F2,F2],
      ],
      orders: null,
      ingredientCount: 0,
    },
    {
      id: 9,
      title: 'Rainbow Swirl',
      subtitle: 'Collect 10 each of Red, Orange, Yellow & Green doodles!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'order',
      moves: 35,
      candyPool: [1, 2, 3, 4, 5],
      targetScore: 0,
      stars: [2600, 4000, 5800],
      jellyMap: null,
      orders: { 1: 10, 2: 10, 3: 10, 4: 10 },
      ingredientCount: 0,
    },
    {
      id: 10,
      title: 'Grand Sketchbook',
      subtitle: 'Reach 4,000 points, clear the ink, and guide 3 drops!',
      worldName: WORLD_NAMES[0],
      worldIndex: 1,
      objective: 'mixed',
      moves: 40,
      candyPool: [1, 2, 3, 4, 5, 6],
      targetScore: 4000,
      stars: [4000, 6000, 8800],
      jellyMap: [
        [J2,J2,J1,J2,J2,J1,J2,J2],
        [J2,F2,F1,F2,F2,F1,F2,J2],
        [J1,F1,J2,J2,J2,J2,F1,J1],
        [J2,F2,J2,F2,F2,J2,F2,J2],
        [J2,F2,J2,F2,F2,J2,F2,J2],
        [J1,F1,J2,J2,J2,J2,F1,J1],
        [J2,F2,F1,F2,F2,F1,F2,J2],
        [J2,J2,J1,J2,J2,J1,J2,J2],
      ],
      orders: { 5: 8 },
      ingredientCount: 3,
      ingredientTypes: [CH, HZ],
    }
  ];

  curated.forEach(lvl => list.push(lvl));

  // Procedurally generate levels 11 to 500
  // Difficulty ramps from level 3 onward, every 3 stages harder
  for (let id = 11; id <= total; id++) {
    const rng = mulberry32(id * 997 + 1013);
    const worldIndex = Math.floor((id - 1) / 20);
    const worldName = WORLD_NAMES[Math.min(worldIndex, WORLD_NAMES.length - 1)];
    const posInEpisode = (id - 1) % 20;

    // Global progression across 500 levels (0 = start, 1 = max)
    const epProgression = Math.min(1, worldIndex / 24);

    // Within-episode difficulty profile: gentle start, hard finish
    // Each 3-level block is one notch harder than the previous
    let posFactor = 0.5;
    const block = Math.floor(posInEpisode / 3); // 0..6
    // Warmup block (positions 0-2): easy entry to the world
    if (block === 0) posFactor = 0.15;
    // Blocks 1-5: incrementally harder every 3 stages
    else if (block === 1) posFactor = 0.30;
    else if (block === 2) posFactor = 0.50;
    else if (block === 3) posFactor = 0.65;
    else if (block === 4) posFactor = 0.80;
    else if (block === 5) posFactor = 0.92;
    // Boss finale (positions 18-19): hardest in the world
    else posFactor = 1.00;

    const overallDifficulty = Math.min(1, epProgression * 0.55 + posFactor * 0.45);

    // Frosting/licorice appearance: starts from block 2 onward (level 7+ in each world)
    const hasObstacles = block >= 2 && overallDifficulty > 0.25;
    // Obstacle density scales with difficulty
    const obstacleDensity = hasObstacles ? Math.min(0.30, (overallDifficulty - 0.25) * 0.45) : 0;

    // Dynamic candy pool: 5 colors warmup, 6 colors on harder blocks
    const candyPool = (block < 2 || (id < 50 && rng() < 0.5)) ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];

    const objTypes = ['score', 'jelly', 'order', 'ingredient', 'mixed'];
    let objective;
    if (posInEpisode === 19) {
      objective = 'mixed';
    } else if (posInEpisode === 0) {
      objective = 'score';
    } else {
      const typeIdx = (posInEpisode + id) % objTypes.length;
      objective = objTypes[typeIdx];
    }

    // Moves: reduce as difficulty increases (harder levels = fewer moves to complete goals)
    let baseMoves = Math.round(36 - overallDifficulty * 14 + (rng() * 4 - 2));
    if (objective === 'ingredient') baseMoves += 4;
    if (objective === 'mixed') baseMoves += 6;
    const moves = Math.max(20, Math.min(45, baseMoves));

    let targetScore = 0;
    let jellyMap = null;
    let orders = null;
    let ingredientCount = 0;
    let ingredientTypes = [CH];

    const adjectives = ['Sparkling', 'Charming', 'Twirling', 'Golden', 'Whimsical', 'Vibrant', 'Cosmic', 'Pastel', 'Inky', 'Velvet'];
    const nouns = ['Cascade', 'Doodle', 'Scribble', 'Symphony', 'Sketch', 'Palette', 'Glow', 'Adventure', 'Canvas', 'Harmony'];
    const title = `${adjectives[Math.floor(rng() * adjectives.length)]} ${nouns[Math.floor(rng() * nouns.length)]}`;
    let subtitle = '';

    if (objective === 'score') {
      const basePts = 2000 + Math.floor(overallDifficulty * 4200) + Math.floor(rng() * 600);
      targetScore = Math.round(basePts / 100) * 100;
      subtitle = `Reach ${targetScore.toLocaleString()} points in ${moves} moves!`;
    } else if (objective === 'jelly') {
      // Harder levels: higher jelly density + more double jellies + frosting obstacles
      const density = 0.28 + overallDifficulty * 0.48;
      const doubleRate = 0.10 + overallDifficulty * 0.60;
      jellyMap = generateJellyMap(rng, density, doubleRate);
      // Overlay frosting on some jelly cells in harder levels
      if (hasObstacles && obstacleDensity > 0) {
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (jellyMap[r][c] > 0 && rng() < obstacleDensity) {
              jellyMap[r][c] = rng() < 0.5 ? F1 : F2;
            }
          }
        }
      }
      subtitle = `Clear all sketch ink patches across the board!`;
    } else if (objective === 'order') {
      const numColors = overallDifficulty > 0.5 ? 3 : (rng() < 0.5 ? 2 : 3);
      orders = {};
      const colors = [1, 2, 3, 4, 5, 6].sort(() => rng() - 0.5).slice(0, numColors);
      const perColor = Math.round(10 + overallDifficulty * 16 + rng() * 4);
      colors.forEach(c => { orders[c] = perColor; });
      subtitle = `Collect your target order before running out of moves!`;
    } else if (objective === 'ingredient') {
      ingredientCount = 2 + Math.floor(overallDifficulty * 4);
      if (overallDifficulty > 0.3) ingredientTypes = [CH, HZ];
      subtitle = `Guide ${ingredientCount} acorns and ink drops to the bottom!`;
      targetScore = 1800 + Math.floor(overallDifficulty * 2200);
    } else if (objective === 'mixed') {
      const basePts = 2600 + Math.floor(overallDifficulty * 4000);
      targetScore = Math.round(basePts / 100) * 100;
      const density = 0.22 + overallDifficulty * 0.40;
      jellyMap = generateJellyMap(rng, density, 0.25 + overallDifficulty * 0.30);
      if (rng() < 0.6) {
        orders = {};
        orders[Math.floor(rng() * 5) + 1] = Math.round(8 + overallDifficulty * 12);
      }
      subtitle = `Score ${targetScore.toLocaleString()} points and clear the ink!`;
    }

    const baseStarScore = targetScore > 0 ? targetScore : Math.round((1800 + overallDifficulty * 2600) / 100) * 100;
    const star1 = baseStarScore;
    const star2 = Math.round((baseStarScore * 1.45) / 50) * 50;
    const star3 = Math.round((baseStarScore * 2.10) / 50) * 50;

    list.push({
      id,
      title,
      subtitle,
      worldName,
      worldIndex: worldIndex + 1,
      objective,
      moves,
      candyPool,
      targetScore,
      stars: [star1, star2, star3],
      jellyMap,
      orders,
      ingredientCount,
      ingredientTypes
    });
  }

  return list;
}


const Levels = generateLevels(500);

Object.freeze(Levels);
