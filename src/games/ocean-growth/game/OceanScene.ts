import Phaser from "phaser";
import {
  CLASSIC_GOAL_MASS,
  EVOLUTION_STAGES,
  INITIAL_PLAYER_MASS,
  RUSH_GOAL_MASS,
  canEat,
  difficultyForSeconds,
  evolutionStageForLevel,
  evolutionStageForMass,
  hasCompletedGrowthGoal,
  isDangerous,
  massAfterEating,
  massForLevel,
  pickEnemyLevel,
  pointsForPrey,
  scaleForMass,
  stageProgressForMass,
} from "../core/rules";
import type {
  OceanGameHooks,
  OceanDeathCause,
  OceanGameMode,
  OceanGameStatus,
  OceanSnapshot,
} from "./types";

export const OCEAN_SCENE_KEY = "OceanGrowthScene";

const ASSET_ROOT = "/assets/ocean-growth";
const BACKGROUND_TEXTURE = "ocean-current-pattern";
const CHUNK_SIZE = 720;
const CHUNK_RADIUS = 2;
const COMBO_WINDOW_MS = 2_700;
const PLAYER_SPEED = 285;
const RUSH_DURATION_SECONDS = 90;
const MAX_ACTIVE_MINES = 2;
const MINE_SPAWN_CHANCE = 0.45;

type EnemyFish = Phaser.Physics.Arcade.Image;
type SeaMine = Phaser.Physics.Arcade.Image;
type FishRelationship = "prey" | "danger";

export class OceanScene extends Phaser.Scene {
  private readonly hooks: OceanGameHooks;
  private readonly mode: OceanGameMode;
  private player!: Phaser.Physics.Arcade.Image;
  private fishGroup!: Phaser.Physics.Arcade.Group;
  private mineGroup!: Phaser.Physics.Arcade.Group;
  private background!: Phaser.GameObjects.TileSprite;
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
  private deathCause: OceanDeathCause = null;
  private startedAt = 0;
  private lastEatAt = 0;
  private invulnerableUntil = 0;
  private lastSecond = -1;
  private nextSpawnAt = 0;
  private nextMineSpawnAt = 0;
  private schoolId = 0;
  private lastChunkX = Number.NaN;
  private lastChunkY = Number.NaN;
  private readonly chunks = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(mode: OceanGameMode, hooks: OceanGameHooks) {
    super({ key: OCEAN_SCENE_KEY });
    this.mode = mode;
    this.hooks = hooks;
  }

  preload() {
    for (const stage of EVOLUTION_STAGES) {
      this.load.image(stage.texture, `${ASSET_ROOT}/${stage.texture}.png`);
    }
    this.load.image("bubble", `${ASSET_ROOT}/bubble.png`);
    this.load.image("sea-mine", `${ASSET_ROOT}/sea-mine.png`);
  }

  create() {
    this.resetRunState();
    this.createBackgroundTexture();

    const { width, height } = this.scale;
    this.physics.world.setBounds(-1_000_000, -1_000_000, 2_000_000, 2_000_000);
    this.background = this.add
      .tileSprite(0, 0, width, height, BACKGROUND_TEXTURE)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100);

    this.fishGroup = this.physics.add.group();
    this.mineGroup = this.physics.add.group();
    const initialStage = evolutionStageForMass(this.mass);
    this.player = this.physics.add
      .image(0, 0, initialStage.texture)
      .setDepth(10)
      .setScale(initialStage.renderScale);
    this.configureBody(this.player);

    this.cameras.main
      .startFollow(this.player, true, 0.075, 0.075)
      .setDeadzone(Math.min(170, width * 0.28), Math.min(110, height * 0.22))
      .setRoundPixels(true);
    this.target.set(0, 0);

    this.syncWorldChunks(true);
    this.spawnSchool(true, Math.max(1, initialStage.level - 1));
    this.spawnSchool(true, initialStage.level);
    this.spawnSchool(true, Math.min(EVOLUTION_STAGES.length, initialStage.level + 1));

