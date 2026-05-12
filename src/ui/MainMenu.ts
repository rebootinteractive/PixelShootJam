import type { LevelData } from '../shared/types';
import { ALL_LEVELS, BUILTIN_LEVELS } from '../levels';
import { deleteCustomLevel, loadCustomLevels } from './storage';

interface MainMenuCallbacks {
  onPlay: (level: LevelData) => void;
  onOpenEditor: (level?: LevelData) => void;
}

export class MainMenu {
  private root: HTMLDivElement;
  private cb: MainMenuCallbacks;

  constructor(parent: HTMLElement, cb: MainMenuCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'menu';
    parent.appendChild(this.root);
    this.render();
  }

  private render() {
    this.root.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'PixelShootJam';
    this.root.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'menu-sub';
    sub.textContent = 'Place shooters. Clear the pixel wall. Beat the clock.';
    this.root.appendChild(sub);

    // Built-in + contributed levels
    const levelsLabel = document.createElement('div');
    levelsLabel.className = 'menu-section-label';
    levelsLabel.textContent = 'Levels';
    this.root.appendChild(levelsLabel);

    const list = document.createElement('div');
    list.className = 'level-list';
    this.root.appendChild(list);
    for (const lv of ALL_LEVELS) {
      list.appendChild(this.makeLevelCard(lv, false));
    }

    // Custom levels
    const customs = loadCustomLevels();
    const customsLabel = document.createElement('div');
    customsLabel.className = 'menu-section-label';
    customsLabel.textContent = `Your Levels${customs.length ? ` (${customs.length})` : ''}`;
    this.root.appendChild(customsLabel);

    if (customs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.textContent = 'No custom levels yet — create one in the editor.';
      this.root.appendChild(empty);
    } else {
      const customList = document.createElement('div');
      customList.className = 'level-list';
      this.root.appendChild(customList);
      for (const lv of customs) {
        customList.appendChild(this.makeLevelCard(lv, true));
      }
    }

    // Footer: create new level
    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    const newBtn = document.createElement('button');
    newBtn.className = 'btn';
    newBtn.style.width = '100%';
    newBtn.textContent = '+ Create New Level';
    newBtn.onclick = () => this.cb.onOpenEditor();
    footer.appendChild(newBtn);
    this.root.appendChild(footer);
  }

  private makeLevelCard(lv: LevelData, isCustom: boolean): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'level-card';
    card.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.delete, .edit')) return;
      this.cb.onPlay(lv);
    };

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = lv.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const totalAmmo = lv.shooters.reduce((s, sh) => s + sh.ammo, 0);
    meta.textContent = `${lv.cols}×${lv.rows} • ${lv.shooters.length} shooters • ${totalAmmo} bullets • ${lv.timeLimit}s`;
    left.appendChild(name);
    left.appendChild(meta);
    card.appendChild(left);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '4px';

    if (isCustom) {
      const editBtn = document.createElement('button');
      editBtn.className = 'edit';
      editBtn.textContent = '✎';
      editBtn.title = 'Edit';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.cb.onOpenEditor(lv);
      };
      const delBtn = document.createElement('button');
      delBtn.className = 'delete';
      delBtn.textContent = '×';
      delBtn.title = 'Delete';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete level "${lv.name}"?`)) {
          deleteCustomLevel(lv.id);
          this.render();
        }
      };
      right.appendChild(editBtn);
      right.appendChild(delBtn);
    } else if (BUILTIN_LEVELS.includes(lv)) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Built-in';
      right.appendChild(badge);
    }
    card.appendChild(right);
    return card;
  }

  dispose() {
    this.root.remove();
  }
}
