import Phaser from "phaser";
import {
  CLASSIC_GOAL_MASS,
  INITIAL_PLAYER_MASS,
  RUSH_GOAL_MASS,
  canEat,
  difficultyForSeconds,
  isDangerous,
  massAfterEating,
  pickEnemyMass,
  pointsForPrey,
  scaleForMass,
} from "../core/rules";
import type {
  OceanGameHooks,
  OceanGameMode,
  OceanGameStatus,
  OceanSnapshot,
} from "./types";

export const OCEAN_SCENE_KEY = "OceanGrowthScene";

const ASSET_ROOT = "/assets/ocean-growth";
const COMBO_WINDOW_MS = 2_500;
const PLAYER_SPEED = 380;

type EnemyFish = Phaser.Physics.Arcade.Image;

export class OceanScene extends Phaser.Scene {
  private readonly hooks: OceanGameHooks;
  private readonly mode: OceanGameMode;
  private player!: Phaser.Physics.Arcade.Image;
  private fishGroup!: Phaser.Physics.Arcade.Group;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private target = new Phaser.Math.Vector2();
  private pointerActive = false;
  private lastPointerAt = 0;
  private mass = INITIAL_PLAYER_MASS;
  private score = 0;
  private lives = 3;
  private combo = 0;
  private status: OceanGameStatus = "running";
  private startedAt = 0;
  private lastEatAt = 0;
  private invulnerableUntil = 0;
  private lastSecond = -1;

  constructor(mode: OceanGameMode, hooks: OceanGameHooks) {
    super({ key: OCEAN_SCENE_KEY });
    this.mode = mode;
    this.hooks = hooks;
  }

  preload() {
    this.load.image("fish-player", `${ASSET_ROOT}/fish-player.png`);
    this.load.image("fish-small", `${ASSET_ROOT}/fish-small.png`);
    this.load.image("fish-mid", `${ASSET_ROOT}/fish-mid.png`);
    this.load.image("fish-danger", `${ASSET_ROOT}/fish-danger.png`);
    this.load.image("bubble", `${ASSET_ROOT}/bubble.png`);
  }

  create() {
    this.mass = INITIAL_PLAYER_MASS;
    this.score = 0;
    this.lives = this.mode === "rush" ? 2 : 3;
    this.combo = 0;
    this.status = "running";
    this.startedAt = this.time.now;
    this.lastEatAt = 0;
    this.lastSecond = -1;
    this.pointerActive = false;

    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, height);
    this.target.set(width / 2, height / 2);

    this.createAmbientBubbles();

    this.fishGroup = this.physics.add.group();
    this.player = this.physics.add
      .image(width / 2, height / 2, "fish-player")
      .setDepth(10)
      .setScale(scaleForMass(this.mass))
      .setCollideWorldBounds(true);
    this.configureBody(this.player);

    const startingFish = this.mode === "rush" ? 18 : 15;
    for (let index = 0; index < startingFish; index += 1) {
      this.spawnEnemy(true);
    }

    this.physics.add.overlap(
      this.player,
      this.fishGroup,
      this.handleOverlap,
      undefined,
      this,
    );

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as typeof this.wasd;

