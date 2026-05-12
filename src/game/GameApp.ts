import * as THREE from 'three';
import type { LevelData, WeldDef } from '../shared/types';
import { Grid } from './Grid';
import { Shooter } from './Shooter';
import { fireTick } from './FireSimulator';
import { DragController } from './DragController';
import { Hud } from './Hud';
import { WeldLines } from './WeldLines';
import { Bullets } from './Bullets';
import { COLOR_HEX } from '../shared/colors';

const FRUSTUM_MARGIN_CELLS = 1.0;

interface GameAppOpts {
  level: LevelData;
  onMenu: () => void;
  menuLabel?: string;
}

export class GameApp {
  private parent: HTMLElement;
  private opts: GameAppOpts;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private worldRoot: THREE.Group;

  private grid!: Grid;
  private shooters: Shooter[] = [];
  private welds: WeldDef[] = [];
  private weldLines!: WeldLines;
  private bullets!: Bullets;

  private hud: Hud;
  private drag: DragController;

  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private lastTime = 0;
  private timeRemaining: number;
  private state: 'playing' | 'won' | 'lost' = 'playing';

  constructor(parent: HTMLElement, opts: GameAppOpts) {
    this.parent = parent;
    this.opts = opts;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12141d);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.parent.appendChild(this.renderer.domElement);

    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);

    this.buildLevel();

    this.timeRemaining = opts.level.timeLimit;

    this.hud = new Hud(parent, {
      onRestart: () => this.restart(),
      onMenu: () => this.opts.onMenu(),
      menuLabel: opts.menuLabel,
    });
    this.hud.setTime(this.timeRemaining);

    this.drag = new DragController(this.renderer.domElement, {
      camera: this.camera,
      grid: this.grid,
      shooters: this.shooters,
      welds: this.welds,
      enabled: () => this.state === 'playing',
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.parent);
    this.handleResize();

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private buildLevel() {
    this.grid = new Grid(this.worldRoot, this.opts.level);
    this.welds = this.opts.level.welds.map((w) => ({ ...w }));
    const worldOf = (c: number, r: number) => this.grid.worldOf(c, r);
    this.shooters = this.opts.level.shooters.map(
      (def) => new Shooter(def, this.worldRoot, worldOf),
    );
    this.weldLines = new WeldLines(this.worldRoot);
    this.bullets = new Bullets(this.worldRoot);
  }

  private teardownLevel() {
    for (const s of this.shooters) s.dispose();
    this.shooters.length = 0;
    this.welds.length = 0;
    this.weldLines?.dispose();
    this.bullets?.dispose();
    this.grid.dispose();
  }

  private restart() {
    this.hud.hideModal();
    this.teardownLevel();
    this.buildLevel();
    this.timeRemaining = this.opts.level.timeLimit;
    this.state = 'playing';
    this.hud.setTime(this.timeRemaining);
    this.drag.updateRefs({
      grid: this.grid,
      shooters: this.shooters,
      welds: this.welds,
    });
    this.handleResize();
  }

  private loop(timestamp: number) {
    const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    if (this.state === 'playing') {
      this.timeRemaining -= dt;
      this.hud.setTime(this.timeRemaining);
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.state = 'lost';
        this.hud.showLose();
      } else {
        const events = fireTick(dt, this.grid, this.shooters);
        for (const ev of events) {
          const origin = this.grid.worldOf(ev.shooter.col, ev.shooter.row);
          const target = this.grid.subWorldOf(
            ev.target.col,
            ev.target.row,
            ev.target.subC,
            ev.target.subR,
          );
          const t = ev.target;
          this.bullets.spawn(origin, target, COLOR_HEX[ev.shooter.color], () => {
            this.grid.clearSubPixel(t.col, t.row, t.subC, t.subR);
          });
        }
        this.harvestDepletedShooters();
        if (
          this.grid.totalRemainingPixels() === 0 &&
          this.bullets.isEmpty() &&
          this.state === 'playing'
        ) {
          this.state = 'won';
          this.hud.showWin();
        }
      }
    }

    this.bullets.tick(dt);
    this.grid.update(dt);
    this.weldLines.sync(this.welds, this.shooters, (c, r) => this.grid.worldOf(c, r));
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private harvestDepletedShooters() {
    for (let i = this.shooters.length - 1; i >= 0; i--) {
      const s = this.shooters[i];
      if (s.ammo > 0) continue;
      if (s.isHeld) continue; // shouldn't happen, but don't pop while dragged
      this.welds = this.welds.filter((w) => w.a !== s.id && w.b !== s.id);
      this.drag.onShooterRemoved(s);
      s.dispose();
      this.shooters.splice(i, 1);
    }
    this.drag.updateRefs({ welds: this.welds, shooters: this.shooters });
  }

  private handleResize() {
    const w = this.parent.clientWidth;
    const h = this.parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);

    const { cols, rows } = this.grid.bounds();
    const worldW = cols + FRUSTUM_MARGIN_CELLS * 2;
    const worldH = rows + FRUSTUM_MARGIN_CELLS * 2;
    const canvasAspect = w / h;
    const worldAspect = worldW / worldH;

    let halfW: number;
    let halfH: number;
    if (worldAspect > canvasAspect) {
      halfW = worldW / 2;
      halfH = halfW / canvasAspect;
    } else {
      halfH = worldH / 2;
      halfW = halfH * canvasAspect;
    }
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.drag.detach();
    this.resizeObserver.disconnect();
    this.teardownLevel();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
