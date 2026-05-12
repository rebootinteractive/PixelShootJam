import * as THREE from 'three';

const BULLET_RADIUS = 0.11;
const BULLET_SPEED = 14; // world units per second
const BULLET_Z = 0.22;

interface Bullet {
  mesh: THREE.Mesh;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  elapsed: number;
  duration: number;
  onArrive: () => void;
}

export class Bullets {
  private root: THREE.Group;
  private geo: THREE.CircleGeometry;
  private mats: Map<number, THREE.MeshBasicMaterial> = new Map();
  private active: Bullet[] = [];

  constructor(parent: THREE.Group) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.geo = new THREE.CircleGeometry(BULLET_RADIUS, 18);
  }

  spawn(
    origin: { x: number; y: number },
    target: { x: number; y: number },
    colorHex: number,
    onArrive: () => void,
  ) {
    const mat = this.getOrCreateMat(colorHex);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(origin.x, origin.y, BULLET_Z);
    this.root.add(mesh);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max(0.04, dist / BULLET_SPEED);
    this.active.push({
      mesh,
      origin: { x: origin.x, y: origin.y },
      target: { x: target.x, y: target.y },
      elapsed: 0,
      duration,
      onArrive,
    });
  }

  tick(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.elapsed += dt;
      const t = Math.min(1, b.elapsed / b.duration);
      b.mesh.position.x = b.origin.x + (b.target.x - b.origin.x) * t;
      b.mesh.position.y = b.origin.y + (b.target.y - b.origin.y) * t;
      if (t >= 1) {
        this.root.remove(b.mesh);
        try {
          b.onArrive();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
        this.active.splice(i, 1);
      }
    }
  }

  isEmpty(): boolean {
    return this.active.length === 0;
  }

  private getOrCreateMat(colorHex: number): THREE.MeshBasicMaterial {
    let mat = this.mats.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: colorHex });
      this.mats.set(colorHex, mat);
    }
    return mat;
  }

  dispose() {
    for (const b of this.active) this.root.remove(b.mesh);
    this.active.length = 0;
    this.geo.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.root.parent?.remove(this.root);
  }
}
