export type GateOperator = "add" | "subtract" | "multiply" | "divide";
export type Lane = -1 | 0 | 1;
export type EnemyKind = "raider" | "drone" | "brute" | "turret";
export type EnvironmentKind = "coast" | "desert" | "snow" | "city" | "fortress";

export interface NumberGate {
  operator: GateOperator;
  value: number;
  label: string;
}

export interface GatePair {
  left: NumberGate;
  right: NumberGate;
}

export interface ChapterDefinition {
  name: string;
  environment: EnvironmentKind;
  waves: readonly [number, number];
  enemyKinds: readonly [EnemyKind, EnemyKind];
  bossPower: number;
  bossReward: number;
  supplyPower: number;
  hazardDamage: number;
}

export type CourseDefinition =
  | { kind: "gate"; distance: number; pairIndex: number; chapterIndex: number }
  | { kind: "wave"; distance: number; power: number; enemy: EnemyKind; chapterIndex: number }
  | { kind: "supply"; distance: number; power: number; armor: number; lane: Lane; chapterIndex: number }
  | { kind: "hazard"; distance: number; damage: number; lane: Lane; chapterIndex: number }
  | {
      kind: "boss";
      distance: number;
      power: number;
      reward: number;
      final: boolean;
      chapterIndex: number;
    };

export interface BattleResult {
  won: boolean;
  remainingPower: number;
}

export interface HazardResult {
  survived: boolean;
  remainingPower: number;
  remainingArmor: number;
  absorbed: boolean;
}

export const INITIAL_SQUAD_POWER = 12;
export const MAX_SQUAD_POWER = 9_999;
export const RUN_SPEED = 180;
export const CHAPTER_DURATION_SECONDS = 64;
export const POWER_RUN_DURATION_SECONDS = CHAPTER_DURATION_SECONDS * 4 + 63;

export const GATE_PAIRS: readonly GatePair[] = [
  {
    left: { operator: "add", value: 8, label: "+8" },
    right: { operator: "multiply", value: 2, label: "×2" },
  },
  {
    left: { operator: "subtract", value: 7, label: "−7" },
    right: { operator: "add", value: 18, label: "+18" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 24, label: "+24" },
  },
  {
    left: { operator: "add", value: 42, label: "+42" },
    right: { operator: "divide", value: 2, label: "÷2" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 45, label: "+45" },
  },
  {
    left: { operator: "subtract", value: 35, label: "−35" },
    right: { operator: "add", value: 60, label: "+60" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 90, label: "+90" },
  },
  {
    left: { operator: "add", value: 90, label: "+90" },
    right: { operator: "divide", value: 2, label: "÷2" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 180, label: "+180" },
  },
  {
    left: { operator: "subtract", value: 100, label: "−100" },
    right: { operator: "add", value: 150, label: "+150" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 280, label: "+280" },
  },
  {
    left: { operator: "add", value: 250, label: "+250" },
    right: { operator: "divide", value: 2, label: "÷2" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 550, label: "+550" },
  },
  {
    left: { operator: "subtract", value: 250, label: "−250" },
    right: { operator: "add", value: 400, label: "+400" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 800, label: "+800" },
  },
  {
    left: { operator: "add", value: 650, label: "+650" },
    right: { operator: "divide", value: 2, label: "÷2" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 1_200, label: "+1200" },
  },
  {
    left: { operator: "subtract", value: 700, label: "−700" },
    right: { operator: "add", value: 950, label: "+950" },
  },
  {
    left: { operator: "multiply", value: 2, label: "×2" },
    right: { operator: "add", value: 1_800, label: "+1800" },
  },
  {
    left: { operator: "add", value: 1_400, label: "+1400" },
    right: { operator: "divide", value: 2, label: "÷2" },
  },
];

export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    name: "海岸前线",
    environment: "coast",
    waves: [8, 18],
    enemyKinds: ["raider", "drone"],
    bossPower: 55,
    bossReward: 12,
    supplyPower: 18,
    hazardDamage: 10,
  },
  {
    name: "荒漠基地",
    environment: "desert",
    waves: [45, 85],
    enemyKinds: ["drone", "turret"],
    bossPower: 220,
    bossReward: 35,
    supplyPower: 35,
    hazardDamage: 30,
  },
  {
    name: "雪山哨站",
    environment: "snow",
    waves: [140, 260],
    enemyKinds: ["brute", "drone"],
    bossPower: 650,
    bossReward: 100,
    supplyPower: 100,
    hazardDamage: 100,
  },
  {
    name: "夜幕城市",
    environment: "city",
    waves: [350, 700],
    enemyKinds: ["turret", "brute"],
    bossPower: 1_900,
    bossReward: 250,
    supplyPower: 250,
    hazardDamage: 250,
  },
  {
    name: "终局堡垒",
    environment: "fortress",
    waves: [900, 1_800],
    enemyKinds: ["brute", "turret"],
    bossPower: 5_000,
    bossReward: 0,
    supplyPower: 500,
    hazardDamage: 600,
  },
];

