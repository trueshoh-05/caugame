import Phaser from 'phaser';
import { balance, type EnemyDef } from '../systems/Data';

/** A paper enemy. Pooled: spawn() re-initialises a recycled instance. */
export class Paper extends Phaser.GameObjects.Sprite {
  kind = 'quiz';
  def!: EnemyDef;
  hp = 10;
  maxHp = 10;
  soggy = 0;
  soggyMult = 1;
  shotTimer = 0;
  jitter = 0;
  flash = 0;
  r = 6;
  vx = 0;
  vy = 0;
  spawnT = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, -100, -100, 'quiz_code');
    scene.add.existing(this);
    this.setActive(false).setVisible(false);
  }

  spawn(kind: string, skin: string, x: number, y: number, hpOverride?: number): this {
    this.kind = kind;
    this.def = balance.enemies[kind];
    this.hp = this.maxHp = hpOverride ?? this.def.hp;
    this.soggy = 0; this.soggyMult = 1; this.flash = 0; this.vx = 0; this.vy = 0;
    this.shotTimer = (this.def.shot?.everySeconds ?? 2) * (0.5 + Math.random() * 0.5);
    this.jitter = Math.random() * Math.PI * 2;
    this.spawnT = 0.35;
    this.setTexture(`${kind}_${skin}`).setPosition(x, y).setActive(true).setVisible(true).setAlpha(1).clearTint().setScale(0.2).setAngle(0);
    this.setOrigin(0.5, 0.5);
    this.r = Math.max(this.width, this.height) * 0.38;
    return this;
  }

  kill(): void { this.setActive(false).setVisible(false).setPosition(-100, -100); }
}
