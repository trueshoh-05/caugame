import Phaser from 'phaser';
import { AssetRegistry } from '../systems/AssetRegistry';
import { buildCampus } from '../systems/MapBuilder';
import { raw, pick, t } from '../systems/Language';
import { COLORS, H, W, setupCamera, txt } from '../ui';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }
  preload(): void {
    setupCamera(this);
    txt(this, W / 2, H / 2 - 10, t('ui.loading'), { size: 10, color: COLORS.accent, origin: [0.5, 0.5] });
    txt(this, W / 2, H / 2 + 14, pick(raw<string[]>('loadingTips')), { size: 8, color: COLORS.dim, origin: [0.5, 0.5], wrap: 380, align: 'center' });
    AssetRegistry.queueFiles(this);
    // Debug overlay of the official plan (dev builds only; the file is not shipped).
    if (import.meta.env.DEV) this.load.image('plan_overlay', 'reference/campus_plan_rotated.png');
  }
  create(): void {
    // Paint the campus once, after the tip has been on screen for a frame.
    this.time.delayedCall(30, () => {
      buildCampus(this);
      this.time.delayedCall(600, () => this.scene.start('Menu'));
    });
  }
}
