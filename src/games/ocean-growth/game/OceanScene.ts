import Phaser from "phaser";
import {
  CLASSIC_GOAL_MASS,
  DEPTH_ZONE_HEIGHT,
  EVOLUTION_STAGES,
  INITIAL_PLAYER_MASS,
  PRESSURE_GRACE_SECONDS,
  RUSH_GOAL_MASS,
  abyssThreatForSeconds,
  canEat,
  depthMetersForWorldY,
  depthZoneNameForLevel,
  difficultyForSeconds,
  evolutionStageForLevel,
  evolutionStageForMass,
  hasCompletedGrowthGoal,
  isDangerous,
  massAfterEating,
  massForLevel,
  maxMinesForSeconds,
  mineSpawnChanceForSeconds,
  pickEnemyLevelForDepth,
  pointsForPrey,
  requiredLevelForDepth,
  requiredLevelForSeconds,
  scaleForMass,
  stageProgressForMass,
  threatTierForSeconds,
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
const SONAR_DURATION_MS = 10_000;
const FRENZY_DURATION_MS = 8_000;
const BEACON_DURATION_MS = 14_000;
const CURRENT_GATE_RADIUS = 112;
const DEPTH_ENTRY_GRACE_MS = 2_000;
const DEPTH_DAMAGE_INTERVAL_MS = 4_000;

type EnemyFish = Phaser.Physics.Arcade.Image;
type SeaMine = Phaser.Physics.Arcade.Image;
type OceanPickup = Phaser.Physics.Arcade.Image;
type CurrentGate = Phaser.GameObjects.Image;
type PositionedObject = Phaser.GameObjects.GameObject & { active: boolean; x: number; y: number };
type FishRelationship = "prey" | "danger";
type PickupKind = "shield" | "sonar" | "frenzy";
type SonarCategory = "prey" | "danger" | "mine" | "beacon";

export class OceanScene extends Phaser.Scene {
  private readonly hooks: OceanGameHooks;
  private readonly mode: OceanGameMode;
  private player!: Phaser.Physics.Arcade.Image;
  private fishGroup!: Phaser.Physics.Arcade.Group;
  private mineGroup!: Phaser.Physics.Arcade.Group;
  private pickupGroup!: Phaser.Physics.Arcade.Group;
  private currentGateGroup!: Phaser.GameObjects.Group;
  private beacon: Phaser.GameObjects.Image | null = null;
  private readonly sonarIndicators = new Map<SonarCategory, Phaser.GameObjects.Triangle>();
  private background!: Phaser.GameObjects.TileSprite;
  private depthShade!: Phaser.GameObjects.Rectangle;
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
  private shieldCharges = 0;
  private sonarUntil = 0;
  private frenzyUntil = 0;
  private pressureDeadlineAt: number | null = null;
  private nextDepthDamageAt: number | null = null;
  private lastDepthLevel = 1;
  private lastEvent: string | null = null;
  private lastEventUntil = 0;
  private lastSecond = -1;
  private nextSpawnAt = 0;
  private nextMineSpawnAt = 0;
  private nextPickupSpawnAt = 0;
  private nextCurrentGateSpawnAt = 0;
  private nextBeaconSpawnAt = 0;
  private beaconExpiresAt = 0;
  private nextBeaconPulseAt = 0;
  private pickupCycleIndex = 0;
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
    this.load.image("pickup-shield", `${ASSET_ROOT}/pickup-shield.png`);
    this.load.image("pickup-sonar", `${ASSET_ROOT}/pickup-sonar.png`);
    this.load.image("pickup-frenzy", `${ASSET_ROOT}/pickup-frenzy.png`);
    this.load.image("current-gate", `${ASSET_ROOT}/current-gate.png`);
    this.load.image("bait-beacon", `${ASSET_ROOT}/bait-beacon.png`);
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
    this.depthShade = this.add
      .rectangle(0, 0, width, height, 0x03162e, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(5);

    this.fishGroup = this.physics.add.group();
    this.mineGroup = this.physics.add.group();
    this.pickupGroup = this.physics.add.group();
    this.currentGateGroup = this.add.group();
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
    this.spawnCurrentGate(true);

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
    this.physics.add.overlap(
      this.player,
      this.pickupGroup,
      this.handlePickupOverlap,
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
      this.clearSonarIndicators();
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
    this.updatePickups(delta);
    this.updateCurrentGates(time, delta);
    this.updateBeacon(time);
    this.updateSonar(time);
    this.updateWorldView();
    this.updateSpawning(time);
    this.updateMineSpawning(time);
    this.updatePickupSpawning(time);
    this.updateClock(time);

    if (this.combo > 0 && time - this.lastEatAt > this.comboWindowMs) {
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
    this.invulnerableUntil = 0;
    this.shieldCharges = 0;
    this.sonarUntil = 0;
    this.frenzyUntil = 0;
    this.pressureDeadlineAt = null;
    this.nextDepthDamageAt = null;
    this.lastDepthLevel = 1;
    this.lastEvent = null;
    this.lastEventUntil = 0;
    this.lastSecond = -1;
    this.nextSpawnAt = this.time.now + 900;
    this.nextMineSpawnAt = this.time.now + Phaser.Math.Between(14_000, 22_000);
    this.nextPickupSpawnAt = this.time.now + 2_800;
    this.nextCurrentGateSpawnAt = this.time.now + 12_000;
    this.nextBeaconSpawnAt = this.time.now + 16_000;
    this.beaconExpiresAt = 0;
    this.nextBeaconPulseAt = 0;
    this.pickupCycleIndex = 0;
    this.beacon = null;
    this.sonarIndicators.clear();
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
    const speed = PLAYER_SPEED * (time < this.frenzyUntil ? 1.35 : 1);
    if (keyboardDirection.lengthSq() > 0) {
      desired.copy(keyboardDirection).normalize().scale(speed);
      this.pointerActive = false;
    } else if (this.pointerActive && time - this.lastPointerAt < 4_500) {
      desired.set(this.target.x - this.player.x, this.target.y - this.player.y);
      const distance = desired.length();
      if (distance > 14) {
        desired.normalize().scale(Math.min(speed, distance * 2.6));
      } else {
        desired.set(0, 0);
      }
    }

    body.velocity.lerp(desired, 0.11);
    const current = this.currentVectorAt(this.player.x, this.player.y);
    body.velocity.add(current);
    if (Math.abs(body.velocity.x) > 8) {
      this.player.setFlipX(body.velocity.x < 0);
    }
    this.player.setRotation(Phaser.Math.Clamp(body.velocity.y / 1_600, -0.18, 0.18));
  }

  private updateEnemies(delta: number) {
    const seconds = delta / 1_000;
    const elapsed = (this.time.now - this.startedAt) / 1_000;
    const threat = abyssThreatForSeconds(elapsed);
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
      const enemyLevel = enemy.getData("level") as number;
      const playerLevel = evolutionStageForMass(this.mass).level;
      let trackingPlayer = false;

      if (enemyLevel > 1) {
        const shallowBoundary = (enemyLevel - 1) * DEPTH_ZONE_HEIGHT;
        if (enemy.y < shallowBoundary + 54) {
          heading.y = Math.max(0.34, Math.abs(heading.y));
          heading.normalize();
        }
      }

      if (relationship === "prey" && playerDistance < 210) {
        heading.lerp(toPlayer.normalize().negate(), 0.035).normalize();
      } else if (
        relationship === "danger" &&
        this.time.now >= ((enemy.getData("retreatUntil") as number | undefined) ?? 0) &&
        playerDistance < 140 + threat * 260 + Math.max(0, enemyLevel - playerLevel) * 36
      ) {
        heading.lerp(toPlayer.normalize(), 0.008 + threat * 0.022).normalize();
        trackingPlayer = true;
      }

      if (this.beacon?.active && !trackingPlayer) {
        const toBeacon = new Phaser.Math.Vector2(this.beacon.x - enemy.x, this.beacon.y - enemy.y);
        if (toBeacon.length() < 560) {
          heading.lerp(toBeacon.normalize(), relationship === "danger" ? 0.026 : 0.017).normalize();
        }
      }

      enemy.setData({ headingX: heading.x, headingY: heading.y, phase });
      const dangerSpeed = relationship === "danger" ? 1 + threat * 0.55 : 1;
      const current = this.currentVectorAt(enemy.x, enemy.y);
      enemy.x += (heading.x * speed * dangerSpeed + current.x) * seconds;
      enemy.y += (heading.y * speed * dangerSpeed + Math.sin(phase) * 18 + current.y) * seconds;
      if (enemyLevel > 1) {
        enemy.y = Math.max(enemy.y, (enemyLevel - 1) * DEPTH_ZONE_HEIGHT);
      }
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
    const threat = abyssThreatForSeconds((this.time.now - this.startedAt) / 1_000);
    const despawnDistance = Math.hypot(this.scale.width / 2, this.scale.height / 2) + 520;

    for (const child of [...this.mineGroup.getChildren()]) {
      const mine = child as SeaMine;
      if (!mine.active || mine.getData("triggered")) continue;

      const phase = (mine.getData("phase") as number) + seconds * 0.8;
      mine.setData("phase", phase);
      const current = this.currentVectorAt(mine.x, mine.y);
      const driftMultiplier = 1 + threat * 0.8;
      mine.x += ((mine.getData("driftX") as number) * driftMultiplier + current.x) * seconds;
      mine.y += (
        (mine.getData("driftY") as number) * driftMultiplier + Math.sin(phase) * 5 + current.y
      ) * seconds;
      mine.rotation += seconds * 0.2;

      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, mine.x, mine.y) > despawnDistance) {
        mine.destroy();
      }
    }
  }

  private updatePickups(delta: number) {
    const seconds = delta / 1_000;
    const despawnDistance = Math.hypot(this.scale.width / 2, this.scale.height / 2) + 620;

    for (const child of [...this.pickupGroup.getChildren()]) {
      const pickup = child as OceanPickup;
      if (!pickup.active || pickup.getData("collected")) continue;

      const phase = (pickup.getData("phase") as number) + seconds * 1.8;
      const current = this.currentVectorAt(pickup.x, pickup.y);
      pickup.setData("phase", phase);
      pickup.x += ((pickup.getData("driftX") as number) + current.x) * seconds;
      pickup.y += ((pickup.getData("driftY") as number) + current.y) * seconds;
      pickup.setScale((pickup.getData("baseScale") as number) * (1 + Math.sin(phase) * 0.045));
      pickup.rotation += seconds * 0.12;

      if (
        Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y) >
        despawnDistance
      ) {
        pickup.destroy();
      }
    }
  }

  private updateCurrentGates(time: number, delta: number) {
    const seconds = delta / 1_000;
    for (const child of [...this.currentGateGroup.getChildren()]) {
      const gate = child as CurrentGate;
      if (!gate.active) continue;

      const phase = (gate.getData("phase") as number) + seconds * 1.5;
      gate.setData("phase", phase).setAlpha(0.66 + Math.sin(phase) * 0.14);
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, gate.x, gate.y) > 1_650) {
        gate.destroy();
      }
    }

    if (time >= this.nextCurrentGateSpawnAt && this.currentGateGroup.countActive(true) < 2) {
      this.spawnCurrentGate(false);
      this.nextCurrentGateSpawnAt = time + Phaser.Math.Between(16_000, 24_000);
    }
  }

  private updateBeacon(time: number) {
    if (this.beacon?.active && time >= this.beaconExpiresAt) {
      this.beacon.destroy();
      this.beacon = null;
      this.nextBeaconSpawnAt = time + Phaser.Math.Between(24_000, 34_000);
      this.announce("诱饵灯塔熄灭");
      this.emitSnapshot();
    }

    if (!this.beacon?.active && time >= this.nextBeaconSpawnAt) {
      this.spawnBeacon();
      return;
    }

    if (this.beacon?.active && time >= this.nextBeaconPulseAt) {
      this.spawnBeaconSchool();
      this.createBeaconPulse();
      this.nextBeaconPulseAt = time + Phaser.Math.Between(2_200, 3_000);
    }
  }

  private updateSonar(time: number) {
    if (time >= this.sonarUntil) {
      this.clearSonarIndicators();
      return;
    }

    const targets: Record<SonarCategory, PositionedObject | null> = {
      prey: this.nearestFish("prey"),
      danger: this.nearestFish("danger"),
      mine: this.nearestObject(this.mineGroup.getChildren()),
      beacon: this.beacon?.active ? this.beacon as PositionedObject : null,
    };
    const colors: Record<SonarCategory, number> = {
      prey: 0xd9f45c,
      danger: 0xff765e,
      mine: 0xffc15c,
      beacon: 0x6ee8ff,
    };
    const camera = this.cameras.main;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const radiusX = Math.max(32, centerX - 28);
    const radiusY = Math.max(32, centerY - 28);

    for (const category of Object.keys(targets) as SonarCategory[]) {
      const target = targets[category];
      let indicator = this.sonarIndicators.get(category);
      if (!target) {
        indicator?.setVisible(false);
        continue;
      }

      if (!indicator) {
        indicator = this.add
          .triangle(0, 0, -10, -7, -10, 7, 10, 0, colors[category], 0.95)
          .setStrokeStyle(2, 0x082e38, 0.85)
          .setScrollFactor(0)
          .setDepth(60);
        this.sonarIndicators.set(category, indicator);
      }

      const angle = Phaser.Math.Angle.Between(camera.midPoint.x, camera.midPoint.y, target.x, target.y);
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const edgeScale = 1 / Math.max(
        Math.abs(directionX) / radiusX,
        Math.abs(directionY) / radiusY,
      );
      indicator
        .setPosition(centerX + directionX * edgeScale, centerY + directionY * edgeScale)
        .setRotation(angle)
        .setVisible(true);
    }
  }

  private clearSonarIndicators() {
    for (const indicator of this.sonarIndicators.values()) indicator.destroy();
    this.sonarIndicators.clear();
  }

  private nearestFish(relationship: FishRelationship) {
    return this.nearestObject(
      this.fishGroup.getChildren().filter(
        (child) => (child as EnemyFish).getData("relationship") === relationship,
      ),
    );
  }

  private nearestObject(children: Phaser.GameObjects.GameObject[]): PositionedObject | null {
    let nearest: PositionedObject | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const child of children) {
      if (
        !("x" in child) ||
        !("y" in child) ||
        !("active" in child) ||
        typeof child.x !== "number" ||
        typeof child.y !== "number" ||
        !child.active
      ) continue;
      const positionedChild = child as PositionedObject;
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        positionedChild.x,
        positionedChild.y,
      );
      if (distance < nearestDistance) {
        nearest = positionedChild;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private updateWorldView() {
    const camera = this.cameras.main;
    const depthLevel = requiredLevelForDepth(this.player.y);
    const depthRatio = (depthLevel - 1) / (EVOLUTION_STAGES.length - 1);
    this.background.tilePositionX = camera.scrollX * 0.18;
    this.background.tilePositionY = camera.scrollY * 0.12;
    this.background.setTint(Phaser.Display.Color.GetColor(
      Math.round(255 - depthRatio * 125),
      Math.round(255 - depthRatio * 105),
      Math.round(255 - depthRatio * 55),
    ));
    this.depthShade.setAlpha(depthRatio * 0.38);
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

    const elapsed = (time - this.startedAt) / 1_000;
    const threat = abyssThreatForSeconds(elapsed);
    this.nextMineSpawnAt = time + Phaser.Math.Between(
      Math.round(16_000 - threat * 7_000),
      Math.round(25_000 - threat * 11_000),
    );
    const beaconBonus = this.beacon?.active ? 0.16 : 0;
    if (
      this.mineGroup.countActive(true) >= maxMinesForSeconds(elapsed) ||
      Math.random() > Math.min(0.94, mineSpawnChanceForSeconds(elapsed) + beaconBonus)
    ) {
      return;
    }

    this.spawnMine();
  }

  private updatePickupSpawning(time: number) {
    if (time < this.nextPickupSpawnAt) return;

    if (this.pickupGroup.countActive(true) < 2) this.spawnPickup();
    this.nextPickupSpawnAt = time + Phaser.Math.Between(9_000, 13_000);
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

    const playerLevel = evolutionStageForMass(this.mass).level;
    const depthLevel = requiredLevelForDepth(this.player.y);
    if (depthLevel !== this.lastDepthLevel) {
      this.lastDepthLevel = depthLevel;
      this.announce(`进入${depthZoneNameForLevel(depthLevel)} · 安全等级 LV.${depthLevel}`);
    }

    if (playerLevel < depthLevel) {
      if (this.nextDepthDamageAt === null) {
        this.nextDepthDamageAt = time + DEPTH_ENTRY_GRACE_MS;
        this.announce(`深度超限 · 请上浮或进化至 LV.${depthLevel}`);
      } else if (time >= this.nextDepthDamageAt) {
        this.nextDepthDamageAt = time + DEPTH_DAMAGE_INTERVAL_MS;
        this.takeDepthDamage(depthLevel);
        if (this.status === "gameover") return;
      }
    } else if (this.nextDepthDamageAt !== null) {
      this.nextDepthDamageAt = null;
      this.announce("已返回安全水层");
    }

    const requiredLevel = requiredLevelForSeconds(elapsed);
    if (playerLevel < requiredLevel) {
      if (this.pressureDeadlineAt === null) {
        this.pressureDeadlineAt = time + PRESSURE_GRACE_SECONDS * 1_000;
        this.announce(`海压升至 LV.${requiredLevel}`);
        this.cameras.main.flash(180, 255, 118, 94, false);
      } else if (time >= this.pressureDeadlineAt) {
        this.lives = 0;
        this.deathCause = "pressure";
        this.finish("gameover");
        return;
      }
    } else if (this.pressureDeadlineAt !== null) {
      this.pressureDeadlineAt = null;
      this.announce("已适应当前海压");
    }

    if (time >= this.lastEventUntil) this.lastEvent = null;

    this.emitSnapshot();
  }

  private takeDepthDamage(depthLevel: number) {
    this.lives -= 1;
    this.combo = 0;
    this.announce(`深水失压 · 需要 LV.${depthLevel} · 生命 -1`);
    this.cameras.main.shake(180, 0.01);
    this.cameras.main.flash(160, 45, 132, 190, false);
    this.player.setTint(0x73cde8);
    this.tweens.add({
      targets: this.player,
      alpha: 0.35,
      yoyo: true,
      repeat: 3,
      duration: 120,
      onComplete: () => this.player.clearTint().setAlpha(1),
    });

    if (this.lives <= 0) {
      this.deathCause = "depth";
      this.finish("gameover");
    }
  }

  private spawnSchool(initial: boolean, forcedLevel?: number) {
    if (!this.fishGroup || this.fishGroup.countActive(true) >= this.maxActiveFish) return;

    const playerStage = evolutionStageForMass(this.mass);
    const placement = initial ? this.pickInitialSchoolPosition() : this.pickIncomingSchoolPosition();
    const maximumLevel = Math.min(
      requiredLevelForDepth(placement.y),
      playerStage.level + 2,
    );
    const enemyLevel = forcedLevel === undefined
      ? pickEnemyLevelForDepth(playerStage.level, placement.y)
      : Phaser.Math.Clamp(forcedLevel, 1, maximumLevel);
    const relationship = this.relationshipForLevel(enemyLevel);
    const remaining = this.maxActiveFish - this.fishGroup.countActive(true);
    const preferredSchoolSize = relationship === "danger" || enemyLevel >= 8
      ? 1
      : enemyLevel >= 5
        ? Phaser.Math.Between(1, 2)
        : Phaser.Math.Between(2, 3);
    const schoolSize = Math.min(remaining, preferredSchoolSize);
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

  private spawnMine(x?: number, y?: number) {
    const placement = this.pickIncomingSchoolPosition();
    const driftSpeed = Phaser.Math.FloatBetween(13, 20);
    const mine = this.mineGroup.create(x ?? placement.x, y ?? placement.y, "sea-mine") as SeaMine;
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

  private spawnPickup() {
    const placement = this.pickIncomingSchoolPosition();
    const pickupCycle: PickupKind[] = ["shield", "sonar", "frenzy"];
    const kind = pickupCycle[this.pickupCycleIndex % pickupCycle.length];
    this.pickupCycleIndex += 1;
    const driftSpeed = Phaser.Math.FloatBetween(18, 28);
    const baseScale = 0.3;
    const pickup = this.pickupGroup.create(
      placement.x,
      placement.y,
      `pickup-${kind}`,
    ) as OceanPickup;
    pickup
      .setDepth(12)
      .setScale(baseScale)
      .setData({
        kind,
        driftX: Math.cos(placement.direction) * driftSpeed,
        driftY: Math.sin(placement.direction) * driftSpeed,
        baseScale,
        phase: Math.random() * Math.PI * 2,
        collected: false,
      });
    const body = pickup.body as Phaser.Physics.Arcade.Body;
    body.setCircle(Math.min(pickup.width, pickup.height) * 0.36, undefined, undefined);
  }

  private spawnCurrentGate(initial: boolean) {
    if (!this.currentGateGroup || this.currentGateGroup.countActive(true) >= 2) return;

    const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
    const minimumRadius = initial ? Math.max(300, Math.min(this.scale.width, this.scale.height) * 0.45) : 520;
    const radius = Phaser.Math.FloatBetween(minimumRadius, minimumRadius + 320);
    const direction = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
    const gate = this.add
      .image(
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
        "current-gate",
      )
      .setDepth(4)
      .setScale(0.72)
      .setRotation(direction)
      .setData({
        headingX: Math.cos(direction),
        headingY: Math.sin(direction),
        phase: Math.random() * Math.PI * 2,
      });
    this.currentGateGroup.add(gate);
  }

  private currentVectorAt(x: number, y: number) {
    const current = new Phaser.Math.Vector2();
    if (!this.currentGateGroup) return current;

    for (const child of this.currentGateGroup.getChildren()) {
      const gate = child as CurrentGate;
      if (!gate.active) continue;
      const distance = Phaser.Math.Distance.Between(x, y, gate.x, gate.y);
      if (distance >= CURRENT_GATE_RADIUS) continue;
      const strength = 185 * (1 - distance / CURRENT_GATE_RADIUS);
      current.x += (gate.getData("headingX") as number) * strength;
      current.y += (gate.getData("headingY") as number) * strength;
    }
    return current;
  }

  private spawnBeacon() {
    const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
    const radius = Phaser.Math.FloatBetween(
      Math.max(420, Math.min(this.scale.width, this.scale.height) * 0.58),
      Math.max(620, Math.min(this.scale.width, this.scale.height) * 0.82),
    );
    this.beacon = this.add
      .image(
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
        "bait-beacon",
      )
      .setDepth(7)
      .setScale(0.48);
    this.beaconExpiresAt = this.time.now + BEACON_DURATION_MS;
    this.nextBeaconPulseAt = this.time.now + 400;
    this.announce("诱饵灯塔已点亮");
    this.emitSnapshot();
  }

  private spawnBeaconSchool() {
    if (!this.beacon?.active || this.fishGroup.countActive(true) >= this.maxActiveFish) return;

    const playerLevel = evolutionStageForMass(this.mass).level;
    const threat = abyssThreatForSeconds((this.time.now - this.startedAt) / 1_000);
    const dangerChance = 0.2 + threat * 0.28;
    const maximumLevel = Math.min(
      requiredLevelForDepth(this.beacon.y),
      playerLevel + 2,
    );
    const level = Math.random() < dangerChance && maximumLevel > playerLevel
      ? Phaser.Math.Between(playerLevel + 1, maximumLevel)
      : pickEnemyLevelForDepth(playerLevel, this.beacon.y);
    const remaining = this.maxActiveFish - this.fishGroup.countActive(true);
    const schoolSize = Math.min(remaining, Phaser.Math.Between(2, 4));
    const school = ++this.schoolId;

    for (let index = 0; index < schoolSize; index += 1) {
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const radius = Phaser.Math.FloatBetween(180, 320);
      const spawnX = this.beacon.x + Math.cos(angle) * radius;
      const spawnY = this.beacon.y + Math.sin(angle) * radius;
      const spawnLevel = Math.min(level, requiredLevelForDepth(spawnY));
      this.spawnEnemy(
        spawnX,
        spawnY,
        spawnLevel,
        Phaser.Math.Angle.Between(
          spawnX,
          spawnY,
          this.beacon.x,
          this.beacon.y,
        ),
        school,
      );
    }

    if (
      this.mineGroup.countActive(true) < maxMinesForSeconds((this.time.now - this.startedAt) / 1_000) &&
      Math.random() < 0.1 + threat * 0.18
    ) {
      const mineAngle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      this.spawnMine(
        this.beacon.x + Math.cos(mineAngle) * Phaser.Math.Between(150, 240),
        this.beacon.y + Math.sin(mineAngle) * Phaser.Math.Between(150, 240),
      );
    }
  }

  private createBeaconPulse() {
    if (!this.beacon?.active) return;
    const pulse = this.add
      .circle(this.beacon.x, this.beacon.y, 26)
      .setStrokeStyle(3, 0x6ee8ff, 0.72)
      .setDepth(6);
    this.tweens.add({
      targets: pulse,
      scale: 5.2,
      alpha: 0,
      duration: 1_000,
      ease: "Cubic.Out",
      onComplete: () => pulse.destroy(),
    });
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

  private handlePickupOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _playerObject,
    targetObject,
  ) => {
    const pickup = targetObject as OceanPickup;
    if (!pickup.active || pickup.getData("collected") || this.status !== "running") return;

    pickup.setData("collected", true);
    const kind = pickup.getData("kind") as PickupKind;
    const x = pickup.x;
    const y = pickup.y;
    pickup.destroy();
    this.score += 175;

    if (kind === "shield") {
      this.shieldCharges = 1;
      this.announce("气泡护盾已充能");
    } else if (kind === "sonar") {
      this.sonarUntil = this.time.now + SONAR_DURATION_MS;
      this.announce("声呐已标记附近目标");
    } else {
      this.frenzyUntil = this.time.now + FRENZY_DURATION_MS;
      this.announce("狂食状态启动");
    }

    this.createPickupBurst(x, y, kind);
    this.emitSnapshot();
  };

  private handleMineOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _playerObject,
    targetObject,
  ) => {
    const mine = targetObject as SeaMine;
    if (!mine.active || mine.getData("triggered") || this.status !== "running") return;

    mine.setData("triggered", true).setTint(0xff765e);
    if (this.consumeShield(mine.x, mine.y)) {
      this.createMineBurst(mine.x, mine.y);
      mine.destroy();
      return;
    }

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
    this.combo = this.time.now - this.lastEatAt <= this.comboWindowMs ? this.combo + 1 : 1;
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
    if (this.consumeShield(enemy.x, enemy.y)) {
      this.invulnerableUntil = this.time.now + 650;
      const retreat = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y)
        .normalize();
      enemy.setData({
        headingX: retreat.x,
        headingY: retreat.y,
        retreatUntil: this.time.now + 4_500,
      });
      enemy.x += retreat.x * 54;
      enemy.y += retreat.y * 54;
      return;
    }

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

  private consumeShield(x: number, y: number) {
    if (this.shieldCharges <= 0) return false;
    this.shieldCharges = 0;
    this.combo = 0;
    this.announce("护盾已抵挡致命碰撞");
    this.cameras.main.shake(130, 0.008);
    this.createShieldBurst(x, y);
    this.emitSnapshot();
    return true;
  }

  private removeEnemy(enemy: EnemyFish, hide = false) {
    const marker = enemy.getData("marker") as Phaser.GameObjects.Arc | undefined;
    marker?.destroy();
    enemy.setData("marker", undefined);
    if (hide) enemy.disableBody(true, true);
    enemy.destroy();
  }

  private announce(message: string) {
    this.lastEvent = message;
    this.lastEventUntil = this.time.now + 2_800;
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

  private createPickupBurst(x: number, y: number, kind: PickupKind) {
    const tint = kind === "shield" ? 0x6ee8ff : kind === "sonar" ? 0xd9f45c : 0xffc15c;
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const bubble = this.add
        .image(x, y, "bubble")
        .setDepth(24)
        .setTint(tint)
        .setScale(0.14 + Math.random() * 0.12);
      this.tweens.add({
        targets: bubble,
        x: x + Math.cos(angle) * Phaser.Math.Between(32, 66),
        y: y + Math.sin(angle) * Phaser.Math.Between(28, 58),
        alpha: 0,
        duration: 480 + Math.random() * 180,
        ease: "Cubic.Out",
        onComplete: () => bubble.destroy(),
      });
    }
  }

  private createShieldBurst(x: number, y: number) {
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const bubble = this.add
        .image(this.player.x, this.player.y, "bubble")
        .setDepth(26)
        .setTint(index % 2 === 0 ? 0x6ee8ff : 0xffffff)
        .setScale(0.17 + Math.random() * 0.12);
      this.tweens.add({
        targets: bubble,
        x: this.player.x + Math.cos(angle) * Phaser.Math.Between(42, 74),
        y: this.player.y + Math.sin(angle) * Phaser.Math.Between(30, 58),
        alpha: 0,
        duration: 360 + Math.random() * 180,
        ease: "Cubic.Out",
        onComplete: () => bubble.destroy(),
      });
    }
    const impact = this.add
      .image(x, y, "bubble")
      .setDepth(27)
      .setTint(0x6ee8ff)
      .setScale(0.7);
    this.tweens.add({
      targets: impact,
      scale: 1.5,
      alpha: 0,
      duration: 260,
      onComplete: () => impact.destroy(),
    });
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
    this.depthShade?.setSize(gameSize.width, gameSize.height);
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

  private get comboWindowMs() {
    return this.time.now < this.frenzyUntil ? COMBO_WINDOW_MS * 2 : COMBO_WINDOW_MS;
  }

  private get maxActiveFish() {
    const base = this.scale.width < 620 ? 11 : 14;
    return this.mode === "rush" ? base + 2 : base;
  }

  private get goalMass() {
    return this.mode === "rush" ? RUSH_GOAL_MASS : CLASSIC_GOAL_MASS;
  }

  private getSnapshot(): OceanSnapshot {
    const elapsed = Math.max(0, Math.floor((this.time.now - this.startedAt) / 1_000));
    const stage = evolutionStageForMass(this.mass);
    const depthLevel = requiredLevelForDepth(this.player?.y ?? 0);
    return {
      score: this.score,
      mass: this.mass,
      goalMass: this.goalMass,
      level: stage.level,
      species: stage.name,
      stageProgress: stageProgressForMass(this.mass),
      lives: this.lives,
      combo: this.combo,
      shieldCharges: this.shieldCharges,
      sonarSeconds: Math.max(0, Math.ceil((this.sonarUntil - this.time.now) / 1_000)),
      frenzySeconds: Math.max(0, Math.ceil((this.frenzyUntil - this.time.now) / 1_000)),
      requiredLevel: requiredLevelForSeconds(elapsed),
      pressureSecondsLeft: this.pressureDeadlineAt === null
        ? null
        : Math.max(0, Math.ceil((this.pressureDeadlineAt - this.time.now) / 1_000)),
      threatTier: threatTierForSeconds(elapsed),
      depthMeters: depthMetersForWorldY(this.player?.y ?? 0),
      depthLevel,
      depthZone: depthZoneNameForLevel(depthLevel),
      depthDamageSeconds: this.nextDepthDamageAt === null
        ? null
        : Math.max(0, Math.ceil((this.nextDepthDamageAt - this.time.now) / 1_000)),
      lastEvent: this.lastEvent,
      timeLeft: this.mode === "rush" ? Math.max(0, RUSH_DURATION_SECONDS - elapsed) : null,
      status: this.status,
      deathCause: this.deathCause,
    };
  }

  private emitSnapshot() {
    this.hooks.onSnapshot(this.getSnapshot());
  }
}
