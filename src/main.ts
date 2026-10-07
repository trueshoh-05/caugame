import Phaser from 'phaser';
import { W, H, RENDER_SCALE } from './ui';
import { Input } from './systems/Input';
import { Audio } from './systems/Audio';
import { installDebug } from './debug';
import { BootScene } from './scenes/Boot';
import { PreloadScene } from './scenes/Preload';
import { MenuScene } from './scenes/Menu';
import { CampusScene } from './scenes/Campus';
import { ArenaScene } from './scenes/Arena';
import { ArenaTsScene } from './scenes/ArenaTs';
import { Core, initCore } from './core/Core';
import { DialogScene } from './scenes/Dialog';
import { HUDScene } from './scenes/HUD';
import { QuestCardScene } from './scenes/QuestCard';
import { ResultsScene } from './scenes/Results';
import { TranscriptScene } from './scenes/Transcript';

function start(): void {
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W * RENDER_SCALE,
  height: H * RENDER_SCALE,
  backgroundColor: '#181425',
  pixelArt: true,
  roundPixels: true,
  input: { activePointers: 4 },
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60 },
  // The arena fight runs in the C++ core when it loaded; otherwise the TypeScript fallback.
  scene: [BootScene, PreloadScene, MenuScene, CampusScene, Core.active ? ArenaScene : ArenaTsScene, HUDScene, DialogScene, QuestCardScene, ResultsScene, TranscriptScene],
});

game.events.once(Phaser.Core.Events.READY, () => {
  Input.init(game);
  Input.onGesture(() => Audio.unlock());
  installDebug(game);
});
}

void initCore().then(start);
