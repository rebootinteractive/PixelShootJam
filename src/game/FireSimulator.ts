import { ALL_DIRECTIONS, DIR_VECTORS } from '../shared/types';
import type { Direction } from '../shared/types';
import type { Grid } from './Grid';
import type { Shooter } from './Shooter';

export interface FireEvent {
  shooter: Shooter;
  direction: Direction;
  target: { col: number; row: number };
}

/**
 * Advance the firing simulation by `dt` seconds. Mutates shooter ammo and
 * clears pixels on the grid as shots resolve. Returns an array of fire events
 * for visual hooks.
 */
export function fireTick(
  dt: number,
  grid: Grid,
  shooters: Shooter[],
): FireEvent[] {
  const events: FireEvent[] = [];
  for (const s of shooters) {
    if (s.isHeld) {
      // Suspend cooldown progress while held; reset partial cooldown so it
      // doesn't accumulate into an instant shot on drop.
      s.fireCooldown = Math.max(s.fireCooldown, 0);
      continue;
    }
    if (s.ammo <= 0) continue;

    s.fireCooldown -= dt;
    if (s.fireCooldown > 0) continue;

    const dir = pickDirection(s, grid, shooters);
    if (!dir) {
      s.currentDirection = null;
      // Don't keep adding negative cooldown — pin at 0 so when LOS opens
      // the shooter fires within one frame.
      s.fireCooldown = 0;
      continue;
    }

    const target = findInnermostMatchingPixel(s, dir, grid, shooters);
    if (!target) {
      s.currentDirection = null;
      s.fireCooldown = 0;
      continue;
    }

    grid.clearPixel(target.col, target.row);
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
  // Sticky: keep the current direction while it still has matching run > 0.
  if (s.currentDirection) {
    const run = computeMatchingRun(s, s.currentDirection, grid, shooters);
    if (run > 0) return s.currentDirection;
  }
  // Otherwise pick the smallest non-zero matching run. Ties broken by
  // ALL_DIRECTIONS order (up < right < down < left).
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

/**
 * Count the matching-color pixels in a 1-cell-wide channel starting from the
 * shooter's cell in `dir`. Walks through arena cells (LOS), stops if blocked
 * by another shooter, then counts consecutive same-color pixels until a
 * non-matching pixel, void, or edge of grid.
 */
function computeMatchingRun(
  s: Shooter,
  dir: Direction,
  grid: Grid,
  shooters: Shooter[],
): number {
  const v = DIR_VECTORS[dir];
  let c = s.col + v.dc;
  let r = s.row + v.dr;

  // Walk through arena cells, breaking on a blocking shooter or non-arena.
  while (grid.inBounds(c, r) && grid.getCellKind(c, r) === 'arena') {
    if (shooterOccupies(c, r, shooters, s)) return 0;
    c += v.dc;
    r += v.dr;
  }

  if (!grid.inBounds(c, r)) return 0;
  if (grid.getCellKind(c, r) !== 'pixel') return 0;

  let count = 0;
  while (
    grid.inBounds(c, r) &&
    grid.getCellKind(c, r) === 'pixel' &&
    grid.getPixelColor(c, r) === s.color
  ) {
    count++;
    c += v.dc;
    r += v.dr;
  }
  return count;
}

function findInnermostMatchingPixel(
  s: Shooter,
  dir: Direction,
  grid: Grid,
  shooters: Shooter[],
): { col: number; row: number } | null {
  const v = DIR_VECTORS[dir];
  let c = s.col + v.dc;
  let r = s.row + v.dr;
  while (grid.inBounds(c, r) && grid.getCellKind(c, r) === 'arena') {
    if (shooterOccupies(c, r, shooters, s)) return null;
    c += v.dc;
    r += v.dr;
  }
  if (!grid.inBounds(c, r)) return null;
  if (grid.getCellKind(c, r) !== 'pixel') return null;
  if (grid.getPixelColor(c, r) !== s.color) return null;
  return { col: c, row: r };
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
