import Phaser from "phaser";
import {
  BOSS_POWER,
  CHAPTERS,
  CHAPTER_DURATION_SECONDS,
  COURSE,
  COURSE_DISTANCE,
  GATE_PAIRS,
  INITIAL_SQUAD_POWER,
  POWER_RUN_DURATION_SECONDS,
  RUN_SPEED,
  applyGate,
  applySupply,
  canDefeatBoss,
  resolveBattle,
  resolveHazard,
  scoreForBattle,
  scoreForGate,
} from "../core/rules";
import type {
  CourseDefinition,
  EnemyKind,
  EnvironmentKind,
  GateOperator,
  GatePair,
  Lane,
} from "../core/rules";
import type {
  PowerRunHooks,
  PowerRunSnapshot,
  PowerRunStatus,
} from "./types";

export const POWER_RUN_SCENE_KEY = "PowerRunScene";

const ASSET_ROOT = "/assets/power-run";
const COURSE_VISIBILITY = 1_340;

const enemyTextures: Record<EnemyKind, string> = {
  raider: "power-run-raider",
  drone: "power-run-drone",
  brute: "power-run-brute",
  turret: "power-run-turret",
};

const environmentPalettes: Record<
  EnvironmentKind,
  { sky: number; haze: number; horizon: number; road: number; edge: number }
> = {
  coast: { sky: 0x55c9f4, haze: 0x9be5f7, horizon: 0x4695a2, road: 0x43515c, edge: 0xe64e4d },
  desert: { sky: 0x77cfea, haze: 0xf5d692, horizon: 0xbf7b43, road: 0x574f49, edge: 0xf06b42 },
  snow: { sky: 0x8fc9e4, haze: 0xe9f5f8, horizon: 0x718da0, road: 0x48545e, edge: 0x29a3cc },
  city: { sky: 0x485d78, haze: 0x73859b, horizon: 0x28384c, road: 0x303944, edge: 0xf05c54 },
  fortress: { sky: 0x743f55, haze: 0xb55b5a, horizon: 0x49283a, road: 0x292b35, edge: 0xffc94a },
};

const gateColor = (operator: GateOperator) => {
  switch (operator) {
    case "add":
      return 0x12bfe7;
    case "multiply":
      return 0x20c88b;
    case "subtract":
      return 0xf05b5d;
    case "divide":
      return 0xf39a3f;
  }
};

export class PowerRunScene extends Phaser.Scene {
  private readonly hooks: PowerRunHooks;
  private worldGraphics!: Phaser.GameObjects.Graphics;
  private squad!: Phaser.GameObjects.Container;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<"A" | "D", Phaser.Input.Keyboard.Key>;
  private targetX = 0;
  private pointerIntentUntil = 0;
  private runDistance = 0;
  private power = INITIAL_SQUAD_POWER;
  private armor = 0;
  private combo = 0;
  private score = 0;
  private gatesPassed = 0;
  private enemiesDefeated = 0;
  private chapterIndex = 0;
  private status: PowerRunStatus = "running";
  private lastEvent: string | null = null;
  private lastSnapshotAt = 0;
  private readonly visuals = new Map<number, Phaser.GameObjects.Container>();
  private readonly handledItems = new Set<number>();

  constructor(hooks: PowerRunHooks) {
    super({ key: POWER_RUN_SCENE_KEY });
    this.hooks = hooks;
  }

  preload() {
    const assets: ReadonlyArray<[string, string, number, number]> = [
      ["power-run-soldier", "soldier.svg", 100, 130],
      ["power-run-scout", "scout.svg", 100, 130],
      ["power-run-medic", "medic.svg", 100, 130],
      ["power-run-heavy", "heavy.svg", 110, 140],
      ["power-run-mech", "mech.svg", 130, 150],
      ["power-run-raider", "raider.svg", 130, 160],
      ["power-run-drone", "drone.svg", 150, 90],
      ["power-run-brute", "brute.svg", 150, 175],
      ["power-run-turret", "turret.svg", 160, 135],
      ["power-run-supply", "supply-crate.svg", 150, 115],
      ["power-run-mine", "mine.svg", 130, 80],
      ["power-run-boss", "boss-tank.svg", 240, 175],
    ];

    assets.forEach(([key, file, width, height]) => {
      this.load.svg(key, ASSET_ROOT + "/" + file, { width, height });
    });
  }

