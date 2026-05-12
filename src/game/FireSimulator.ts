import { ALL_DIRECTIONS, DIR_VECTORS } from '../shared/types';
import type { Direction } from '../shared/types';
import type { Grid } from './Grid';
import type { Shooter } from './Shooter';

const SUB = 3;

export interface FireEvent {
  shooter: Shooter;
  direction: Direction;
  target: { col: number; row: number; subC: number; subR: number };
}

/**
 * Advance firing by `dt` seconds. For each idle shooter ready to fire:
 *   - pick a target sub-pixel (sticky direction + smallest-run heuristic),
 *   - RESERVE it on the grid (so subsequent ticks won't target it again),
 *   - decrement ammo,
 *   - emit a fire event so the caller can spawn a bullet.
 * The actual sub-pixel clear happens when the bullet arrives (caller's
 * responsibility, via grid.clearSubPixel).
 */
export function fireTick(
  dt: number,
  grid: Grid,
  shooters: Shooter[],
): FireEvent[] {
  const events: FireEvent[] = [];
  for (const s of shooters) {
    if (s.isHeld) {
      s.fireCooldown = Math.max(s.fireCooldown, 0);
      continue;
    }
    if (s.ammo <= 0) continue;

    s.fireCooldown -= dt;
    if (s.fireCooldown > 0) continue;

    const dir = pickDirection(s, grid, shooters);
    if (!dir) {
      s.currentDirection = null;
      s.fireCooldown = 0;
      continue;
    }
    const target = findInnermostMatchingSubPixel(s, dir, grid, shooters);
    if (!target) {
      s.currentDirection = null;
      s.fireCooldown = 0;
      continue;
    }

    grid.reserveSubPixel(target.col, target.row, target.subC, target.subR);
    s.consumeBullet();
    s.currentDirection = dir;
    s.fireCooldown += 1 / s.shootsPerSecond;
    events.push({ shooter: s, direction: dir, target });
  }
  return events;
}

function pickDirection(
  s: Shooter,
  grid: Grid,
  shooters: Shooter[],
): Direction | null {
  if (s.currentDirection) {
    const run = computeMatchingRun(s, s.currentDirection, grid, shooters);
    if (run > 0) return s.currentDirection;
  }
  let best: Direction | null = null;
  let bestRun = Infinity;
  for (const d of ALL_DIRECTIONS) {
    const run = computeMatchingRun(s, d, grid, shooters);
    if (run > 0 && run < bestRun) {
      bestRun = run;
      best = d;
    }
  }
  return best;
}

function computeMatchingRun(
  s: Shooter,
  dir: Direction,
  grid: Grid,
  shooters: Shooter[],
): number {
  const v = DIR_VECTORS[dir];
  let c = s.col + v.dc;
  let r = s.row + v.dr;
  while (grid.inBounds(c, r) && isWalkableForRay(grid.getCellKind(c, r))) {
    if (shooterOccupies(c, r, shooters, s)) return 0;
    c += v.dc;
    r += v.dr;
  }
  if (!grid.inBounds(c, r)) return 0;
  if (grid.getCellKind(c, r) !== 'pixel') return 0;
  if (grid.getPixelColor(c, r) !== s.color) return 0;
  // Note: this run stops at the first non-matching cell. If a non-matching
  // pixel sits in front of more matching ones, the run is 0 for now;
  // matching deeper pixels become reachable only once the front is cleared.

  let count = 0;
  while (
    grid.inBounds(c, r) &&
    grid.getCellKind(c, r) === 'pixel' &&
    grid.getPixelColor(c, r) === s.color
  ) {
    count += grid.countAvailableSubPixels(c, r);
    c += v.dc;
    r += v.dr;
  }
  return count;
}

function findInnermostMatchingSubPixel(
  s: Shooter,
  dir: Direction,
  grid: Grid,
  shooters: Shooter[],
): { col: number; row: number; subC: number; subR: number } | null {
  const v = DIR_VECTORS[dir];
  let c = s.col + v.dc;
  let r = s.row + v.dr;
  while (grid.inBounds(c, r) && isWalkableForRay(grid.getCellKind(c, r))) {
    if (shooterOccupies(c, r, shooters, s)) return null;
    c += v.dc;
    r += v.dr;
  }
  // Walk through any matching-color pixel cells whose available sub-pixels
  // are all reserved already, looking for the first cell with an unreserved
  // sub-pixel.
  while (
    grid.inBounds(c, r) &&
    grid.getCellKind(c, r) === 'pixel' &&
    grid.getPixelColor(c, r) === s.color &&
    grid.countAvailableSubPixels(c, r) === 0
  ) {
    c += v.dc;
    r += v.dr;
  }
  if (!grid.inBounds(c, r)) return null;
  if (grid.getCellKind(c, r) !== 'pixel') return null;
  if (grid.getPixelColor(c, r) !== s.color) return null;

  const mask = grid.getSubMask(c, r);
  const reserved = grid.getReservedMask(c, r);
  const available = (sR: number, sC: number) => mask[sR][sC] && !reserved[sR][sC];

  if (dir === 'up') {
    for (let sR = SUB - 1; sR >= 0; sR--) {
      for (let sC = 0; sC < SUB; sC++) {
        if (available(sR, sC)) return { col: c, row: r, subC: sC, subR: sR };
      }
    }
  } else if (dir === 'down') {
    for (let sR = 0; sR < SUB; sR++) {
      for (let sC = 0; sC < SUB; sC++) {
        if (available(sR, sC)) return { col: c, row: r, subC: sC, subR: sR };
      }
    }
  } else if (dir === 'right') {
    for (let sC = 0; sC < SUB; sC++) {
      for (let sR = 0; sR < SUB; sR++) {
        if (available(sR, sC)) return { col: c, row: r, subC: sC, subR: sR };
      }
    }
  } else if (dir === 'left') {
    for (let sC = SUB - 1; sC >= 0; sC--) {
      for (let sR = 0; sR < SUB; sR++) {
        if (available(sR, sC)) return { col: c, row: r, subC: sC, subR: sR };
      }
    }
  }
  return null;
}

function shooterOccupies(
  c: number,
  r: number,
  shooters: Shooter[],
  exclude: Shooter,
): boolean {
  for (const s of shooters) {
    if (s === exclude) continue;
    if (s.col === c && s.row === r) return true;
  }
  return false;
}

function isWalkableForRay(kind: 'void' | 'arena' | 'pixel' | 'cleared'): boolean {
  // Rays pass through arena AND cleared (cleared = a hole where the wall used to be).
  return kind === 'arena' || kind === 'cleared';
}