    this.input.on("pointermove", this.handlePointer, this);
    this.input.on("pointerdown", this.handlePointer, this);
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });

    const snapshot = this.getSnapshot();
    this.hooks.onReady(snapshot);
    this.hooks.onSnapshot(snapshot);
  }

  update(time: number, delta: number) {
    if (this.status !== "running") return;

    this.updatePlayer(time);
    this.updateEnemies(delta);
    this.updateClock(time);

    if (this.combo > 0 && time - this.lastEatAt > COMBO_WINDOW_MS) {
      this.combo = 0;
      this.emitSnapshot();
    }
  }

  pauseByUser() {
    if (this.status !== "running") return;
    this.status = "paused";
    this.emitSnapshot();
    this.scene.pause();
  }

  resumeByUser() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.scene.resume();
    this.emitSnapshot();
  }

  private handlePointer(pointer: Phaser.Input.Pointer) {
    this.target.set(pointer.x, pointer.y);
    this.pointerActive = true;
    this.lastPointerAt = this.time.now;
  }

  private updatePlayer(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const keyboardDirection = new Phaser.Math.Vector2(
      Number(Boolean(this.cursors?.right.isDown || this.wasd?.D.isDown)) -
        Number(Boolean(this.cursors?.left.isDown || this.wasd?.A.isDown)),
      Number(Boolean(this.cursors?.down.isDown || this.wasd?.S.isDown)) -
        Number(Boolean(this.cursors?.up.isDown || this.wasd?.W.isDown)),
    );

    const desired = new Phaser.Math.Vector2();
    if (keyboardDirection.lengthSq() > 0) {
      desired.copy(keyboardDirection).normalize().scale(PLAYER_SPEED);
      this.pointerActive = false;
    } else if (this.pointerActive && time - this.lastPointerAt < 4_000) {
      desired.set(this.target.x - this.player.x, this.target.y - this.player.y);
      const distance = desired.length();
      if (distance > 12) {
        desired.normalize().scale(Math.min(PLAYER_SPEED, distance * 3.2));
      } else {
        desired.set(0, 0);
      }
    }

    body.velocity.lerp(desired, 0.12);
    if (Math.abs(body.velocity.x) > 8) {
      this.player.setFlipX(body.velocity.x < 0);
    }
    this.player.setRotation(Phaser.Math.Clamp(body.velocity.y / 1_800, -0.2, 0.2));
  }

  private updateEnemies(delta: number) {
    const seconds = delta / 1_000;
    const width = this.scale.width;
    const height = this.scale.height;

    for (const child of this.fishGroup.getChildren()) {
      const enemy = child as EnemyFish;
      const direction = enemy.getData("direction") as number;
      const speed = enemy.getData("speed") as number;
      const phase = (enemy.getData("phase") as number) + seconds * 1.7;
      const baseY = enemy.getData("baseY") as number;

      enemy.setData("phase", phase);
      enemy.x += direction * speed * seconds;
      enemy.y = Phaser.Math.Clamp(baseY + Math.sin(phase) * 17, 68, height - 58);

      if ((direction > 0 && enemy.x > width + 230) || (direction < 0 && enemy.x < -230)) {
        enemy.destroy();
        this.spawnEnemy(false);
      }
    }
  }

  private updateClock(time: number) {
    const elapsed = Math.max(0, Math.floor((time - this.startedAt) / 1_000));
    if (elapsed === this.lastSecond) return;
    this.lastSecond = elapsed;

    if (this.mode === "rush" && elapsed >= 75) {
      this.finish("gameover");
      return;
    }

    this.emitSnapshot();
  }

  private spawnEnemy(initial: boolean) {
    if (!this.fishGroup) return;

    const playerMass = this.mass;
    const enemyMass = pickEnemyMass(playerMass);
    const direction = Math.random() > 0.5 ? 1 : -1;
    const width = this.scale.width;
    const height = this.scale.height;
    const maxAvailableSafeZone = Math.max(60, width / 2 - 40);
    const safeZone = Math.min(250, Math.max(150, width * 0.24), maxAvailableSafeZone);
    const initialX = Math.random() > 0.5
      ? Phaser.Math.Between(40, Math.max(41, Math.floor(width / 2 - safeZone)))
      : Phaser.Math.Between(
          Math.min(width - 41, Math.ceil(width / 2 + safeZone)),
          Math.max(41, width - 40),
        );
    const x = initial ? initialX : direction > 0 ? -190 : width + 190;
    const baseY = Phaser.Math.Between(75, Math.max(76, height - 70));
    const elapsed = Math.max(0, (this.time.now - this.startedAt) / 1_000);
    const difficulty = difficultyForSeconds(elapsed);
    const speedMultiplier = this.mode === "rush" ? 1.22 : 1;
    const speed = (82 + Math.random() * 82 + difficulty * 95) * speedMultiplier;
    const texture = canEat(playerMass, enemyMass)
      ? "fish-small"
      : isDangerous(playerMass, enemyMass)
        ? "fish-danger"
        : "fish-mid";

    const enemy = this.fishGroup.create(x, baseY, texture) as EnemyFish;
    enemy
      .setScale(scaleForMass(enemyMass))
      .setFlipX(direction < 0)
      .setData({
        mass: enemyMass,
        direction,
        speed,
        baseY,
        phase: Math.random() * Math.PI * 2,
        consumed: false,
      });
    this.configureBody(enemy);
  }

  private configureBody(fish: Phaser.Physics.Arcade.Image) {
    const body = fish.body as Phaser.Physics.Arcade.Body;
    body.setSize(fish.width * 0.68, fish.height * 0.58, true);
  }

  private handleOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _playerObject,
    targetObject,
  ) => {
    const enemy = targetObject as EnemyFish;
    if (!enemy.active || enemy.getData("consumed")) return;

    const enemyMass = enemy.getData("mass") as number;
    if (canEat(this.mass, enemyMass)) {
      enemy.setData("consumed", true);
      this.consumeEnemy(enemy, enemyMass);
      return;
    }

    if (isDangerous(this.mass, enemyMass)) {
      this.takeDamage(enemy);
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.velocity.scale(-0.6);
  };

  private consumeEnemy(enemy: EnemyFish, enemyMass: number) {
    const x = enemy.x;
    const y = enemy.y;
    enemy.disableBody(true, true);
    this.combo = this.time.now - this.lastEatAt <= COMBO_WINDOW_MS ? this.combo + 1 : 1;
    this.lastEatAt = this.time.now;
    this.score += pointsForPrey(enemyMass, this.combo);
    this.mass = massAfterEating(this.mass, enemyMass);
    this.createEatBurst(x, y);

    const nextScale = scaleForMass(this.mass);
    this.tweens.add({
      targets: this.player,
      scaleX: nextScale,
      scaleY: nextScale,
      duration: 180,
      ease: "Back.Out",
    });

    if (this.mass >= this.goalMass) {
      this.finish("won");
      return;
    }

    this.time.delayedCall(240, () => this.spawnEnemy(false));
    this.emitSnapshot();
  }

  private takeDamage(enemy: EnemyFish) {
    if (this.time.now < this.invulnerableUntil) return;
    this.invulnerableUntil = this.time.now + 1_500;
    this.lives -= 1;
    this.cameras.main.shake(220, 0.014);
    this.player.setTint(0xff8c7c);
    this.tweens.add({
      targets: this.player,
      alpha: 0.32,
      yoyo: true,
      repeat: 4,
      duration: 120,
      onComplete: () => this.player.clearTint().setAlpha(1),
    });

    enemy.setData("direction", -(enemy.getData("direction") as number));

    if (this.lives <= 0) {
      this.finish("gameover");
      return;
    }

    this.emitSnapshot();
  }

  private createEatBurst(x: number, y: number) {
    for (let index = 0; index < 6; index += 1) {
      const bubble = this.add
        .image(x, y, "bubble")
        .setDepth(20)
        .setScale(0.25 + Math.random() * 0.28)
        .setAlpha(0.8);
      this.tweens.add({
        targets: bubble,
        x: x + Phaser.Math.Between(-55, 55),
        y: y - Phaser.Math.Between(30, 95),
        alpha: 0,
        duration: 500 + Math.random() * 300,
        onComplete: () => bubble.destroy(),
      });
    }
  }

  private createAmbientBubbles() {
    for (let index = 0; index < 12; index += 1) {
      const bubble = this.add
        .image(
          Phaser.Math.Between(20, Math.max(21, this.scale.width - 20)),
          Phaser.Math.Between(30, Math.max(31, this.scale.height - 30)),
          "bubble",
        )
        .setDepth(1)
        .setScale(0.18 + Math.random() * 0.5)
        .setAlpha(0.25 + Math.random() * 0.28);
      this.tweens.add({
        targets: bubble,
        y: -60,
        duration: 5_000 + Math.random() * 6_000,
        repeat: -1,
        delay: Math.random() * 4_000,
        onRepeat: () => {
          bubble.x = Phaser.Math.Between(20, Math.max(21, this.scale.width - 20));
          bubble.y = this.scale.height + 40;
        },
      });
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.physics.world.setBounds(0, 0, gameSize.width, gameSize.height);
    this.player.setPosition(
      Phaser.Math.Clamp(this.player.x, 30, gameSize.width - 30),
      Phaser.Math.Clamp(this.player.y, 30, gameSize.height - 30),
    );
  }

  private finish(status: "won" | "gameover") {
    if (this.status === "won" || this.status === "gameover") return;
    this.status = status;
    this.physics.pause();
    this.emitSnapshot();
  }

  private get goalMass() {
    return this.mode === "rush" ? RUSH_GOAL_MASS : CLASSIC_GOAL_MASS;
  }

  private getSnapshot(): OceanSnapshot {
    const elapsed = Math.max(0, Math.floor((this.time.now - this.startedAt) / 1_000));
    return {
      score: this.score,
      mass: this.mass,
      goalMass: this.goalMass,
      lives: this.lives,
      combo: this.combo,
      timeLeft: this.mode === "rush" ? Math.max(0, 75 - elapsed) : null,
      status: this.status,
    };
  }

  private emitSnapshot() {
    this.hooks.onSnapshot(this.getSnapshot());
  }
}