  create() {
    this.resetRunState();
    this.worldGraphics = this.add.graphics().setDepth(-100);
    this.squad = this.add.container(this.scale.width / 2, this.playerY()).setDepth(20);
    this.targetX = this.scale.width / 2;
    this.rebuildSquad();
    this.drawWorld();

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("A,D") as typeof this.wasd;
    this.input.on("pointerdown", this.handlePointer, this);
    this.input.on("pointermove", this.handlePointer, this);
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointer, this);
      this.input.off("pointermove", this.handlePointer, this);
      this.scale.off("resize", this.handleResize, this);
      this.visuals.clear();
      this.handledItems.clear();
    });

    const snapshot = this.getSnapshot();
    this.hooks.onReady(snapshot);
    this.hooks.onSnapshot(snapshot);
  }

  update(time: number, delta: number) {
    if (this.status !== "running") return;

    this.runDistance += RUN_SPEED * (delta / 1_000);
    this.updateChapter();
    this.updatePlayer(time, delta);
    this.drawWorld();
    this.updateCourse();

    if (time - this.lastSnapshotAt > 120) {
      this.lastSnapshotAt = time;
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
    this.runDistance = 0;
    this.power = INITIAL_SQUAD_POWER;
    this.armor = 0;
    this.combo = 0;
    this.score = 0;
    this.gatesPassed = 0;
    this.enemiesDefeated = 0;
    this.chapterIndex = 0;
    this.status = "running";
    this.lastEvent = null;
    this.lastSnapshotAt = 0;
    this.visuals.clear();
    this.handledItems.clear();
  }

  private updateChapter() {
    const nextChapter = Phaser.Math.Clamp(
      Math.floor(this.elapsedSeconds() / CHAPTER_DURATION_SECONDS),
      0,
      CHAPTERS.length - 1,
    );
    if (nextChapter === this.chapterIndex) return;

    this.chapterIndex = nextChapter;
    this.lastEvent = "进入 " + CHAPTERS[this.chapterIndex].name;
    this.cameras.main.flash(220, 235, 246, 255);
    this.emitSnapshot();
  }

  private elapsedSeconds() {
    return this.runDistance / RUN_SPEED;
  }

  private playerY() {
    return this.scale.height * 0.79;
  }

  private trackHalfWidthAt(y: number) {
    const horizon = this.scale.height * 0.13;
    const topHalf = Math.min(76, this.scale.width * 0.14);
    const bottomHalf = Math.min(470, this.scale.width * 0.47);
    const progress = Phaser.Math.Clamp(
      (y - horizon) / Math.max(1, this.scale.height - horizon),
      0,
      1,
    );
    return Phaser.Math.Linear(topHalf, bottomHalf, progress);
  }

  private drawWorld() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const horizon = height * 0.13;
    const topHalf = this.trackHalfWidthAt(horizon);
    const bottomHalf = this.trackHalfWidthAt(height);
    const chapter = CHAPTERS[this.chapterIndex];
    const palette = environmentPalettes[chapter.environment];
    const graphics = this.worldGraphics;

    graphics.clear();
    graphics.fillStyle(palette.sky, 1).fillRect(0, 0, width, height);
    graphics.fillStyle(palette.haze, 1).fillRect(0, horizon * 0.62, width, height - horizon * 0.62);
    this.drawHorizon(graphics, chapter.environment, horizon);

    graphics.fillStyle(palette.road, 1);
    graphics.fillPoints([
      new Phaser.Geom.Point(centerX - topHalf, horizon),
      new Phaser.Geom.Point(centerX + topHalf, horizon),
      new Phaser.Geom.Point(centerX + bottomHalf, height),
      new Phaser.Geom.Point(centerX - bottomHalf, height),
    ], true);

    graphics.lineStyle(Math.max(7, width * 0.012), 0xf2f5f4, 1);
    graphics.beginPath();
    graphics.moveTo(centerX - topHalf, horizon);
    graphics.lineTo(centerX - bottomHalf, height);
    graphics.moveTo(centerX + topHalf, horizon);
    graphics.lineTo(centerX + bottomHalf, height);
    graphics.strokePath();
    graphics.lineStyle(Math.max(4, width * 0.007), palette.edge, 1);
    graphics.beginPath();
    graphics.moveTo(centerX - topHalf - 5, horizon);
    graphics.lineTo(centerX - bottomHalf - 5, height);
    graphics.moveTo(centerX + topHalf + 5, horizon);
    graphics.lineTo(centerX + bottomHalf + 5, height);
    graphics.strokePath();

    const stripeOffset = (this.runDistance * 0.85) % 120;
    for (let index = -1; index < 9; index += 1) {
      const y = horizon + index * 120 + stripeOffset;
      if (y < horizon || y > height) continue;
      const half = this.trackHalfWidthAt(y);
      const dashWidth = Math.max(2, half * 0.012);
      const dashHeight = 20 + ((y - horizon) / Math.max(1, height - horizon)) * 54;
      graphics.fillStyle(0xffffff, 0.5);
      graphics.fillRect(centerX - half / 3 - dashWidth / 2, y, dashWidth, dashHeight);
      graphics.fillRect(centerX + half / 3 - dashWidth / 2, y, dashWidth, dashHeight);
    }
  }

  private drawHorizon(
    graphics: Phaser.GameObjects.Graphics,
    environment: EnvironmentKind,
    horizon: number,
  ) {
    const { width } = this.scale;
    const palette = environmentPalettes[environment];
    graphics.fillStyle(palette.horizon, 0.55);

    if (environment === "city" || environment === "fortress") {
      const towerWidth = Math.max(30, width / 15);
      for (let index = 0; index < 16; index += 1) {
        const towerHeight = 24 + ((index * 37) % 68);
        graphics.fillRect(index * towerWidth - 8, horizon + 45 - towerHeight, towerWidth - 8, towerHeight);
      }
      if (environment === "fortress") {
        graphics.fillStyle(0xffd34b, 0.62);
        for (let index = 1; index < 15; index += 3) {
          graphics.fillRect(index * towerWidth + 4, horizon + 8, 6, 9);
        }
      }
      return;
    }

    graphics.fillTriangle(0, horizon + 46, width * 0.24, horizon - 5, width * 0.39, horizon + 46);
    graphics.fillTriangle(width * 0.61, horizon + 46, width * 0.84, horizon - 12, width, horizon + 46);
    if (environment === "coast" || environment === "snow") {
      graphics.fillStyle(0xffffff, environment === "snow" ? 0.8 : 0.68);
      graphics.fillEllipse(width * 0.14, horizon * 0.76, width * 0.3, 54);
      graphics.fillEllipse(width * 0.84, horizon * 0.63, width * 0.34, 64);
    } else {
      graphics.fillStyle(0xffe189, 0.85).fillCircle(width * 0.8, horizon * 0.55, 35);
    }
  }

  private updatePlayer(time: number, delta: number) {
    const direction =
      Number(Boolean(this.cursors?.right.isDown || this.wasd?.D.isDown)) -
      Number(Boolean(this.cursors?.left.isDown || this.wasd?.A.isDown));
    const limit = this.trackHalfWidthAt(this.playerY()) - 64;
    const minimumX = this.scale.width / 2 - limit;
    const maximumX = this.scale.width / 2 + limit;

    if (direction !== 0) {
      this.squad.x += direction * 350 * (delta / 1_000);
      this.targetX = this.squad.x;
      this.pointerIntentUntil = 0;
    } else if (time < this.pointerIntentUntil) {
      this.squad.x = Phaser.Math.Linear(this.squad.x, this.targetX, 0.18);
    }

    this.squad.x = Phaser.Math.Clamp(this.squad.x, minimumX, maximumX);
    this.squad.y = this.playerY();
    this.squad.rotation = Phaser.Math.Linear(this.squad.rotation, direction * 0.05, 0.12);
  }

  private handlePointer(pointer: Phaser.Input.Pointer) {
    if (this.status !== "running") return;
    const limit = this.trackHalfWidthAt(this.playerY()) - 64;
    this.targetX = Phaser.Math.Clamp(
      pointer.x,
      this.scale.width / 2 - limit,
      this.scale.width / 2 + limit,
    );
    this.pointerIntentUntil = this.time.now + 1_500;
  }

  private currentLane(): Lane {
    const half = this.trackHalfWidthAt(this.playerY());
    const ratio = (this.squad.x - this.scale.width / 2) / half;
    if (ratio < -0.25) return -1;
    if (ratio > 0.25) return 1;
    return 0;
  }

  private updateCourse() {
    COURSE.forEach((definition, index) => {
      if (this.handledItems.has(index)) return;

      const distanceAhead = definition.distance - this.runDistance;
      if (distanceAhead <= COURSE_VISIBILITY && !this.visuals.has(index)) {
        this.visuals.set(index, this.createCourseVisual(definition));
      }

      const visual = this.visuals.get(index);
      if (visual) this.positionCourseVisual(visual, distanceAhead, definition);

      if (distanceAhead <= 0) {
        this.handleCourseItem(definition, visual);
        this.handledItems.add(index);
        this.visuals.delete(index);
      }
    });
  }

  private createCourseVisual(definition: CourseDefinition) {
    switch (definition.kind) {
      case "gate":
        return this.createGateVisual(GATE_PAIRS[definition.pairIndex]);
      case "wave":
        return this.createWaveVisual(definition.power, definition.enemy);
      case "supply":
        return this.createSupplyVisual(definition.power);
      case "hazard":
        return this.createHazardVisual(definition.damage);
      case "boss":
        return this.createBossVisual(definition.power, definition.final);
    }
  }

  private createGateVisual(pair: GatePair) {
    const container = this.add.container(0, 0).setDepth(8);
    const addPanel = (x: number, gate: GatePair["left"]) => {
      const color = gateColor(gate.operator);
      const graphics = this.add.graphics();
      graphics.fillStyle(0x061b31, 0.22).fillRoundedRect(x - 79, -67, 158, 111, 10);
      graphics.fillStyle(color, 0.95).fillRoundedRect(x - 76, -72, 152, 107, 9);
      graphics.fillStyle(0xffffff, 0.19).fillRoundedRect(x - 69, -65, 138, 13, 5);
      graphics.lineStyle(4, 0xe7fbff, 0.92).strokeRoundedRect(x - 76, -72, 152, 107, 9);
      graphics.fillStyle(0xdff8ff, 1).fillRect(x - 69, 35, 8, 58);
      graphics.fillRect(x + 61, 35, 8, 58);
      container.add(graphics);

      const label = this.add.text(x, -15, gate.label, {
        color: "#ffffff",
        fontFamily: "Arial Black, sans-serif",
        fontSize: gate.label.length > 4 ? "35px" : "47px",
        fontStyle: "bold",
        stroke: "#073552",
        strokeThickness: 5,
      }).setOrigin(0.5).setResolution(2);
      container.add(label);
    };

    addPanel(-86, pair.left);
    addPanel(86, pair.right);
    return container;
  }

  private createWaveVisual(power: number, enemyKind: EnemyKind) {
    const container = this.add.container(0, 0).setDepth(9);
    const barricade = this.add.graphics();
    barricade.fillStyle(0x8b1d34, 0.94).fillRoundedRect(-125, 17, 250, 25, 6);
    barricade.fillStyle(0xffd248, 1);
    for (let x = -114; x < 110; x += 34) {
      barricade.fillTriangle(x, 19, x + 17, 19, x + 34, 40);
    }
    container.add(barricade);

    const texture = enemyTextures[enemyKind];
    const enemySize = enemyKind === "drone"
      ? { width: 52, height: 32 }
      : enemyKind === "turret"
        ? { width: 48, height: 40 }
        : enemyKind === "brute"
          ? { width: 42, height: 50 }
          : { width: 39, height: 48 };
    [-78, -39, 0, 39, 78].forEach((x, index) => {
      const enemy = this.add.image(x, index % 2 === 0 ? -12 : -3, texture);
      enemy.setDisplaySize(enemySize.width, enemySize.height);
      container.add(enemy);
    });

    const badge = this.add.text(0, -58, String(power), {
      backgroundColor: "#8b1d34",
      color: "#ffffff",
      fontFamily: "Arial Black, sans-serif",
      fontSize: "27px",
      fontStyle: "bold",
      padding: { x: 13, y: 4 },
      stroke: "#4c1021",
      strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    container.add(badge);
    return container;
  }

  private createSupplyVisual(power: number) {
    const container = this.add.container(0, 0).setDepth(11);
    const crate = this.add.image(0, 0, "power-run-supply").setDisplaySize(106, 81);
    const badge = this.add.text(0, -61, "+" + power, {
      backgroundColor: "#087d65",
      color: "#ffffff",
      fontFamily: "Arial Black, sans-serif",
      fontSize: power >= 1_000 ? "21px" : "25px",
      fontStyle: "bold",
      padding: { x: 12, y: 4 },
      stroke: "#06483e",
      strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    const armor = this.add.text(0, 50, "ARMOR +1", {
      color: "#e9fff8",
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      stroke: "#06483e",
      strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    container.add([crate, badge, armor]);
    return container;
  }

  private createHazardVisual(damage: number) {
    const container = this.add.container(0, 0).setDepth(10);
    const mine = this.add.image(0, 4, "power-run-mine").setDisplaySize(104, 64);
    const badge = this.add.text(0, -48, "−" + damage, {
      backgroundColor: "#8b1d34",
      color: "#ffffff",
      fontFamily: "Arial Black, sans-serif",
      fontSize: damage >= 100 ? "21px" : "25px",
      fontStyle: "bold",
      padding: { x: 11, y: 3 },
      stroke: "#4c1021",
      strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    container.add([mine, badge]);
    return container;
  }

  private createBossVisual(power: number, finalBoss: boolean) {
    const container = this.add.container(0, 0).setDepth(10);
    const aura = this.add.graphics();
    aura.fillStyle(0xff494c, 0.2).fillCircle(0, -30, finalBoss ? 112 : 91);
    aura.lineStyle(5, 0xffd24a, 0.86).strokeCircle(0, -30, finalBoss ? 102 : 83);
    container.add(aura);

    const boss = this.add
      .image(0, -32, finalBoss ? "power-run-boss" : "power-run-brute")
      .setDisplaySize(finalBoss ? 172 : 104, finalBoss ? 126 : 122);
    container.add(boss);
    const title = this.add.text(0, finalBoss ? -119 : -111, finalBoss ? "钢铁统帅" : "战区头目", {
      color: "#fff0b5",
      fontFamily: "Arial Black, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      stroke: "#3d0a1d",
      strokeThickness: 4,
    }).setOrigin(0.5).setResolution(2);
    const badge = this.add.text(0, 45, String(power), {
      backgroundColor: "#971c35",
      color: "#ffffff",
      fontFamily: "Arial Black, sans-serif",
      fontSize: power >= 1_000 ? "26px" : "31px",
      fontStyle: "bold",
      padding: { x: 17, y: 5 },
      stroke: "#4c1021",
      strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    container.add([title, badge]);
    return container;
  }

  private positionCourseVisual(
    visual: Phaser.GameObjects.Container,
    distanceAhead: number,
    definition: CourseDefinition,
  ) {
    const horizon = this.scale.height * 0.13;
    const endY = this.playerY() - 18;
    const progress = Phaser.Math.Clamp(1 - distanceAhead / COURSE_VISIBILITY, 0, 1);
    const perspective = progress ** 1.7;
    const y = Phaser.Math.Linear(horizon, endY, perspective);
    const nearScale = Math.min(1.08, (this.scale.width * 0.83) / 340);
    const lane = definition.kind === "supply" || definition.kind === "hazard"
      ? definition.lane
      : 0;
    const x = this.scale.width / 2 + lane * this.trackHalfWidthAt(y) * 0.52;
    visual.setPosition(x, y);
    visual.setScale(Phaser.Math.Linear(0.24, nearScale, progress));
    visual.setAlpha(Phaser.Math.Clamp(progress * 5, 0, 1));
  }

  private handleCourseItem(
    definition: CourseDefinition,
    visual: Phaser.GameObjects.Container | undefined,
  ) {
    visual?.destroy(true);
    switch (definition.kind) {
      case "gate":
        this.handleGate(definition);
        return;
      case "wave":
        this.handleWave(definition);
        return;
      case "supply":
        this.handleSupply(definition);
        return;
      case "hazard":
        this.handleHazard(definition);
        return;
      case "boss":
        this.handleBoss(definition);
    }
  }

  private handleGate(definition: Extract<CourseDefinition, { kind: "gate" }>) {
    const pair = GATE_PAIRS[definition.pairIndex];
    const gate = this.squad.x < this.scale.width / 2 ? pair.left : pair.right;
    const previousPower = this.power;
    this.power = applyGate(this.power, gate);
    this.combo = this.power >= previousPower ? this.combo + 1 : 0;
    this.score += scoreForGate(previousPower, this.power, this.combo);
    this.gatesPassed += 1;
    this.lastEvent = gate.label + "  " + previousPower + " → " + this.power;
    this.rebuildSquad();
    this.flashSquad(this.power >= previousPower ? 0x9dff9f : 0xff887c);
    this.emitSnapshot();
  }

  private handleWave(definition: Extract<CourseDefinition, { kind: "wave" }>) {
    const result = resolveBattle(this.power, definition.power);
    if (!result.won) {
      this.endRun("封锁战力 " + definition.power);
      return;
    }

    this.power = result.remainingPower;
    this.score += scoreForBattle(definition.power);
    this.enemiesDefeated += definition.power;
    this.lastEvent = "击破 " + definition.power + "  剩余 " + this.power;
    this.rebuildSquad();
    this.cameras.main.shake(110, 0.005);
    this.emitSnapshot();
  }

  private handleSupply(definition: Extract<CourseDefinition, { kind: "supply" }>) {
    if (this.currentLane() !== definition.lane) {
      this.lastEvent = "补给错过";
      this.combo = 0;
      this.emitSnapshot();
      return;
    }

    const previousPower = this.power;
    this.power = applySupply(this.power, definition.power);
    this.armor = Math.min(3, this.armor + definition.armor);
    this.score += definition.power * 18 + 400;
    this.lastEvent = "补给 +" + (this.power - previousPower) + "  护盾 " + this.armor;
    this.rebuildSquad();
    this.flashSquad(0x8fffe0);
    this.emitSnapshot();
  }

  private handleHazard(definition: Extract<CourseDefinition, { kind: "hazard" }>) {
    if (this.currentLane() !== definition.lane) {
      this.score += 160;
      this.lastEvent = "危险规避";
      this.emitSnapshot();
      return;
    }

    const result = resolveHazard(this.power, this.armor, definition.damage);
    this.power = result.remainingPower;
    this.armor = result.remainingArmor;
    this.combo = 0;
    if (!result.survived) {
      this.endRun("地雷伤害 " + definition.damage);
      return;
    }

    this.lastEvent = result.absorbed
      ? "护盾抵消 " + definition.damage
      : "遭遇地雷 −" + definition.damage;
    this.rebuildSquad();
    this.cameras.main.shake(180, 0.012);
    this.emitSnapshot();
  }

  private handleBoss(definition: Extract<CourseDefinition, { kind: "boss" }>) {
    this.lastEvent = this.power + " VS " + definition.power;
    if (definition.final) {
      if (canDefeatBoss(this.power, definition.power)) {
        this.status = "won";
        this.score += definition.power * 40 + this.power * 15;
        this.enemiesDefeated += definition.power;
        this.cameras.main.flash(320, 245, 213, 73);
        this.emitSnapshot();
      } else {
        this.endRun(this.lastEvent);
      }
      return;
    }

    const result = resolveBattle(this.power, definition.power);
    if (!result.won) {
      this.endRun(this.lastEvent);
      return;
    }

    this.power = applySupply(result.remainingPower, definition.reward);
    this.score += scoreForBattle(definition.power) + definition.reward * 30;
    this.enemiesDefeated += definition.power;
    this.combo += 1;
    this.lastEvent = "战区突破  奖励 +" + definition.reward;
    this.rebuildSquad();
    this.cameras.main.flash(220, 255, 216, 80);
    this.emitSnapshot();
  }

  private endRun(event: string) {
    this.status = "gameover";
    this.lastEvent = event;
    this.cameras.main.shake(260, 0.016);
    this.emitSnapshot();
  }

  private squadTexture(index: number) {
    if (this.power >= 3_000 && index % 7 === 0) return "power-run-mech";
    if (this.power >= 700 && index % 4 === 0) return "power-run-heavy";
    if (this.armor > 0 && index % 6 === 0) return "power-run-medic";
    if (this.power >= 120 && index % 5 === 0) return "power-run-scout";
    return "power-run-soldier";
  }

  private rebuildSquad() {
    if (!this.squad) return;
    this.squad.removeAll(true);
    const visibleCount = Phaser.Math.Clamp(
      Math.ceil(4 + Math.sqrt(this.power) * 1.2),
      5,
      28,
    );
    const columns = Math.min(6, Math.ceil(Math.sqrt(visibleCount)));
    const rows = Math.ceil(visibleCount / columns);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x06182a, 0.25).fillEllipse(0, 8, columns * 21, 30 + rows * 15);
    this.squad.add(shadow);

    for (let index = visibleCount - 1; index >= 0; index -= 1) {
      const row = Math.floor(index / columns);
      const itemsInRow = Math.min(columns, visibleCount - row * columns);
      const column = index % columns;
      const texture = this.squadTexture(index);
      const soldier = this.add.image(
        (column - (itemsInRow - 1) / 2) * 19,
        -row * 19 + Math.abs(column - (itemsInRow - 1) / 2) * 2,
        texture,
      );
      soldier.setDisplaySize(
        texture === "power-run-mech" ? 33 : 29,
        texture === "power-run-mech" ? 39 : 38,
      );
      this.squad.add(soldier);
    }

    const powerLabel = this.add.text(0, -rows * 20 - 20, String(this.power), {
      backgroundColor: "#063e69",
      color: "#ffffff",
      fontFamily: "Arial Black, sans-serif",
      fontSize: this.power >= 1_000 ? "18px" : "21px",
      fontStyle: "bold",
      padding: { x: 12, y: 4 },
      stroke: "#022640",
      strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    this.squad.add(powerLabel);
  }

  private flashSquad(color: number) {
    this.cameras.main.flash(120, (color >> 16) & 255, (color >> 8) & 255, color & 255);
    this.tweens.add({
      targets: this.squad,
      scaleX: 1.14,
      scaleY: 1.14,
      duration: 90,
      yoyo: true,
      ease: "Quad.Out",
    });
  }

  private handleResize() {
    this.squad.setPosition(
      Phaser.Math.Clamp(this.squad.x, 28, this.scale.width - 28),
      this.playerY(),
    );
    this.targetX = this.squad.x;
    this.drawWorld();
  }

  private getSnapshot(): PowerRunSnapshot {
    const elapsedSeconds = Math.min(POWER_RUN_DURATION_SECONDS, this.elapsedSeconds());
    return {
      power: this.power,
      bossPower: BOSS_POWER,
      armor: this.armor,
      combo: this.combo,
      score: this.score,
      progress: Phaser.Math.Clamp(this.runDistance / COURSE_DISTANCE, 0, 1),
      elapsedSeconds,
      timeLeft: Math.max(0, Math.ceil(POWER_RUN_DURATION_SECONDS - elapsedSeconds)),
      chapterIndex: this.chapterIndex,
      chapterName: CHAPTERS[this.chapterIndex].name,
      gatesPassed: this.gatesPassed,
      totalGates: GATE_PAIRS.length,
      enemiesDefeated: this.enemiesDefeated,
      lastEvent: this.lastEvent,
      status: this.status,
    };
  }

  private emitSnapshot() {
    this.hooks.onSnapshot(this.getSnapshot());
  }
}
