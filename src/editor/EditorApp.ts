import * as THREE from 'three';
import type {
  CellKind,
  ColorKey,
  LevelData,
  ShooterDef,
} from '../shared/types';
import { ALL_COLORS, COLOR_CSS } from '../shared/colors';
import { Grid } from '../game/Grid';
import { Shooter } from '../game/Shooter';
import { WeldLines } from '../game/WeldLines';
import { saveCustomLevel } from '../ui/storage';

interface EditorOpts {
  initial?: LevelData;
  onExit: () => void;
  onTestPlay: (lv: LevelData) => void;
}

type Tool = 'pixel' | 'void' | 'shooter' | 'weld' | 'erase';

const TOOL_LABELS: Record<Tool, string> = {
  pixel: '🟪 Pixel',
  void: '⬛ Void',
  shooter: '◉ Shooter',
  weld: '🔗 Weld',
  erase: '🧽 Erase',
};

const TOOL_HINTS: Record<Tool, string> = {
  pixel: 'Paint a wall pixel of the active color. Number keys 1–6 switch colors.',
  void: 'Mark a cell as void (not part of the playable shape).',
  shooter:
    'Place a shooter on an empty arena cell. Tap existing to recolor. Ammo is set by Distribute.',
  weld: 'Tap two adjacent shooters to weld them. Tap the same pair again to unweld.',
  erase: 'Clear back to arena (removes pixel or shooter).',
};

function makeBlankLevel(cols: number, rows: number): LevelData {
  const cells: CellKind[][] = Array.from({ length: rows }, () =>
    new Array<CellKind>(cols).fill('arena'),
  );
  const pixels: (ColorKey | null)[][] = Array.from({ length: rows }, () =>
    new Array<ColorKey | null>(cols).fill(null),
  );
  return {
    id: `custom-${Date.now()}`,
    name: 'Untitled',
    cols,
    rows,
    cells,
    pixels,
    shooters: [],
    welds: [],
    timeLimit: 60,
  };
}

function cloneLevel(level: LevelData): LevelData {
  return {
    id: level.id,
    name: level.name,
    cols: level.cols,
    rows: level.rows,
    cells: level.cells.map((row) => row.slice()),
    pixels: level.pixels.map((row) => row.slice()),
    shooters: level.shooters.map((s) => ({ ...s })),
    welds: level.welds.map((w) => ({ ...w })),
    timeLimit: level.timeLimit,
  };
}

function ensureCustomId(level: LevelData): LevelData {
  if (level.id && level.id.startsWith('custom-')) return level;
  return { ...level, id: `custom-${Date.now()}` };
}

export class EditorApp {
  private parent: HTMLElement;
  private opts: EditorOpts;
  private working: LevelData;

  private wrap: HTMLDivElement;
  private toolbarEl: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private canvasContainer: HTMLDivElement;
  private bottomEl: HTMLDivElement;
  private modalEl: HTMLDivElement | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private worldRoot: THREE.Group;
  private grid!: Grid;
  private shooters: Shooter[] = [];
  private weldLines!: WeldLines;

  private activeTool: Tool = 'pixel';
  private activeColor: ColorKey = 'pink';
  private rateValue = 6;
  private weldStartId: string | null = null;
  private onKeyDownBound: (e: KeyboardEvent) => void;

  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private statusTimeout: number | null = null;

