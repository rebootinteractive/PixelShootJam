import * as THREE from 'three';
import type { CellKind, ColorKey, LevelData } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

const ARENA_COLOR = 0x262d3f;

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
  private pixelMeshes: (THREE.Mesh | null)[][];

  private root: THREE.Group;
  private arenaTiles: THREE.Mesh[] = [];
  private sharedArenaGeo: THREE.PlaneGeometry;
  private sharedArenaMat: THREE.MeshBasicMaterial;
  private pixelGeo: THREE.PlaneGeometry;
  private pixelMaterials: Map<ColorKey, THREE.MeshBasicMaterial>;

  private clearingPixels: ClearAnim[] = [];

  constructor(parent: THREE.Group, level: LevelData) {
    this.cols = level.cols;
    this.rows = level.rows;
    this.cells = level.cells.map((row) => row.slice());
    this.pixelColors = level.pixels.map((row) => row.slice());
    this.pixelMeshes = Array.from({ length: this.rows }, () =>
      new Array<THREE.Mesh | null>(this.cols).fill(null),
    );

    this.root = new THREE.Group();
    parent.add(this.root);

    this.sharedArenaGeo = new THREE.PlaneGeometry(0.94, 0.94);
    this.sharedArenaMat = new THREE.MeshBasicMaterial({ color: ARENA_COLOR });
    this.pixelGeo = new THREE.PlaneGeometry(0.92, 0.92);
    this.pixelMaterials = new Map();

    this.buildArenaTiles();
    this.buildPixelMeshes();
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

  clearPixel(col: number, row: number) {
    if (!this.inBounds(col, row)) return;
    if (this.cells[row][col] !== 'pixel') return;
    const mesh = this.pixelMeshes[row][col];
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
    }
    this.cells[row][col] = 'arena';
    this.pixelColors[row][col] = null;
    this.pixelMeshes[row][col] = null;
  }

  totalRemainingPixels(): number {
    let n = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c] === 'pixel') n++;
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

  private buildPixelMeshes() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c] !== 'pixel') continue;
        const color = this.pixelColors[r][c]!;
        const mat = this.getOrCreatePixelMaterial(color);
        const mesh = new THREE.Mesh(this.pixelGeo, mat);
        const w = this.worldOf(c, r);
        mesh.position.set(w.x, w.y, 0.05);
        this.root.add(mesh);
        this.pixelMeshes[r][c] = mesh;
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
    this.pixelGeo.dispose();
    for (const m of this.pixelMaterials.values()) m.dispose();
    this.pixelMaterials.clear();
    this.arenaTiles.length = 0;
  }
}
