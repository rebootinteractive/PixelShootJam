import * as THREE from 'three';
import type { ColorKey, Direction, ShooterDef } from '../shared/types';
import { COLOR_HEX } from '../shared/colors';

const HELD_SCALE = 1.14;

export class Shooter {
  readonly id: string;
  readonly color: ColorKey;
  readonly shootsPerSecond: number;

  col: number;
  row: number;
  ammo: number;

  isHeld = false;
  isValidPreview = true;
  fireCooldown = 0;
  currentDirection: Direction | null = null;

  private root: THREE.Group;
  private body: THREE.Mesh;
  private bodyGeo: THREE.PlaneGeometry;
  private bodyMat: THREE.MeshBasicMaterial;
  private outline: THREE.LineSegments;
  private outlineGeo: THREE.BufferGeometry;
  private outlineMat: THREE.LineBasicMaterial;
  private numberCanvas: HTMLCanvasElement;
  private numberTexture: THREE.CanvasTexture;
  private numberSpriteMat: THREE.SpriteMaterial;
  private numberSprite: THREE.Sprite;

  private worldOf: (col: number, row: number) => { x: number; y: number };

  constructor(
    def: ShooterDef,
    parent: THREE.Group,
    worldOf: (col: number, row: number) => { x: number; y: number },
  ) {
    this.id = def.id;
    this.color = def.color;
    this.shootsPerSecond = def.shootsPerSecond;
    this.col = def.col;
    this.row = def.row;
    this.ammo = def.ammo;
    this.worldOf = worldOf;

    this.root = new THREE.Group();
    parent.add(this.root);

    this.bodyGeo = new THREE.PlaneGeometry(0.78, 0.78);
    this.bodyMat = new THREE.MeshBasicMaterial({ color: COLOR_HEX[def.color] });
    this.body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    this.body.position.z = 0.1;
    this.root.add(this.body);

    // Dark outline
    const w = 0.78 / 2;
    const verts = new Float32Array([
      -w, -w, 0, w, -w, 0,
      w, -w, 0, w, w, 0,
      w, w, 0, -w, w, 0,
      -w, w, 0, -w, -w, 0,
    ]);
    this.outlineGeo = new THREE.BufferGeometry();
    this.outlineGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    this.outlineMat = new THREE.LineBasicMaterial({ color: 0x0d0f15 });
    this.outline = new THREE.LineSegments(this.outlineGeo, this.outlineMat);
    this.outline.position.z = 0.11;
    this.root.add(this.outline);

    this.numberCanvas = document.createElement('canvas');
    this.numberCanvas.width = 96;
    this.numberCanvas.height = 96;
    this.numberTexture = new THREE.CanvasTexture(this.numberCanvas);
    this.numberSpriteMat = new THREE.SpriteMaterial({
      map: this.numberTexture,
      transparent: true,
    });
    this.numberSprite = new THREE.Sprite(this.numberSpriteMat);
    this.numberSprite.scale.set(0.55, 0.55, 1);
    this.numberSprite.position.z = 0.15;
    this.root.add(this.numberSprite);

    this.refreshNumber();
    this.refreshPosition();
  }

  setPosition(col: number, row: number) {
    this.col = col;
    this.row = row;
    this.refreshPosition();
  }

  setHeld(held: boolean) {
    this.isHeld = held;
    this.root.scale.set(held ? HELD_SCALE : 1, held ? HELD_SCALE : 1, 1);
    this.root.position.z = held ? 0.4 : 0;
  }

  setValidPreview(valid: boolean) {
    this.isValidPreview = valid;
    this.bodyMat.color.setHex(valid ? COLOR_HEX[this.color] : 0xff5050);
  }

  consumeBullet() {
    this.ammo = Math.max(0, this.ammo - 1);
    this.refreshNumber();
  }

  refreshNumber() {
    const ctx = this.numberCanvas.getContext('2d')!;
    const size = this.numberCanvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d0f15';
    ctx.font = 'bold 60px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.ammo), size / 2, size / 2 + 4);
    this.numberTexture.needsUpdate = true;
  }

  private refreshPosition() {
    const w = this.worldOf(this.col, this.row);
    this.root.position.x = w.x;
    this.root.position.y = w.y;
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.bodyGeo.dispose();
    this.bodyMat.dispose();
    this.outlineGeo.dispose();
    this.outlineMat.dispose();
    this.numberTexture.dispose();
    this.numberSpriteMat.dispose();
  }
}
