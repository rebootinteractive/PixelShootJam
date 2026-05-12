import * as THREE from 'three';
import type { WeldDef } from '../shared/types';
import type { Shooter } from './Shooter';

const WELD_THICKNESS = 0.18;
const WELD_COLOR = 0xf1f3f9;

interface WeldEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

export class WeldLines {
  private root: THREE.Group;
  private geo: THREE.PlaneGeometry;
  private entries: Map<string, WeldEntry> = new Map();

  constructor(parent: THREE.Group) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.geo = new THREE.PlaneGeometry(1, WELD_THICKNESS);
  }

  sync(
    welds: WeldDef[],
    shooters: Shooter[],
    worldOf: (col: number, row: number) => { x: number; y: number },
  ) {
    const byId = new Map(shooters.map((s) => [s.id, s]));
    const keepKeys = new Set<string>();
    for (const w of welds) {
      const key = keyOf(w);
      keepKeys.add(key);
    }
    for (const [key, entry] of this.entries) {
      if (!keepKeys.has(key)) {
        this.root.remove(entry.mesh);
        entry.mat.dispose();
        this.entries.delete(key);
      }
    }
    for (const w of welds) {
      const a = byId.get(w.a);
      const b = byId.get(w.b);
      if (!a || !b) continue;
      const key = keyOf(w);
      const wa = worldOf(a.col, a.row);
      const wb = worldOf(b.col, b.row);
      const dx = wb.x - wa.x;
      const dy = wb.y - wa.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      let entry = this.entries.get(key);
      if (!entry) {
        const mat = new THREE.MeshBasicMaterial({
          color: WELD_COLOR,
          transparent: true,
          opacity: 0.92,
        });
        const mesh = new THREE.Mesh(this.geo, mat);
        mesh.position.z = 0.13;
        this.root.add(mesh);
        entry = { mesh, mat };
        this.entries.set(key, entry);
      }
      entry.mesh.position.set((wa.x + wb.x) / 2, (wa.y + wb.y) / 2, 0.13);
      entry.mesh.scale.set(len, 1, 1);
      entry.mesh.rotation.z = angle;
    }
  }

  dispose() {
    for (const entry of this.entries.values()) {
      this.root.remove(entry.mesh);
      entry.mat.dispose();
    }
    this.entries.clear();
    this.geo.dispose();
    this.root.parent?.remove(this.root);
  }
}

function keyOf(w: WeldDef): string {
  return w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
}
