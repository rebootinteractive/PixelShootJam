import * as THREE from 'three';
import type { CellKind, ColorKey, LevelData } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

const ARENA_COLOR = 0x262d3f;
const SUB = 3; // sub-cells per macro side
const SUB_TOTAL = SUB * SUB;

interface ClearAnim {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private cells: CellKind[][];
  private pixelColors: (ColorKey | null)[][];

  // [macroRow][macroCol] -> 3x3 boolean mask, true = filled (visible & uncleared).
  private subMask: boolean[][][][];
  // Reserved = a bullet is in flight toward this sub-pixel. Filled mesh still
  // visible until impact, but targeting logic treats it as already taken.
  private reservedMask: boolean[][][][];
  // [macroRow][macroCol][subR][subC] -> mesh while filled, null after cleared.
  private subMeshes: (THREE.Mesh | null)[][][][];

  private root: THREE.Group;
  private arenaTiles: THREE.Mesh[] = [];
  private sharedArenaGeo: THREE.PlaneGeometry;
  private sharedArenaMat: THREE.MeshBasicMaterial;
  private subGeo: THREE.PlaneGeometry;
  private pixelMaterials: Map<ColorKey, THREE.MeshBasicMaterial>;

  private clearingPixels: ClearAnim[] = [];

  constructor(parent: THREE.Group, level: LevelData) {
    this.cols = level.cols;
    this.rows = level.rows;
    this.cells = level.cells.map((row) => row.slice());
    this.pixelColors = level.pixels.map((row) => row.slice());

    this.subMask = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => emptyMask()),
    );
    this.reservedMask = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => emptyMask()),
    );
    this.subMeshes = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => emptyMeshGrid()),
    );

    this.root = new THREE.Group();
    parent.add(this.root);

    this.sharedArenaGeo = new THREE.PlaneGeometry(0.94, 0.94);
    this.sharedArenaMat = new THREE.MeshBasicMaterial({ color: ARENA_COLOR });
    this.subGeo = new THREE.PlaneGeometry(0.28, 0.28);
    this.pixelMaterials = new Map();

    this.buildArenaTiles();
    this.buildSubPixels();
  }

  worldOf(col: number, row: number): { x: number; y: number } {
    return {
      x: col - (this.cols - 1) / 2,
      y: (this.rows - 1) / 2 - row,
    };
  }

  worldToCell(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.round(x + (this.cols - 1) / 2),
      row: Math.round((this.rows - 1) / 2 - y),
    };
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  getCellKind(col: number, row: number): CellKind {
    if (!this.inBounds(col, row)) return 'void';
    return this.cells[row][col];
  }

  getPixelColor(col: number, row: number): ColorKey | null {
    if (!this.inBounds(col, row)) return null;
    return this.pixelColors[row][col];
  }

  getSubMask(col: number, row: number): boolean[][] {
    return this.subMask[row][col];
  }

  getReservedMask(col: number, row: number): boolean[][] {
    return this.reservedMask[row][col];
  }

  isSubPixelAvailable(col: number, row: number, subC: number, subR: number): boolean {
    if (!this.inBounds(col, row)) return false;
    if (this.cells[row][col] !== 'pixel') return false;
    return this.subMask[row][col][subR][subC] && !this.reservedMask[row][col][subR][subC];
  }

  /** Total still-displayed sub-pixels (used for win check; includes reserved). */
  countFilledSubPixels(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    if (this.cells[row][col] !== 'pixel') return 0;
    let n = 0;
    const mask = this.subMask[row][col];
    for (let r = 0; r < SUB; r++) for (let c = 0; c < SUB; c++) if (mask[r][c]) n++;
    return n;
  }

  /** Sub-pixels available for targeting (filled and not reserved). */
  countAvailableSubPixels(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    if (this.cells[row][col] !== 'pixel') return 0;
    let n = 0;
    const mask = this.subMask[row][col];
    const reserved = this.reservedMask[row][col];
    for (let r = 0; r < SUB; r++)
      for (let c = 0; c < SUB; c++) if (mask[r][c] && !reserved[r][c]) n++;
    return n;
  }

  reserveSubPixel(col: number, row: number, subC: number, subR: number) {
    if (!this.inBounds(col, row)) return;
    if (subC < 0 || subC >= SUB || subR < 0 || subR >= SUB) return;
    this.reservedMask[row][col][subR][subC] = true;
  }

  subWorldOf(col: number, row: number, subC: number, subR: number): { x: number; y: number } {
    const center = this.worldOf(col, row);
    const off = subOffset(subC, subR);
    return { x: center.x + off.x, y: center.y + off.y };
  }

  /** Clear a single sub-pixel; transitions the macro cell to 'arena' once empty. */
  clearSubPixel(col: number, row: number, subC: number, subR: number) {
    if (!this.inBounds(col, row)) return;
    if (this.cells[row][col] !== 'pixel') return;
    if (subC < 0 || subC >= SUB || subR < 0 || subR >= SUB) return;
    if (!this.subMask[row][col][subR][subC]) return;

    this.subMask[row][col][subR][subC] = false;
    this.reservedMask[row][col][subR][subC] = false;
    const mesh = this.subMeshes[row][col][subR][subC];
    if (mesh) {
      const original = mesh.material as THREE.MeshBasicMaterial;
      const cloned = original.clone();
      cloned.transparent = true;
      mesh.material = cloned;
      this.clearingPixels.push({
        mesh,
        material: cloned,
        elapsed: 0,
        duration: 0.18,
      });
      this.subMeshes[row][col][subR][subC] = null;
    }

    if (this.countFilledSubPixels(col, row) === 0) {
      this.cells[row][col] = 'cleared';
      this.pixelColors[row][col] = null;
    }
  }

  /** Total filled sub-pixels remaining on the wall (atomic unit). */
  totalRemainingPixels(): number {
    let n = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c] === 'pixel') n += this.countFilledSubPixels(c, r);
      }
    }
    return n;
  }

  bounds(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  update(dt: number) {
    for (let i = this.clearingPixels.length - 1; i >= 0; i--) {
      const ev = this.clearingPixels[i];
      ev.elapsed += dt;
      const t = Math.min(1, ev.elapsed / ev.duration);
      ev.mesh.scale.set(1 - t, 1 - t, 1);
      ev.material.opacity = 1 - t;
      if (t >= 1) {
        this.root.remove(ev.mesh);
        ev.material.dispose();
        this.clearingPixels.splice(i, 1);
      }
    }
  }

  private buildArenaTiles() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c] === 'void') continue;
        const mesh = new THREE.Mesh(this.sharedArenaGeo, this.sharedArenaMat);
        const w = this.worldOf(c, r);
        mesh.position.set(w.x, w.y, 0);
        this.root.add(mesh);
        this.arenaTiles.push(mesh);
      }
    }
  }

  private buildSubPixels() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c] !== 'pixel') continue;
        const color = this.pixelColors[r][c]!;
        const mat = this.getOrCreatePixelMaterial(color);
        const center = this.worldOf(c, r);
        for (let sR = 0; sR < SUB; sR++) {
          for (let sC = 0; sC < SUB; sC++) {
            this.subMask[r][c][sR][sC] = true;
            this.reservedMask[r][c][sR][sC] = false;
            const sub = subOffset(sC, sR);
            const mesh = new THREE.Mesh(this.subGeo, mat);
            mesh.position.set(center.x + sub.x, center.y + sub.y, 0.05);
            this.root.add(mesh);
            this.subMeshes[r][c][sR][sC] = mesh;
          }
        }
      }
    }
  }

  private getOrCreatePixelMaterial(color: ColorKey): THREE.MeshBasicMaterial {
    let mat = this.pixelMaterials.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: COLOR_HEX[color] });
      this.pixelMaterials.set(color, mat);
    }
    return mat;
  }

  dispose() {
    for (const ev of this.clearingPixels) ev.material.dispose();
    this.clearingPixels.length = 0;
    this.root.parent?.remove(this.root);
    this.sharedArenaGeo.dispose();
    this.sharedArenaMat.dispose();
    this.subGeo.dispose();
    for (const m of this.pixelMaterials.values()) m.dispose();
    this.pixelMaterials.clear();
    this.arenaTiles.length = 0;
  }
}

function emptyMask(): boolean[][] {
  return [
    [false, false, false],
    [false, false, false],
    [false, false, false],
  ];
}

function emptyMeshGrid(): (THREE.Mesh | null)[][] {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}

/** Offset of sub-cell (subC, subR) within a macro cell, in world units. */
function subOffset(subC: number, subR: number): { x: number; y: number } {
  // subC 0..2 maps to x offsets -0.32, 0, +0.32 (left, center, right)
  // subR 0..2 maps to y offsets +0.32, 0, -0.32 (top, middle, bottom — row 0 is top)
  const step = 0.32;
  return {
    x: (subC - 1) * step,
    y: (1 - subR) * step,
  };
}
