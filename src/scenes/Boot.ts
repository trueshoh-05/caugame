import Phaser from 'phaser';
import { AssetRegistry } from '../systems/AssetRegistry';
import { Save } from '../systems/Save';
import { setLang, t } from '../systems/Language';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void {
    setLang(Save.get().lang);
    const rt = document.getElementById('rotate-text');
    if (rt) rt.textContent = t('ui.rotateDevice');
    document.documentElement.lang = Save.get().lang;
    AssetRegistry.buildTextures(this);
    this.scene.start('Preload');
  }
}
