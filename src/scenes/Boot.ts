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
    // Wait briefly for the Cyrillic/Uzbek-capable webfont; fall back to system monospace offline.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts ? Promise.all([fonts.load("8px 'Noto Sans Mono'", 'Aaʻ Яя'), fonts.load("bold 8px 'Noto Sans Mono'", 'Aaʻ Яя')]).catch(() => null) : Promise.resolve(null);
    let started = false;
    const go = () => { if (!started) { started = true; this.scene.start('Preload'); } };
    void ready.then(go);
    this.time.delayedCall(700, go);
  }
}