  constructor(parent: HTMLElement, opts: EditorOpts) {
    this.parent = parent;
    this.opts = opts;
    this.working = opts.initial ? cloneLevel(opts.initial) : makeBlankLevel(5, 6);

    this.wrap = document.createElement('div');
    this.wrap.className = 'editor-wrapper';
    parent.appendChild(this.wrap);

    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'editor-toolbar';
    this.wrap.appendChild(this.toolbarEl);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'editor-status';
    this.wrap.appendChild(this.statusEl);

    this.canvasContainer = document.createElement('div');
    this.canvasContainer.className = 'editor-canvas';
    this.wrap.appendChild(this.canvasContainer);

    this.bottomEl = document.createElement('div');
    this.bottomEl.className = 'editor-bottom';
    this.wrap.appendChild(this.bottomEl);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12141d);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);

    this.rebuildScene();
    this.renderToolbar();
    this.renderBottom();
    this.setStatus(TOOL_HINTS[this.activeTool]);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointer);
    this.onKeyDownBound = (e) => this.onKeyDown(e);
    window.addEventListener('keydown', this.onKeyDownBound);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvasContainer);
    this.handleResize();

    this.rafId = requestAnimationFrame(this.loop);
  }

  // ─── Scene ────────────────────────────────────────────────────────────
  private rebuildScene() {
    if (this.weldLines) this.weldLines.dispose();
    for (const s of this.shooters) s.dispose();
    this.shooters = [];
    if (this.grid) this.grid.dispose();

    this.grid = new Grid(this.worldRoot, this.working);
    this.weldLines = new WeldLines(this.worldRoot);
    const worldOf = (c: number, r: number) => this.grid.worldOf(c, r);
    this.shooters = this.working.shooters.map(
      (def) => new Shooter(def, this.worldRoot, worldOf),
    );
    this.handleResize();
  }

  private loop = () => {
    this.weldLines.sync(this.working.welds, this.shooters, (c, r) =>
      this.grid.worldOf(c, r),
    );
    this.grid.update(0);
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private handleResize() {
    const w = this.canvasContainer.clientWidth;
    const h = this.canvasContainer.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    const { cols, rows } = this.grid.bounds();
    const worldW = cols + 2.0;
    const worldH = rows + 2.0;
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

  // ─── Pointer / Tool application ──────────────────────────────────────
  private onPointer = (e: PointerEvent) => {
    e.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const worldX = this.camera.left + ((ndcX + 1) / 2) * (this.camera.right - this.camera.left);
    const worldY = this.camera.bottom + ((ndcY + 1) / 2) * (this.camera.top - this.camera.bottom);
    const { col, row } = this.grid.worldToCell(worldX, worldY);
    if (!this.grid.inBounds(col, row)) return;
    this.applyTool(col, row);
  };

  private applyTool(c: number, r: number) {
    switch (this.activeTool) {
      case 'pixel':
        this.removeShooterAt(c, r);
        this.working.cells[r][c] = 'pixel';
        this.working.pixels[r][c] = this.activeColor;
        break;
      case 'void':
        this.removeShooterAt(c, r);
        this.working.cells[r][c] = 'void';
        this.working.pixels[r][c] = null;
        break;
      case 'erase':
        this.removeShooterAt(c, r);
        this.working.cells[r][c] = 'arena';
        this.working.pixels[r][c] = null;
        break;
      case 'shooter': {
        const existing = this.working.shooters.find(
          (s) => s.col === c && s.row === r,
        );
        if (existing) {
          existing.color = this.activeColor;
          existing.shootsPerSecond = this.rateValue;
          // Leave ammo as-is; Distribute is the source of truth for ammo.
        } else {
          this.working.cells[r][c] = 'arena';
          this.working.pixels[r][c] = null;
          const id = `s-${Math.random().toString(36).slice(2, 8)}`;
          const def: ShooterDef = {
            id,
            col: c,
            row: r,
            color: this.activeColor,
            ammo: 0,
            shootsPerSecond: this.rateValue,
          };
          this.working.shooters.push(def);
        }
        break;
      }
      case 'weld': {
        this.applyWeldTool(c, r);
        break;
      }
    }
    this.rebuildScene();
    if (this.activeTool !== 'weld') this.setStatus(TOOL_HINTS[this.activeTool]);
  }

  private applyWeldTool(c: number, r: number) {
    const sh = this.working.shooters.find((s) => s.col === c && s.row === r);
    if (!sh) {
      this.weldStartId = null;
      this.setStatus('Weld: pick a shooter first.');
      return;
    }
    if (!this.weldStartId) {
      this.weldStartId = sh.id;
      this.setStatus('Weld started. Tap an adjacent shooter to complete (or tap this one again to cancel).');
      return;
    }
    if (this.weldStartId === sh.id) {
      this.weldStartId = null;
      this.setStatus('Weld cancelled.');
      return;
    }
    const a = this.working.shooters.find((s) => s.id === this.weldStartId);
    if (!a) {
      this.weldStartId = null;
      return;
    }
    const adjacent = Math.abs(a.col - sh.col) + Math.abs(a.row - sh.row) === 1;
    if (!adjacent) {
      this.weldStartId = null;
      this.setStatus('Weld needs 4-adjacent shooters. Cancelled.');
      return;
    }
    const existing = this.working.welds.find(
      (w) =>
        (w.a === a.id && w.b === sh.id) || (w.a === sh.id && w.b === a.id),
    );
    if (existing) {
      this.working.welds = this.working.welds.filter((w) => w !== existing);
      this.setStatus(`Unwelded ${a.id} ↔ ${sh.id}.`);
    } else {
      this.working.welds.push({ a: a.id, b: sh.id });
      this.setStatus(`Welded ${a.id} ↔ ${sh.id}.`);
    }
    this.weldStartId = null;
  }

  private removeShooterAt(c: number, r: number) {
    const removed = this.working.shooters.filter((s) => s.col === c && s.row === r);
    if (removed.length === 0) return;
    const removedIds = new Set(removed.map((s) => s.id));
    this.working.shooters = this.working.shooters.filter(
      (s) => !removedIds.has(s.id),
    );
    this.working.welds = this.working.welds.filter(
      (w) => !removedIds.has(w.a) && !removedIds.has(w.b),
    );
  }

  // ─── UI rendering ────────────────────────────────────────────────────
  private renderToolbar() {
    this.toolbarEl.innerHTML = '';

    const tools: Tool[] = ['pixel', 'shooter', 'weld', 'erase', 'void'];
    for (const t of tools) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn' + (this.activeTool === t ? ' active' : '');
      btn.textContent = TOOL_LABELS[t];
      btn.onclick = () => {
        this.activeTool = t;
        this.weldStartId = null;
        this.setStatus(TOOL_HINTS[t]);
        this.renderToolbar();
      };
      this.toolbarEl.appendChild(btn);
    }

    // Color picker (also bound to number keys 1-6)
    const colorRow = document.createElement('div');
    colorRow.className = 'color-row';
    ALL_COLORS.forEach((c, i) => {
      const dot = document.createElement('div');
      dot.className = 'color-dot' + (this.activeColor === c ? ' active' : '');
      dot.style.background = COLOR_CSS[c];
      dot.title = `${c} (${i + 1})`;
      dot.textContent = String(i + 1);
      dot.style.color = 'rgba(0,0,0,0.55)';
      dot.style.fontSize = '11px';
      dot.style.fontWeight = '700';
      dot.style.display = 'flex';
      dot.style.alignItems = 'center';
      dot.style.justifyContent = 'center';
      dot.onclick = () => {
        this.activeColor = c;
        this.renderToolbar();
      };
      colorRow.appendChild(dot);
    });
    this.toolbarEl.appendChild(colorRow);

    // Spacer + exit
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.toolbarEl.appendChild(spacer);

    const exitBtn = document.createElement('button');
    exitBtn.className = 'tool-btn';
    exitBtn.textContent = '← Menu';
    exitBtn.onclick = () => this.opts.onExit();
    this.toolbarEl.appendChild(exitBtn);
  }

  private renderBottom() {
    this.bottomEl.innerHTML = '';

    this.bottomEl.appendChild(
      makeField('Name', this.working.name, 'wide', (v) => {
        this.working.name = v;
      }),
    );
    this.bottomEl.appendChild(
      makeNumberField('Cols', this.working.cols, 3, 12, (v) => {
        this.resizeGrid(v, this.working.rows);
      }),
    );
    this.bottomEl.appendChild(
      makeNumberField('Rows', this.working.rows, 3, 14, (v) => {
        this.resizeGrid(this.working.cols, v);
      }),
    );
    this.bottomEl.appendChild(
      makeNumberField('Time', this.working.timeLimit, 5, 600, (v) => {
        this.working.timeLimit = v;
      }),
    );
    this.bottomEl.appendChild(
      makeFloatField('Rate', this.rateValue, 0.2, 20, (v) => {
        this.rateValue = v;
      }),
    );

    const buttons = [
      { label: '⚖ Distribute', cls: 'btn small', fn: () => this.distribute() },
      { label: '▶ Test', cls: 'btn ghost small', fn: () => this.test() },
      { label: '💾 Save', cls: 'btn ghost small', fn: () => this.save() },
      { label: '↓ Download', cls: 'btn ghost small', fn: () => this.download() },
      { label: '{ } Copy JSON', cls: 'btn ghost small', fn: () => this.openJsonModal() },
    ];
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = b.cls;
      el.textContent = b.label;
      el.onclick = b.fn;
      this.bottomEl.appendChild(el);
    }
  }

  private resizeGrid(cols: number, rows: number) {
    cols = Math.max(2, Math.min(20, cols | 0));
    rows = Math.max(2, Math.min(20, rows | 0));
    const newCells: CellKind[][] = [];
    const newPixels: (ColorKey | null)[][] = [];
    for (let r = 0; r < rows; r++) {
      const cellRow: CellKind[] = [];
      const pixRow: (ColorKey | null)[] = [];
      for (let c = 0; c < cols; c++) {
        if (r < this.working.rows && c < this.working.cols) {
          cellRow.push(this.working.cells[r][c]);
          pixRow.push(this.working.pixels[r][c]);
        } else {
          cellRow.push('arena');
          pixRow.push(null);
        }
      }
      newCells.push(cellRow);
      newPixels.push(pixRow);
    }
    this.working.cols = cols;
    this.working.rows = rows;
    this.working.cells = newCells;
    this.working.pixels = newPixels;
    // Clip shooters outside new bounds
    const inBounds = (s: ShooterDef) => s.col >= 0 && s.col < cols && s.row >= 0 && s.row < rows;
    const removedIds = new Set(this.working.shooters.filter((s) => !inBounds(s)).map((s) => s.id));
    this.working.shooters = this.working.shooters.filter(inBounds);
    this.working.welds = this.working.welds.filter(
      (w) => !removedIds.has(w.a) && !removedIds.has(w.b),
    );
    this.rebuildScene();
  }

  // ─── Buttons ─────────────────────────────────────────────────────────
  private distribute() {
    // Sub-pixel count per color (each macro pixel cell = 9 sub-pixels, 1:1 with bullets)
    const pixelCounts = new Map<ColorKey, number>();
    for (let r = 0; r < this.working.rows; r++) {
      for (let c = 0; c < this.working.cols; c++) {
        if (this.working.cells[r][c] !== 'pixel') continue;
        const col = this.working.pixels[r][c]!;
        pixelCounts.set(col, (pixelCounts.get(col) ?? 0) + 9);
      }
    }

    // Group shooters by color
    const byColor = new Map<ColorKey, ShooterDef[]>();
    for (const s of this.working.shooters) {
      const arr = byColor.get(s.color) ?? [];
      arr.push(s);
      byColor.set(s.color, arr);
    }

    // Sanity: every color with pixels needs at least one shooter
    const missing: ColorKey[] = [];
    for (const [color, count] of pixelCounts) {
      if (count > 0 && !(byColor.get(color)?.length)) missing.push(color);
    }
    if (missing.length > 0) {
      this.flashStatus(
        `Distribute failed — no shooter for: ${missing.join(', ')}. Add one or remove those pixels.`,
      );
      return;
    }

    // Wipe all ammo
    for (const s of this.working.shooters) s.ammo = 0;

    // Distribute per color, as evenly as possible (remainder spreads from the first shooter)
    const summary: string[] = [];
    for (const [color, shooters] of byColor) {
      const total = pixelCounts.get(color) ?? 0;
      if (total === 0) {
        summary.push(`${color}: 0`);
        continue;
      }
      const n = shooters.length;
      const base = Math.floor(total / n);
      const remainder = total - base * n;
      for (let i = 0; i < n; i++) {
        shooters[i].ammo = base + (i < remainder ? 1 : 0);
      }
      summary.push(`${color}: ${total}→[${shooters.map((s) => s.ammo).join(',')}]`);
    }

    this.rebuildScene();
    this.flashStatus(`Distributed. ${summary.join(' · ')}`);
  }

  private test() {
    this.opts.onTestPlay(cloneLevel(this.working));
  }

  private save() {
    this.working = ensureCustomId(this.working);
    saveCustomLevel(cloneLevel(this.working));
    this.flashStatus(`Saved to your levels: "${this.working.name}".`);
  }

  private download() {
    const json = JSON.stringify(this.working, null, 2);
    const slug =
      (this.working.name || this.working.id || 'level')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'level';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.flashStatus(`Downloaded — drop into src/levels/contributed/ to ship it.`);
  }

  private openJsonModal() {
    this.closeModal();
    const json = JSON.stringify(this.working, null, 2);
    const modal = document.createElement('div');
    modal.className = 'modal';
    const card = document.createElement('div');
    card.className = 'modal-card';
    card.innerHTML = '<h2>Level JSON</h2><p>Copy this to share or save as a .json file.</p>';
    const ta = document.createElement('textarea');
    ta.className = 'json';
    ta.value = json;
    card.appendChild(ta);
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const copy = document.createElement('button');
    copy.className = 'btn';
    copy.textContent = 'Copy';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(json);
        copy.textContent = 'Copied!';
        setTimeout(() => (copy.textContent = 'Copy'), 1500);
      } catch {
        ta.select();
      }
    };
    const close = document.createElement('button');
    close.className = 'btn ghost';
    close.textContent = 'Close';
    close.onclick = () => this.closeModal();
    actions.appendChild(close);
    actions.appendChild(copy);
    card.appendChild(actions);
    modal.appendChild(card);
    this.parent.appendChild(modal);
    this.modalEl = modal;
  }

  private closeModal() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  private setStatus(msg: string) {
    this.statusEl.textContent = msg;
    this.statusEl.classList.remove('flash');
    if (this.statusTimeout != null) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }
  }

  private flashStatus(msg: string) {
    this.statusEl.textContent = msg;
    this.statusEl.classList.add('flash');
    if (this.statusTimeout != null) clearTimeout(this.statusTimeout);
    this.statusTimeout = window.setTimeout(() => {
      this.statusEl.classList.remove('flash');
      this.setStatus(TOOL_HINTS[this.activeTool]);
    }, 2200);
  }

  private onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const idx = '123456'.indexOf(e.key);
    if (idx >= 0 && idx < ALL_COLORS.length) {
      this.activeColor = ALL_COLORS[idx];
      this.renderToolbar();
      e.preventDefault();
    }
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKeyDownBound);
    this.resizeObserver.disconnect();
    if (this.statusTimeout != null) clearTimeout(this.statusTimeout);
    this.closeModal();
    if (this.weldLines) this.weldLines.dispose();
    for (const s of this.shooters) s.dispose();
    if (this.grid) this.grid.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.wrap.remove();
  }
}

