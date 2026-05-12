interface HudCallbacks {
  onRestart: () => void;
  onMenu: () => void;
  menuLabel?: string;
}

export class Hud {
  private root: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private modalEl: HTMLDivElement | null = null;
  private cb: HudCallbacks;

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);

    const top = document.createElement('div');
    top.className = 'hud-top';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn ghost small';
    menuBtn.textContent = cb.menuLabel ?? '← Menu';
    menuBtn.onclick = () => cb.onMenu();
    top.appendChild(menuBtn);

    this.timerEl = document.createElement('div');
    this.timerEl.className = 'hud-timer';
    this.timerEl.textContent = '0:00';
    top.appendChild(this.timerEl);

    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn ghost small';
    restartBtn.textContent = '↻';
    restartBtn.title = 'Restart';
    restartBtn.onclick = () => cb.onRestart();
    top.appendChild(restartBtn);

    this.root.appendChild(top);

    const bottom = document.createElement('div');
    bottom.className = 'hud-bottom';
    this.root.appendChild(bottom);
  }

  setTime(seconds: number) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    this.timerEl.textContent = `${m}:${sec.toString().padStart(2, '0')}`;
    this.timerEl.classList.remove('warn', 'danger');
    if (s <= 5) this.timerEl.classList.add('danger');
    else if (s <= 15) this.timerEl.classList.add('warn');
  }

  showWin() {
    this.showEndgame('win', 'You Cleared It!', 'All pixels are gone.');
  }

  showLose() {
    this.showEndgame('lose', 'Out of Time', 'The wall is still standing.');
  }

  hideModal() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  private showEndgame(kind: 'win' | 'lose', title: string, sub: string) {
    this.hideModal();
    const modal = document.createElement('div');
    modal.className = 'modal';
    const card = document.createElement('div');
    card.className = `modal-card endgame ${kind}`;
    card.innerHTML = `<h1>${title}</h1><p>${sub}</p>`;
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.textContent = 'Restart';
    retry.onclick = () => {
      this.hideModal();
      this.cb.onRestart();
    };
    const menu = document.createElement('button');
    menu.className = 'btn ghost';
    menu.textContent = this.cb.menuLabel ?? 'Menu';
    menu.onclick = () => this.cb.onMenu();
    actions.appendChild(menu);
    actions.appendChild(retry);
    card.appendChild(actions);
    modal.appendChild(card);
    this.root.appendChild(modal);
    this.modalEl = modal;
  }

  dispose() {
    this.hideModal();
    this.root.remove();
  }
}
