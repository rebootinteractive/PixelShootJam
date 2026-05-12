import * as THREE from 'three';
import type { WeldDef } from '../shared/types';
import type { Grid } from './Grid';
import type { Shooter } from './Shooter';

export function computeWeldedGroup(
  rootId: string,
  welds: WeldDef[],
  shooters: Shooter[],
): Shooter[] {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const w of welds) {
      if (ids.has(w.a) && !ids.has(w.b)) {
        ids.add(w.b);
        added = true;
      } else if (ids.has(w.b) && !ids.has(w.a)) {
        ids.add(w.a);
        added = true;
      }
    }
  }
  return shooters.filter((s) => ids.has(s.id));
}

interface DragRefs {
  camera: THREE.OrthographicCamera;
  grid: Grid;
  shooters: Shooter[];
  welds: WeldDef[];
  enabled: () => boolean;
}

export class DragController {
  private canvas: HTMLCanvasElement;
  private refs: DragRefs;

  private grabbed: Shooter[] | null = null;
  private anchor: Shooter | null = null;
  // Offset of each grabbed[i] from the anchor at grab time (fixed for the
  // duration of the drag — describes the rigid group shape).
  private groupOffsets: { dc: number; dr: number }[] = [];
  private pointerId: number | null = null;

  private onDownBound: (e: PointerEvent) => void;
  private onMoveBound: (e: PointerEvent) => void;
  private onUpBound: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement, refs: DragRefs) {
    this.canvas = canvas;
    this.refs = refs;
    this.onDownBound = (e) => this.onDown(e);
    this.onMoveBound = (e) => this.onMove(e);
    this.onUpBound = (e) => this.onUp(e);
    this.canvas.addEventListener('pointerdown', this.onDownBound);
    this.canvas.addEventListener('pointermove', this.onMoveBound);
    this.canvas.addEventListener('pointerup', this.onUpBound);
    this.canvas.addEventListener('pointercancel', this.onUpBound);
  }

  updateRefs(partial: Partial<DragRefs>) {
    this.refs = { ...this.refs, ...partial };
  }

  onShooterRemoved(s: Shooter) {
    if (!this.grabbed) return;
    const idx = this.grabbed.indexOf(s);
    if (idx >= 0) {
      this.grabbed.splice(idx, 1);
      this.groupOffsets.splice(idx, 1);
    }
    if (this.anchor === s) {
      // Anchor was removed (shouldn't happen during a drag, but defend).
      this.releasePointer();
      this.grabbed = null;
      this.anchor = null;
      this.groupOffsets = [];
    }
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this.onDownBound);
    this.canvas.removeEventListener('pointermove', this.onMoveBound);
    this.canvas.removeEventListener('pointerup', this.onUpBound);
    this.canvas.removeEventListener('pointercancel', this.onUpBound);
    this.releasePointer();
    this.grabbed = null;
    this.anchor = null;
    this.groupOffsets = [];
  }

  private cellAt(e: PointerEvent): { col: number; row: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const cam = this.refs.camera;
    const worldX = cam.left + ((ndcX + 1) / 2) * (cam.right - cam.left);
    const worldY = cam.bottom + ((ndcY + 1) / 2) * (cam.top - cam.bottom);
    return this.refs.grid.worldToCell(worldX, worldY);
  }

  private onDown(e: PointerEvent) {
    if (!this.refs.enabled()) return;
    if (this.pointerId !== null) return;
    const cell = this.cellAt(e);
    if (!cell) return;
    const hit = this.refs.shooters.find(
      (s) => s.col === cell.col && s.row === cell.row,
    );
    if (!hit) return;

    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);

    const group = computeWeldedGroup(hit.id, this.refs.welds, this.refs.shooters);
    this.grabbed = group;
    this.anchor = hit;
    this.groupOffsets = group.map((s) => ({
      dc: s.col - hit.col,
      dr: s.row - hit.row,
    }));
    for (const s of group) {
      s.setHeld(true);
      s.setValidPreview(true);
    }
  }

  private onMove(e: PointerEvent) {
    if (this.pointerId !== e.pointerId) return;
    if (!this.grabbed || !this.anchor) return;
    const mouse = this.cellAt(e);
    if (!mouse) return;

    const grid = this.refs.grid;
    const groupSet = new Set(this.grabbed.map((s) => s.id));

    const canStand = (col: number, row: number): boolean => {
      for (const off of this.groupOffsets) {
        const c = col + off.dc;
        const r = row + off.dr;
        if (!grid.inBounds(c, r)) return false;
        if (grid.getCellKind(c, r) !== 'arena') return false;
        for (const other of this.refs.shooters) {
          if (groupSet.has(other.id)) continue;
          if (other.col === c && other.row === r) return false;
        }
      }
      return true;
    };

    const start = { col: this.anchor.col, row: this.anchor.row };
    const next = findBestReachable(start, mouse, canStand);

    if (next.col === start.col && next.row === start.row) return;
    const dc = next.col - start.col;
    const dr = next.row - start.row;
    for (const s of this.grabbed) {
      s.setPosition(s.col + dc, s.row + dr);
    }
  }

  private onUp(e: PointerEvent) {
    if (this.pointerId !== e.pointerId) return;
    this.releasePointer();
    if (!this.grabbed) return;
    for (const s of this.grabbed) {
      s.setHeld(false);
      s.setValidPreview(true);
    }
    this.grabbed = null;
    this.anchor = null;
    this.groupOffsets = [];
  }

  private releasePointer() {
    if (this.pointerId === null) return;
    try {
      this.canvas.releasePointerCapture(this.pointerId);
    } catch {
      /* ignore */
    }
    this.pointerId = null;
  }
}

/**
 * BFS from `start`, only standing on cells where `canStand` is true. Returns
 * the reachable cell that minimizes Manhattan distance to `goal` (early exit
 * if `goal` itself is reachable). The start cell is assumed to be standable.
 */
function findBestReachable(
  start: { col: number; row: number },
  goal: { col: number; row: number },
  canStand: (col: number, row: number) => boolean,
): { col: number; row: number } {
  if (start.col === goal.col && start.row === goal.row) return start;
  const visited = new Set<string>();
  const queue: { col: number; row: number }[] = [start];
  visited.add(`${start.col},${start.row}`);
  let best = start;
  let bestDist = manhattan(start, goal);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.col === goal.col && cur.row === goal.row) return cur;
    const d = manhattan(cur, goal);
    if (d < bestDist) {
      best = cur;
      bestDist = d;
    }
    const steps: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dc, dr] of steps) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!canStand(nc, nr)) continue;
      visited.add(key);
      queue.push({ col: nc, row: nr });
    }
  }
  return best;
}

function manhattan(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}
