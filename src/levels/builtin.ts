import type { CellKind, ColorKey, LevelData } from '../shared/types';

function rect(cols: number, rows: number, fill: CellKind = 'arena'): CellKind[][] {
  const out: CellKind[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellKind[] = [];
    for (let c = 0; c < cols; c++) row.push(fill);
    out.push(row);
  }
  return out;
}

function blankPixels(cols: number, rows: number): (ColorKey | null)[][] {
  const out: (ColorKey | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (ColorKey | null)[] = [];
    for (let c = 0; c < cols; c++) row.push(null);
    out.push(row);
  }
  return out;
}

function paintPixel(
  cells: CellKind[][],
  pixels: (ColorKey | null)[][],
  c: number,
  r: number,
  color: ColorKey,
) {
  cells[r][c] = 'pixel';
  pixels[r][c] = color;
}

// ============================================================
// Level 1 — Tutorial. One shooter, single color, move-to-clear.
// 5x5 grid. Pink shooter sits below 5 pink pixels in row 0.
// Each column has exactly one pink pixel, so the player must
// drag the shooter across the columns to clear them all.
// ============================================================
function makeLevel1(): LevelData {
  const cols = 5;
  const rows = 5;
  const cells = rect(cols, rows);
  const pixels = blankPixels(cols, rows);
  for (let c = 0; c < cols; c++) paintPixel(cells, pixels, c, 0, 'pink');
  return {
    id: 'l1-tutorial',
    name: 'Tutorial',
    cols,
    rows,
    cells,
    pixels,
    shooters: [
      {
        id: 's1',
        col: 2,
        row: 3,
        color: 'pink',
        ammo: 45,
        shootsPerSecond: 6,
      },
    ],
    welds: [],
    timeLimit: 60,
  };
}

// ============================================================
// Level 2 — Crossfire. Two shooters block each other.
// 5x5 grid. Pink shooter at (2,2) sits between blue pixel above
// and blue shooter below. Blue shooter at (2,3) is between pink
// shooter above and pink pixel below. Neither can fire from start;
// player must shuffle them out of column 2.
// ============================================================
function makeLevel2(): LevelData {
  const cols = 5;
  const rows = 5;
  const cells = rect(cols, rows);
  const pixels = blankPixels(cols, rows);
  paintPixel(cells, pixels, 2, 0, 'blue');
  paintPixel(cells, pixels, 2, 4, 'pink');
  return {
    id: 'l2-crossfire',
    name: 'Crossfire',
    cols,
    rows,
    cells,
    pixels,
    shooters: [
      { id: 's-pink', col: 2, row: 2, color: 'pink', ammo: 9, shootsPerSecond: 6 },
      { id: 's-blue', col: 2, row: 3, color: 'blue', ammo: 9, shootsPerSecond: 6 },
    ],
    welds: [],
    timeLimit: 45,
  };
}

// ============================================================
// Level 3 — Welded. A pink-blue pair drags as one until blue
// depletes (1 ammo), then the weld breaks and pink (with 3 ammo
// remaining) is free to wander the board.
// 5x6 grid.
// ============================================================
function makeLevel3(): LevelData {
  const cols = 5;
  const rows = 6;
  const cells = rect(cols, rows);
  const pixels = blankPixels(cols, rows);
  paintPixel(cells, pixels, 0, 0, 'pink');
  paintPixel(cells, pixels, 1, 0, 'pink');
  paintPixel(cells, pixels, 2, 0, 'pink');
  paintPixel(cells, pixels, 4, 5, 'blue');
  return {
    id: 'l3-welded',
    name: 'Welded',
    cols,
    rows,
    cells,
    pixels,
    shooters: [
      { id: 's-pink', col: 0, row: 2, color: 'pink', ammo: 27, shootsPerSecond: 6 },
      { id: 's-blue', col: 1, row: 2, color: 'blue', ammo: 9, shootsPerSecond: 6 },
    ],
    welds: [{ a: 's-pink', b: 's-blue' }],
    timeLimit: 90,
  };
}

export const BUILTIN_LEVELS: LevelData[] = [makeLevel1(), makeLevel2(), makeLevel3()];
