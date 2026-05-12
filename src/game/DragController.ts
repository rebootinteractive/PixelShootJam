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
  private originals: Map<string, { col: number; row: number }> = new Map();
  private anchorOrigin: { col: number; row: number } | null = null;
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
    if (idx >= 0) this.grabbed.splice(idx, 1);
    this.originals.delete(s.id);
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this.onDownBound);
    this.canvas.removeEventListener('pointermove', this.onMoveBound);
    this.canvas.removeEventListener('pointerup', this.onUpBound);
    this.canvas.removeEventListener('pointercancel', this.onUpBound);
    this.releasePointer();
    this.grabbed = null;
    this.originals.clear();
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
    this.originals.clear();
    for (const s of group) {
      this.originals.set(s.id, { col: s.col, row: s.row });
      s.setHeld(true);
      s.setValidPreview(true);
    }
    this.anchorOrigin = { col: hit.col, row: hit.row };
  }

  private onMove(e: PointerEvent) {
    if (this.pointerId !== e.pointerId) return;
    if (!this.grabbed || !this.anchorOrigin) return;
    const cell = this.cellAt(e);
    if (!cell) return;

    const dc = cell.col - this.anchorOrigin.col;
    const dr = cell.row - this.anchorOrigin.row;

    for (const s of this.grabbed) {
      const orig = this.originals.get(s.id)!;
      s.setPosition(orig.col + dc, orig.row + dr);
    }

    const valid = this.isPlacementValid();
    for (const s of this.grabbed) s.setValidPreview(valid);
  }

  private onUp(e: PointerEvent) {
    if (this.pointerId !== e.pointerId) return;
    this.releasePointer();
    if (!this.grabbed) return;

    const valid = this.isPlacementValid();
    if (!valid) {
      for (const s of this.grabbed) {
        const orig = this.originals.get(s.id)!;
        s.setPosition(orig.col, orig.row);
      }
    }
    for (const s of this.grabbed) {
      s.setHeld(false);
      s.setValidPreview(true);
    }
    this.grabbed = null;
    this.originals.clear();
    this.anchorOrigin = null;
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

  private isPlacementValid(): boolean {
    if (!this.grabbed) return false;
    const groupIds = new Set(this.grabbed.map((s) => s.id));
    const groupCells = new Set(
      this.grabbed.map((s) => `${s.col},${s.row}`),
    );
    if (groupCells.size !== this.grabbed.length) return false; // self-overlap
    for (const s of this.grabbed) {
      if (!this.refs.grid.inBounds(s.col, s.row)) return false;
      if (this.refs.grid.getCellKind(s.col, s.row) !== 'arena') return false;
    }
    for (const other of this.refs.shooters) {
      if (groupIds.has(other.id)) continue;
      if (groupCells.has(`${other.col},${other.row}`)) return false;
    }
    return true;
  }
}