    this.physics.add.overlap(
      this.player,
      this.fishGroup,
      this.handleOverlap,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.mineGroup,
      this.handleMineOverlap,
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
      this.chunks.clear();
    });

    const snapshot = this.getSnapshot();
    this.hooks.onReady(snapshot);
    this.hooks.onSnapshot(snapshot);
  }

  update(time: number, delta: number) {
    if (this.status !== "running") return;

    this.updatePlayer(time);
    this.updateEnemies(delta);
    this.updateMines(delta);
    this.updateWorldView();
    this.updateSpawning(time);
    this.updateMineSpawning(time);
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

  private resetRunState() {
    this.mass = INITIAL_PLAYER_MASS;
    this.score = 0;
    this.lives = this.mode === "rush" ? 2 : 3;
    this.combo = 0;
    this.status = "running";
    this.deathCause = null;
    this.startedAt = this.time.now;
    this.lastEatAt = 0;
    this.lastSecond = -1;
    this.nextSpawnAt = this.time.now + 900;
    this.nextMineSpawnAt = this.time.now + Phaser.Math.Between(14_000, 22_000);
    this.pointerActive = false;
    this.schoolId = 0;
    this.lastChunkX = Number.NaN;
    this.lastChunkY = Number.NaN;
    this.chunks.clear();
  }

  private createBackgroundTexture() {
    if (this.textures.exists(BACKGROUND_TEXTURE)) return;

    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x0b6d84, 1).fillRect(0, 0, 512, 512);
    graphics.fillStyle(0x1591a2, 0.16).fillTriangle(0, 0, 180, 0, 62, 512);
    graphics.fillStyle(0x72cfca, 0.08).fillTriangle(250, 0, 410, 0, 345, 512);
    graphics.lineStyle(2, 0xb9eee3, 0.08);
    for (let index = 0; index < 7; index += 1) {
      graphics.strokeCircle(46 + index * 73, 78 + (index % 3) * 132, 12 + (index % 2) * 5);
    }
    graphics.generateTexture(BACKGROUND_TEXTURE, 512, 512);
    graphics.destroy();
  }

  private handlePointer(pointer: Phaser.Input.Pointer) {
    this.target.set(pointer.worldX, pointer.worldY);
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
    } else if (this.pointerActive && time - this.lastPointerAt < 4_500) {
      desired.set(this.target.x - this.player.x, this.target.y - this.player.y);
      const distance = desired.length();
      if (distance > 14) {
        desired.normalize().scale(Math.min(PLAYER_SPEED, distance * 2.6));
      } else {
        desired.set(0, 0);
      }
    }

    body.velocity.lerp(desired, 0.11);
    if (Math.abs(body.velocity.x) > 8) {
      this.player.setFlipX(body.velocity.x < 0);
    }
    this.player.setRotation(Phaser.Math.Clamp(body.velocity.y / 1_600, -0.18, 0.18));
  }

  private updateEnemies(delta: number) {
    const seconds = delta / 1_000;
    const despawnDistance = Math.hypot(this.scale.width / 2, this.scale.height / 2) + 320;

    for (const child of [...this.fishGroup.getChildren()]) {
      const enemy = child as EnemyFish;
      if (!enemy.active) continue;

      const marker = enemy.getData("marker") as Phaser.GameObjects.Arc;
      const relationship = enemy.getData("relationship") as FishRelationship;
      const speed = enemy.getData("speed") as number;
      const phase = (enemy.getData("phase") as number) + seconds * 1.55;
      const heading = new Phaser.Math.Vector2(
        enemy.getData("headingX") as number,
        enemy.getData("headingY") as number,
      );
      const toPlayer = new Phaser.Math.Vector2(this.player.x - enemy.x, this.player.y - enemy.y);
      const playerDistance = toPlayer.length();

      if (relationship === "prey" && playerDistance < 210) {
        heading.lerp(toPlayer.normalize().negate(), 0.035).normalize();
      }

      enemy.setData({ headingX: heading.x, headingY: heading.y, phase });
      enemy.x += heading.x * speed * seconds;
      enemy.y += (heading.y * speed + Math.sin(phase) * 18) * seconds;
      enemy.setFlipX(heading.x < 0);
      enemy.setRotation(Phaser.Math.Clamp(heading.y * 0.22, -0.2, 0.2));
      marker.setPosition(enemy.x, enemy.y - enemy.displayHeight * 0.58 - 7);

      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) > despawnDistance) {
        this.removeEnemy(enemy);
      }
    }
  }

  private updateMines(delta: number) {
    const seconds = delta / 1_000;
    const despawnDistance = Math.hypot(this.scale.width / 2, this.scale.height / 2) + 520;

    for (const child of [...this.mineGroup.getChildren()]) {
      const mine = child as SeaMine;
      if (!mine.active || mine.getData("triggered")) continue;

      const phase = (mine.getData("phase") as number) + seconds * 0.8;
      mine.setData("phase", phase);
      mine.x += (mine.getData("driftX") as number) * seconds;
      mine.y += ((mine.getData("driftY") as number) + Math.sin(phase) * 5) * seconds;
      mine.rotation += seconds * 0.2;

      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, mine.x, mine.y) > despawnDistance) {
        mine.destroy();
      }
    }
  }

  private updateWorldView() {
    const camera = this.cameras.main;
    this.background.tilePositionX = camera.scrollX * 0.18;
    this.background.tilePositionY = camera.scrollY * 0.12;
    this.syncWorldChunks(false);
  }

  private updateSpawning(time: number) {
    if (time < this.nextSpawnAt) return;

    if (this.fishGroup.countActive(true) < this.maxActiveFish) {
      this.spawnSchool(false);
    }

    const difficulty = difficultyForSeconds((time - this.startedAt) / 1_000);
    this.nextSpawnAt = time + Phaser.Math.Between(900, Math.round(1_500 - difficulty * 200));
  }

  private updateMineSpawning(time: number) {
    if (time < this.nextMineSpawnAt) return;

    this.nextMineSpawnAt = time + Phaser.Math.Between(12_000, 22_000);
    if (this.mineGroup.countActive(true) >= MAX_ACTIVE_MINES || Math.random() > MINE_SPAWN_CHANCE) {
      return;
    }

    this.spawnMine();
  }

  private updateClock(time: number) {
    const elapsed = Math.max(0, Math.floor((time - this.startedAt) / 1_000));
    if (elapsed === this.lastSecond) return;
    this.lastSecond = elapsed;

    if (this.mode === "rush" && elapsed >= RUSH_DURATION_SECONDS) {
      this.deathCause = "timeout";
      this.finish("gameover");
      return;
    }

    this.emitSnapshot();
  }

  private spawnSchool(initial: boolean, forcedLevel?: number) {
    if (!this.fishGroup || this.fishGroup.countActive(true) >= this.maxActiveFish) return;

    const playerStage = evolutionStageForMass(this.mass);
    const enemyLevel = forcedLevel ?? pickEnemyLevel(playerStage.level);
    const relationship = this.relationshipForLevel(enemyLevel);
    const remaining = this.maxActiveFish - this.fishGroup.countActive(true);
    const schoolSize = Math.min(
      remaining,
      relationship === "prey" ? Phaser.Math.Between(2, 3) : 1,
    );
    const placement = initial ? this.pickInitialSchoolPosition() : this.pickIncomingSchoolPosition();
    const school = ++this.schoolId;

    for (let index = 0; index < schoolSize; index += 1) {
      this.spawnEnemy(
        placement.x + Phaser.Math.Between(-48, 48),
        placement.y + Phaser.Math.Between(-38, 38),
        enemyLevel,
        placement.direction + Phaser.Math.FloatBetween(-0.08, 0.08),
        school,
      );
    }
  }

  private spawnMine() {
    const placement = this.pickIncomingSchoolPosition();
    const driftSpeed = Phaser.Math.FloatBetween(13, 20);
    const mine = this.mineGroup.create(placement.x, placement.y, "sea-mine") as SeaMine;
    mine
      .setDepth(8)
      .setScale(0.28)
      .setRotation(Phaser.Math.FloatBetween(-Math.PI, Math.PI))
      .setData({
        driftX: Math.cos(placement.direction) * driftSpeed,
        driftY: Math.sin(placement.direction) * driftSpeed,
        phase: Math.random() * Math.PI * 2,
        triggered: false,
      });
    const body = mine.body as Phaser.Physics.Arcade.Body;
    body.setSize(mine.width * 0.7, mine.height * 0.86, true);
  }

  private pickInitialSchoolPosition() {
    const radiusX = Math.max(155, this.scale.width * 0.3);
    const radiusY = Math.max(175, this.scale.height * 0.32);
    const angle = (this.schoolId / 3) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.22, 0.22);
    return {
      x: this.player.x + Math.cos(angle) * radiusX,
      y: this.player.y + Math.sin(angle) * radiusY,
      direction: Phaser.Math.Angle.Between(
        0,
        0,
        -Math.sin(angle) * radiusX,
        Math.cos(angle) * radiusY,
      ) + Phaser.Math.FloatBetween(-0.12, 0.12),
    };
  }

  private pickIncomingSchoolPosition() {
    const halfWidth = this.scale.width / 2;
    const halfHeight = this.scale.height / 2;
    const margin = 135;
    const side = Phaser.Math.Between(0, 3);
    let x: number;
    let y: number;

    if (side === 0 || side === 1) {
      x = this.player.x + (side === 0 ? -halfWidth - margin : halfWidth + margin);
      y = this.player.y + Phaser.Math.FloatBetween(-halfHeight * 0.72, halfHeight * 0.72);
    } else {
      x = this.player.x + Phaser.Math.FloatBetween(-halfWidth * 0.72, halfWidth * 0.72);
      y = this.player.y + (side === 2 ? -halfHeight - margin : halfHeight + margin);
    }

    const passByX = this.player.x + Phaser.Math.FloatBetween(-halfWidth * 0.34, halfWidth * 0.34);
    const passByY = this.player.y + Phaser.Math.FloatBetween(-halfHeight * 0.32, halfHeight * 0.32);
    return {
      x,
      y,
      direction: Phaser.Math.Angle.Between(x, y, passByX, passByY),
    };
  }

  private spawnEnemy(
    x: number,
    y: number,
    level: number,
    directionAngle: number,
    school: number,
  ) {
    const stage = evolutionStageForLevel(level);
    const enemyMass = massForLevel(level);
    const relationship = this.relationshipForLevel(level);
    const difficulty = difficultyForSeconds((this.time.now - this.startedAt) / 1_000);
    const speedMultiplier = this.mode === "rush" ? 1.14 : 1;
    const baseSpeed = relationship === "danger" ? 104 : 84;
    const speed = (baseSpeed + Math.random() * 34 + difficulty * 38) * speedMultiplier;
    const enemy = this.fishGroup.create(x, y, stage.texture) as EnemyFish;
    const marker = this.createRelationshipMarker(x, y, relationship);

    enemy
      .setScale(stage.renderScale * Phaser.Math.FloatBetween(0.97, 1.03))
      .setFlipX(Math.cos(directionAngle) < 0)
      .setData({
        mass: enemyMass,
        level,
        relationship,
        headingX: Math.cos(directionAngle),
        headingY: Math.sin(directionAngle) * 0.38,
        speed,
        phase: Math.random() * Math.PI * 2,
        consumed: false,
        retreatUntil: 0,
        marker,
        school,
      });
    this.configureBody(enemy);
  }

  private createRelationshipMarker(x: number, y: number, relationship: FishRelationship) {
    const marker = this.add.circle(x, y, relationship === "danger" ? 4 : 3).setDepth(9);
    this.styleRelationshipMarker(marker, relationship);
    return marker;
  }

  private styleRelationshipMarker(marker: Phaser.GameObjects.Arc, relationship: FishRelationship) {
    if (relationship === "prey") {
      marker.setFillStyle(0xd9f45c, 0.9).setStrokeStyle();
    } else if (relationship === "danger") {
      marker.setFillStyle(0xff765e, 0.95).setStrokeStyle(2, 0xffffff, 0.5);
    }
  }

  private relationshipForLevel(level: number): FishRelationship {
    const playerLevel = evolutionStageForMass(this.mass).level;
    return level <= playerLevel ? "prey" : "danger";
  }

  private refreshRelationships() {
    for (const child of this.fishGroup.getChildren()) {
      const enemy = child as EnemyFish;
      const relationship = this.relationshipForLevel(enemy.getData("level") as number);
      const marker = enemy.getData("marker") as Phaser.GameObjects.Arc;
      enemy.setData("relationship", relationship);
      this.styleRelationshipMarker(marker, relationship);
    }
  }

  private configureBody(fish: Phaser.Physics.Arcade.Image) {
    const body = fish.body as Phaser.Physics.Arcade.Body;
    body.setSize(fish.width * 0.68, fish.height * 0.52, true);
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
      if (this.time.now < ((enemy.getData("retreatUntil") as number | undefined) ?? 0)) {
        return;
      }
      this.takeDamage(enemy);
      return;
    }
  };

  private handleMineOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _playerObject,
    targetObject,
  ) => {
    const mine = targetObject as SeaMine;
    if (!mine.active || mine.getData("triggered") || this.status !== "running") return;

    mine.setData("triggered", true).setTint(0xff765e);
    this.lives = 0;
    this.combo = 0;
    this.deathCause = "mine";
    this.player.setTint(0xff765e);
    this.cameras.main.shake(320, 0.026);
    this.createMineBurst(mine.x, mine.y);
    this.finish("gameover");
  };

  private consumeEnemy(enemy: EnemyFish, enemyMass: number) {
    const x = enemy.x;
    const y = enemy.y;
    const previousStage = evolutionStageForMass(this.mass);
    this.removeEnemy(enemy, true);
    this.combo = this.time.now - this.lastEatAt <= COMBO_WINDOW_MS ? this.combo + 1 : 1;
    this.lastEatAt = this.time.now;
    this.score += pointsForPrey(this.mass, enemyMass, this.combo);
    this.mass = massAfterEating(this.mass, enemyMass);
    this.createEatBurst(x, y);

    const nextStage = evolutionStageForMass(this.mass);
    if (nextStage.level !== previousStage.level) {
      this.evolvePlayer(nextStage);
    } else {
      this.tweens.add({
        targets: this.player,
        scaleX: scaleForMass(this.mass) * 1.08,
        scaleY: scaleForMass(this.mass) * 0.94,
        yoyo: true,
        duration: 110,
        ease: "Sine.Out",
      });
    }

    if (hasCompletedGrowthGoal(this.mode, this.mass)) {
      this.finish("won");
      return;
    }

    this.nextSpawnAt = Math.min(this.nextSpawnAt, this.time.now + 650);
    this.emitSnapshot();
  }

  private evolvePlayer(stage: (typeof EVOLUTION_STAGES)[number]) {
    const previousTexture = this.player.texture.key;
    const previousScale = this.player.scaleX;
    const previousFlip = this.player.flipX;
    const ghost = this.add
      .image(this.player.x, this.player.y, previousTexture)
      .setDepth(9)
      .setFlipX(previousFlip)
      .setScale(previousScale);

    this.player
      .setTexture(stage.texture)
      .setScale(stage.renderScale * 0.64)
      .setAlpha(0.15);
    this.configureBody(this.player);
    this.refreshRelationships();
    this.createEvolutionBurst();
    this.tweens.add({
      targets: ghost,
      scaleX: previousScale * 1.28,
      scaleY: previousScale * 1.28,
      alpha: 0,
      duration: 260,
      ease: "Cubic.Out",
      onComplete: () => ghost.destroy(),
    });
    this.tweens.add({
      targets: this.player,
      scaleX: stage.renderScale,
      scaleY: stage.renderScale,
      alpha: 1,
      duration: 340,
      ease: "Back.Out",
    });

    const label = this.add
      .text(this.player.x, this.player.y - 62, `进化 · ${stage.name}`, {
        color: "#f4ffb1",
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: "18px",
        fontStyle: "bold",
        stroke: "#0a252c",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: label,
      y: label.y - 34,
      alpha: 0,
      duration: 1_250,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });
  }

  private takeDamage(enemy: EnemyFish) {
    if (this.time.now < this.invulnerableUntil) return;
    this.invulnerableUntil = this.time.now + 1_850;
    this.lives -= 1;
    this.cameras.main.shake(200, 0.012);
    this.player.setTint(0xff8c7c);
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      yoyo: true,
      repeat: 4,
      duration: 105,
      onComplete: () => {
        this.player.clearTint().setAlpha(1);
      },
    });

    const enemyRetreat = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y)
      .normalize();
    enemy.setData({
      headingX: enemyRetreat.x,
      headingY: enemyRetreat.y,
      retreatUntil: this.time.now + 4_500,
    });
    enemy.x += enemyRetreat.x * 42;
    enemy.y += enemyRetreat.y * 42;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.velocity.set(this.player.x - enemy.x, this.player.y - enemy.y).normalize().scale(260);

    if (this.lives <= 0) {
      this.deathCause = "predator";
      this.finish("gameover");
      return;
    }

    this.emitSnapshot();
  }

  private removeEnemy(enemy: EnemyFish, hide = false) {
    const marker = enemy.getData("marker") as Phaser.GameObjects.Arc | undefined;
    marker?.destroy();
    enemy.setData("marker", undefined);
    if (hide) enemy.disableBody(true, true);
    enemy.destroy();
  }

  private createEatBurst(x: number, y: number) {
    for (let index = 0; index < 5; index += 1) {
      const bubble = this.add
        .image(x, y, "bubble")
        .setDepth(20)
        .setScale(0.16 + Math.random() * 0.2)
        .setAlpha(0.72);
      this.tweens.add({
        targets: bubble,
        x: x + Phaser.Math.Between(-42, 42),
        y: y - Phaser.Math.Between(28, 76),
        alpha: 0,
        duration: 440 + Math.random() * 260,
        onComplete: () => bubble.destroy(),
      });
    }
  }

  private createEvolutionBurst() {
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const bubble = this.add
        .image(this.player.x, this.player.y, "bubble")
        .setDepth(20)
        .setScale(0.13 + Math.random() * 0.13)
        .setAlpha(0.8);
      this.tweens.add({
        targets: bubble,
        x: bubble.x + Math.cos(angle) * Phaser.Math.Between(48, 84),
        y: bubble.y + Math.sin(angle) * Phaser.Math.Between(32, 62),
        alpha: 0,
        duration: 460 + Math.random() * 220,
        ease: "Cubic.Out",
        onComplete: () => bubble.destroy(),
      });
    }
  }

  private createMineBurst(x: number, y: number) {
    const blast = this.add
      .circle(x, y, 18, 0xff765e, 0.9)
      .setStrokeStyle(5, 0xd9f45c, 0.8)
      .setDepth(25);
    this.tweens.add({
      targets: blast,
      scale: 7,
      alpha: 0,
      duration: 460,
      ease: "Cubic.Out",
      onComplete: () => blast.destroy(),
    });

    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const bubble = this.add
        .image(x, y, "bubble")
        .setDepth(26)
        .setTint(index % 2 === 0 ? 0xff765e : 0xd9f45c)
        .setScale(0.16 + Math.random() * 0.16);
      this.tweens.add({
        targets: bubble,
        x: x + Math.cos(angle) * Phaser.Math.Between(48, 96),
        y: y + Math.sin(angle) * Phaser.Math.Between(40, 82),
        alpha: 0,
        duration: 420 + Math.random() * 220,
        ease: "Cubic.Out",
        onComplete: () => bubble.destroy(),
      });
    }
  }

  private syncWorldChunks(force: boolean) {
    const chunkX = Math.floor(this.player.x / CHUNK_SIZE);
    const chunkY = Math.floor(this.player.y / CHUNK_SIZE);
    if (!force && chunkX === this.lastChunkX && chunkY === this.lastChunkY) return;
    this.lastChunkX = chunkX;
    this.lastChunkY = chunkY;

    const expected = new Set<string>();
    for (let offsetY = -CHUNK_RADIUS; offsetY <= CHUNK_RADIUS; offsetY += 1) {
      for (let offsetX = -CHUNK_RADIUS; offsetX <= CHUNK_RADIUS; offsetX += 1) {
        const targetX = chunkX + offsetX;
        const targetY = chunkY + offsetY;
        const key = `${targetX}:${targetY}`;
        expected.add(key);
        if (!this.chunks.has(key)) {
          this.chunks.set(key, this.createWorldChunk(targetX, targetY));
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!expected.has(key)) {
        chunk.destroy();
        this.chunks.delete(key);
      }
    }
  }

  private createWorldChunk(chunkX: number, chunkY: number) {
    const random = this.seededRandom(chunkX, chunkY);
    const graphics = this.add
      .graphics()
      .setPosition(chunkX * CHUNK_SIZE, chunkY * CHUNK_SIZE)
      .setDepth(-20);

    graphics.lineStyle(2, 0xb9eee3, 0.16);
    for (let index = 0; index < 9; index += 1) {
      const x = random() * CHUNK_SIZE;
      const y = random() * CHUNK_SIZE;
      const radius = 3 + random() * 8;
      graphics.strokeCircle(x, y, radius);
    }

    const reefCount = 1 + Math.floor(random() * 3);
    for (let reef = 0; reef < reefCount; reef += 1) {
      const x = 70 + random() * (CHUNK_SIZE - 140);
      const y = 90 + random() * (CHUNK_SIZE - 180);
      graphics.fillStyle(0x074e61, 0.26);
      graphics.fillEllipse(x, y + 22, 100 + random() * 90, 42 + random() * 28);
      graphics.fillStyle(0x68c3b0, 0.2);
      for (let frond = 0; frond < 4; frond += 1) {
        const frondX = x - 34 + frond * 23 + random() * 8;
        const height = 34 + random() * 58;
        graphics.fillTriangle(frondX - 8, y + 12, frondX + 7, y + 12, frondX, y - height);
      }
      graphics.fillStyle(0xff765e, 0.18);
      graphics.fillCircle(x + 24, y - 4, 8 + random() * 8);
    }
    return graphics;
  }

  private seededRandom(chunkX: number, chunkY: number) {
    let seed = (Math.imul(chunkX, 374_761_393) ^ Math.imul(chunkY, 668_265_263)) >>> 0;
    return () => {
      seed = Math.imul(seed ^ (seed >>> 13), 1_274_126_177) >>> 0;
      return seed / 4_294_967_295;
    };
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.cameras.main.setDeadzone(
      Math.min(170, gameSize.width * 0.28),
      Math.min(110, gameSize.height * 0.22),
    );
  }

  private finish(status: "won" | "gameover") {
    if (this.status === "won" || this.status === "gameover") return;
    this.status = status;
    this.physics.pause();
    this.emitSnapshot();
  }

  private get maxActiveFish() {
    const base = this.scale.width < 620 ? 9 : 11;
    return this.mode === "rush" ? base + 2 : base;
  }

  private get goalMass() {
    return this.mode === "rush" ? RUSH_GOAL_MASS : CLASSIC_GOAL_MASS;
  }

  private getSnapshot(): OceanSnapshot {
    const elapsed = Math.max(0, Math.floor((this.time.now - this.startedAt) / 1_000));
    const stage = evolutionStageForMass(this.mass);
    return {
      score: this.score,
      mass: this.mass,
      goalMass: this.goalMass,
      level: stage.level,
      species: stage.name,
      stageProgress: stageProgressForMass(this.mass),
      lives: this.lives,
      combo: this.combo,
      timeLeft: this.mode === "rush" ? Math.max(0, RUSH_DURATION_SECONDS - elapsed) : null,
      status: this.status,
      deathCause: this.deathCause,
    };
  }

  private emitSnapshot() {
    this.hooks.onSnapshot(this.getSnapshot());
  }
}