function makeField(
  label: string,
  value: string,
  cls: string,
  onChange: (v: string) => void,
): HTMLDivElement {
  const w = document.createElement('div');
  w.className = 'editor-field';
  const lab = document.createElement('span');
  lab.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'text';
  if (cls) inp.classList.add(cls);
  inp.value = value;
  inp.oninput = () => onChange(inp.value);
  w.appendChild(lab);
  w.appendChild(inp);
  return w;
}

function makeNumberField(
  label: string,
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
): HTMLDivElement {
  const w = document.createElement('div');
  w.className = 'editor-field';
  const lab = document.createElement('span');
  lab.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.min = String(min);
  inp.max = String(max);
  inp.value = String(value);
  inp.onchange = () => {
    const v = Math.max(min, Math.min(max, parseInt(inp.value, 10) || min));
    inp.value = String(v);
    onChange(v);
  };
  w.appendChild(lab);
  w.appendChild(inp);
  return w;
}

function makeFloatField(
  label: string,
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
): HTMLDivElement {
  const w = document.createElement('div');
  w.className = 'editor-field';
  const lab = document.createElement('span');
  lab.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = '0.1';
  inp.min = String(min);
  inp.max = String(max);
  inp.value = String(value);
  inp.onchange = () => {
    const v = Math.max(min, Math.min(max, parseFloat(inp.value) || min));
    inp.value = String(v);
    onChange(v);
  };
  w.appendChild(lab);
  w.appendChild(inp);
  return w;
}

