import type Phaser from 'phaser';

/**
 * Unified input, read by gameplay scenes every frame.
 * Desktop: WASD/arrows, mouse aim, hold left click to fire, right click or Q for coffee,
 * Space to dash, E to talk/enter, H to call the professor.
 * Touch: left thumb is a floating joystick; buttons on the right; firing is automatic
 * with auto-aim (handled by the Arena).
 */
export type Action = 'coffee' | 'dash' | 'interact' | 'help' | 'overlay' | 'pause';
export interface TouchButton { id: Action; x: number; y: number; r: number; visible: boolean }

const KEYMAP: Record<string, Action> = {
  KeyQ: 'coffee', Space: 'dash', KeyE: 'interact', Enter: 'interact', KeyH: 'help', KeyM: 'overlay', Escape: 'pause', KeyP: 'pause',
};

class InputSystem {
  game: Phaser.Game | null = null;
  keys = new Set<string>();
  pressed = new Set<Action>();
  aim = { x: 240, y: 135 };
  fireHeld = false;
  touchMode = false;
  enabled = true;
  joystick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  buttons: TouchButton[] = [];
  /** Scripted movement for tests (overrides keys/joystick when set). */
  scripted: { x: number; y: number } | null = null;
  private onAnyGesture: (() => void)[] = [];

  init(game: Phaser.Game): void {
    this.game = game;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) { this.pressed.add(a); if (e.code === 'Space') e.preventDefault(); }
      this.gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; });
    const canvas = game.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousemove', (e) => { this.aim = this.toGame(e.clientX, e.clientY); });
    canvas.addEventListener('mousedown', (e) => {
      this.touchMode = false;
      this.aim = this.toGame(e.clientX, e.clientY);
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) this.pressed.add('coffee');
      this.gesture();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; });
    canvas.addEventListener('touchstart', (e) => {
      this.touchMode = true;
      this.gesture();
      for (const t of Array.from(e.changedTouches)) {
        const p = this.toGame(t.clientX, t.clientY);
        const b = this.buttons.find((b) => b.visible && Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 6);
        if (b) { this.pressed.add(b.id); continue; }
        if (!this.joystick.active && p.x < 240) {
          Object.assign(this.joystick, { active: true, id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y });
        }
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joystick.id) {
        const p = this.toGame(t.clientX, t.clientY);
        this.joystick.x = p.x; this.joystick.y = p.y;
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joystick.id) { this.joystick.active = false; this.joystick.id = -1; }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  onGesture(fn: () => void): void { this.onAnyGesture.push(fn); }
  private gesture(): void { for (const f of this.onAnyGesture) f(); }

  toGame(cx: number, cy: number): { x: number; y: number } {
    const r = this.game!.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * 480, y: ((cy - r.top) / r.height) * 270 };
  }

  /** Movement vector, length <= 1. */
  move(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    if (this.scripted) return this.scripted;
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (this.joystick.active) {
      const dx = this.joystick.x - this.joystick.ox, dy = this.joystick.y - this.joystick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 3) { const m = Math.min(1, d / 28); x = (dx / d) * m; y = (dy / d) * m; }
      return { x, y };
    }
    const d = Math.hypot(x, y);
    return d > 0 ? { x: x / d, y: y / d } : { x: 0, y: 0 };
  }

  consume(a: Action): boolean {
    if (!this.pressed.has(a)) return false;
    this.pressed.delete(a);
    return this.enabled || a === 'pause';
  }
  press(a: Action): void { this.pressed.add(a); }
  clear(): void { this.pressed.clear(); this.fireHeld = false; }
}

export const Input = new InputSystem();
