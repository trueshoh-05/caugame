import Phaser from 'phaser';
import { balance } from '../systems/Data';
import { Input } from '../systems/Input';
import { Audio } from '../systems/Audio';

const P = balance.player;

/** The student. Same class on campus and in arenas; arenas add weapons on top. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  speedMult = 1;
  dashTimer = 0;
  dashCooldown = 0;
  invuln = 0;
  facing = 1;
  private walkT = 0;
  private dashDir = { x: 0, y: 1 };
  shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 7).setOffset(3, 17);
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.3).setOrigin(0.5, 0.6);
  }

  /** Centre of the torso, used for hit tests and as the gun muzzle. */
  get cx(): number { return this.x; }
  get cy(): number { return this.y - 11; }

  canDash = true;

  updateMove(dt: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const mv = Input.move();
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.canDash && Input.consume('dash') && this.dashCooldown <= 0) {
      const len = Math.hypot(mv.x, mv.y);
      this.dashDir = len > 0.1 ? { x: mv.x / len, y: mv.y / len } : { x: this.facing, y: 0 };
      this.dashTimer = P.dash.invulnerable;
      this.dashCooldown = P.dash.cooldown;
      this.invuln = Math.max(this.invuln, P.dash.invulnerable);
      Audio.play('dash');
    }
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const v = P.dash.distance / P.dash.invulnerable;
      body.setVelocity(this.dashDir.x * v, this.dashDir.y * v);
      this.setAlpha(0.6);
    } else {
      const sp = P.speed * this.speedMult;
      body.setVelocity(mv.x * sp, mv.y * sp);
      this.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 20) % 2 ? 0.4 : 1) : 1);
    }
    const moving = Math.hypot(body.velocity.x, body.velocity.y) > 5;
    if (moving) {
      this.walkT += dt;
      this.setTexture(Math.floor(this.walkT * 8) % 2 ? 'player_1' : 'player_0');
      if (Math.abs(body.velocity.x) > 5) this.facing = body.velocity.x > 0 ? 1 : -1;
    } else this.setTexture('player_0');
    this.setFlipX(this.facing < 0);
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
  }

  destroy(fromScene?: boolean): void { this.shadow?.destroy(); super.destroy(fromScene); }
}
