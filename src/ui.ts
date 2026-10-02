import Phaser from 'phaser';
import { Audio } from './systems/Audio';

/** Logical resolution is 480x270; the canvas renders at RENDER_SCALE x that so text stays crisp. */
export const W = 480;
export const H = 270;
export const RENDER_SCALE = 2;
export const FONT = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

export const COLORS = {
  bg: '#181425', panel: '#262b44', panel2: '#3a4466', text: '#ffffff', dim: '#8b9bb4', accent: '#feae34',
  red: '#e43b44', green: '#63c74d', blue: '#0099db', cyan: '#2ce8f5', purple: '#b55088',
};
export const NUM = (c: string): number => parseInt(c.slice(1), 16);

export function setupCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  cam.centerOn(W / 2, H / 2);
  return cam;
}

export interface TextOpts { size?: number; color?: string; align?: 'left' | 'center' | 'right'; wrap?: number; bold?: boolean; bg?: string; origin?: [number, number] }

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${o.size ?? 8}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: o.color ?? COLORS.text,
    align: o.align ?? 'left',
    backgroundColor: o.bg,
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
    resolution: RENDER_SCALE,
  });
  if (o.origin) t.setOrigin(o.origin[0], o.origin[1]);
  return t;
}

export interface Button { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; setLabel(s: string): void; setEnabled(e: boolean): void; destroy(): void }

export function button(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, color = COLORS.panel2): Button {
  const bg = scene.add.rectangle(x, y, w, h, NUM(color)).setStrokeStyle(1, NUM(COLORS.accent)).setInteractive({ useHandCursor: true });
  const lt = txt(scene, x, y, label, { size: 8, align: 'center', origin: [0.5, 0.5], wrap: w - 4 });
  let enabled = true;
  bg.on('pointerover', () => enabled && bg.setFillStyle(NUM(COLORS.panel)));
  bg.on('pointerout', () => bg.setFillStyle(NUM(color)));
  bg.on('pointerup', () => { if (!enabled) return; Audio.play('select'); onClick(); });
  return {
    bg, label: lt,
    setLabel(s: string) { lt.setText(s); },
    setEnabled(e: boolean) { enabled = e; bg.setAlpha(e ? 1 : 0.4); lt.setAlpha(e ? 1 : 0.5); },
    destroy() { bg.destroy(); lt.destroy(); },
  };
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = COLORS.panel, stroke = COLORS.panel2): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, NUM(fill)).setOrigin(0, 0).setStrokeStyle(1, NUM(stroke));
}

/** Small floating text that rises and fades (damage numbers, pickups). */
export function floatText(scene: Phaser.Scene, x: number, y: number, s: string, color = COLORS.text, size = 7): void {
  const t = txt(scene, x, y, s, { size, color, origin: [0.5, 1], bold: true }).setDepth(5000);
  t.setStroke('#181425', 2);
  scene.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}