const hazardLanes: readonly Lane[] = [-1, 1, 0, -1, 1];
const secondHazardLanes: readonly Lane[] = [1, -1, 1, 0, -1];
const supplyLanes: readonly Lane[] = [1, -1, 0, 1, -1];
const secondsToDistance = (seconds: number) => seconds * RUN_SPEED;

export const COURSE: readonly CourseDefinition[] = CHAPTERS.flatMap(
  (chapter, chapterIndex) => {
    const start = chapterIndex * CHAPTER_DURATION_SECONDS;
    const gateOffset = chapterIndex * 4;
    return [
      {
        kind: "gate",
        distance: secondsToDistance(start + 6),
        pairIndex: gateOffset,
        chapterIndex,
      },
      {
        kind: "hazard",
        distance: secondsToDistance(start + 12),
        damage: chapter.hazardDamage,
        lane: hazardLanes[chapterIndex],
        chapterIndex,
      },
      {
        kind: "supply",
        distance: secondsToDistance(start + 18),
        power: chapter.supplyPower,
        armor: 1,
        lane: supplyLanes[chapterIndex],
        chapterIndex,
      },
      {
        kind: "gate",
        distance: secondsToDistance(start + 25),
        pairIndex: gateOffset + 1,
        chapterIndex,
      },
      {
        kind: "wave",
        distance: secondsToDistance(start + 32),
        power: chapter.waves[0],
        enemy: chapter.enemyKinds[0],
        chapterIndex,
      },
      {
        kind: "gate",
        distance: secondsToDistance(start + 39),
        pairIndex: gateOffset + 2,
        chapterIndex,
      },
      {
        kind: "hazard",
        distance: secondsToDistance(start + 45),
        damage: chapter.hazardDamage,
        lane: secondHazardLanes[chapterIndex],
        chapterIndex,
      },
      {
        kind: "gate",
        distance: secondsToDistance(start + 52),
        pairIndex: gateOffset + 3,
        chapterIndex,
      },
      {
        kind: "wave",
        distance: secondsToDistance(start + 58),
        power: chapter.waves[1],
        enemy: chapter.enemyKinds[1],
        chapterIndex,
      },
      {
        kind: "boss",
        distance: secondsToDistance(start + 63),
        power: chapter.bossPower,
        reward: chapter.bossReward,
        final: chapterIndex === CHAPTERS.length - 1,
        chapterIndex,
      },
    ] satisfies CourseDefinition[];
  },
).sort((left, right) => left.distance - right.distance);

export const BOSS_POWER = CHAPTERS.at(-1)?.bossPower ?? 5_000;
export const COURSE_DISTANCE = POWER_RUN_DURATION_SECONDS * RUN_SPEED;

export const clampPower = (power: number) =>
  Math.max(1, Math.min(MAX_SQUAD_POWER, Math.round(power)));

export const applyGate = (power: number, gate: NumberGate) => {
  switch (gate.operator) {
    case "add":
      return clampPower(power + gate.value);
    case "subtract":
      return clampPower(power - gate.value);
    case "multiply":
      return clampPower(power * gate.value);
    case "divide":
      return clampPower(Math.floor(power / gate.value));
  }
};

export const bestGateForPower = (power: number, pair: GatePair) =>
  applyGate(power, pair.left) >= applyGate(power, pair.right)
    ? pair.left
    : pair.right;

export const resolveBattle = (
  squadPower: number,
  enemyPower: number,
): BattleResult => ({
  won: squadPower > enemyPower,
  remainingPower: squadPower > enemyPower
    ? clampPower(squadPower - enemyPower)
    : 0,
});

export const resolveHazard = (
  squadPower: number,
  armor: number,
  damage: number,
): HazardResult => {
  if (armor > 0) {
    return {
      survived: true,
      remainingPower: squadPower,
      remainingArmor: armor - 1,
      absorbed: true,
    };
  }

  const remainingPower = squadPower - damage;
  return {
    survived: remainingPower > 0,
    remainingPower: remainingPower > 0 ? clampPower(remainingPower) : 0,
    remainingArmor: 0,
    absorbed: false,
  };
};

export const applySupply = (squadPower: number, bonusPower: number) =>
  clampPower(squadPower + bonusPower);

export const canDefeatBoss = (squadPower: number, bossPower = BOSS_POWER) =>
  squadPower >= bossPower;

export const scoreForGate = (
  previousPower: number,
  nextPower: number,
  combo = 0,
) =>
  Math.round(
    (150 + Math.max(0, nextPower - previousPower) * 12) *
      (1 + Math.min(combo, 5) * 0.15),
  );

export const scoreForBattle = (enemyPower: number) => enemyPower * 25;
