export interface EvolutionStage {
  level: number;
  name: string;
  minMass: number;
  texture: string;
  renderScale: number;
}

export const EVOLUTION_STAGES: readonly EvolutionStage[] = [
  { level: 1, name: "银鳍幼鱼", minMass: 18, texture: "fish-tier-1", renderScale: 0.18 },
  { level: 2, name: "蓝纹沙丁", minMass: 42, texture: "fish-tier-2", renderScale: 0.21 },
  { level: 3, name: "金翼蝶鱼", minMass: 72, texture: "fish-tier-3", renderScale: 0.245 },
  { level: 4, name: "珊瑚刺豚", minMass: 110, texture: "fish-tier-4", renderScale: 0.285 },
  { level: 5, name: "红斑石斑", minMass: 158, texture: "fish-tier-5", renderScale: 0.33 },
  { level: 6, name: "远洋金枪", minMass: 218, texture: "fish-tier-6", renderScale: 0.38 },
  { level: 7, name: "暗礁梭鱼", minMass: 294, texture: "fish-tier-7", renderScale: 0.435 },
  { level: 8, name: "赤吻剑鱼", minMass: 390, texture: "fish-tier-8", renderScale: 0.495 },
  { level: 9, name: "幽灯鮟鱇", minMass: 510, texture: "fish-tier-9", renderScale: 0.56 },
  { level: 10, name: "星斑蝠鲼", minMass: 660, texture: "fish-tier-10", renderScale: 0.63 },
  { level: 11, name: "雷纹锤鲨", minMass: 846, texture: "fish-tier-11", renderScale: 0.7 },
  { level: 12, name: "鲸纹巨鲨", minMass: 1_076, texture: "fish-tier-12", renderScale: 0.77 },
  { level: 13, name: "深渊龙鱼", minMass: 1_360, texture: "fish-tier-13", renderScale: 0.85 },
];

export const INITIAL_PLAYER_MASS = EVOLUTION_STAGES[0].minMass;
export const CLASSIC_GOAL_MASS = EVOLUTION_STAGES.at(-1)?.minMass ?? 1_360;
export const RUSH_GOAL_MASS = EVOLUTION_STAGES[4].minMass;
export const PRESSURE_INTERVAL_SECONDS = 45;
export const PRESSURE_GRACE_SECONDS = 12;
export const DEPTH_ZONE_HEIGHT = 480;
export const DEPTH_METERS_PER_ZONE = 100;

export const hasCompletedGrowthGoal = (mode: "classic" | "rush", mass: number) =>
  mode === "rush" && mass >= RUSH_GOAL_MASS;

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const evolutionStageForMass = (mass: number) => {
  let stage = EVOLUTION_STAGES[0];
  for (const candidate of EVOLUTION_STAGES) {
    if (mass < candidate.minMass) break;
    stage = candidate;
  }
  return stage;
};

export const evolutionStageForLevel = (level: number) =>
  EVOLUTION_STAGES[clamp(Math.round(level), 1, EVOLUTION_STAGES.length) - 1];

export const levelForMass = (mass: number) => evolutionStageForMass(mass).level;

export const scaleForMass = (mass: number) => evolutionStageForMass(mass).renderScale;

export const stageProgressForMass = (mass: number) => {
  const stage = evolutionStageForMass(mass);
  const nextStage = EVOLUTION_STAGES[stage.level];
  if (!nextStage) return 1;
  return clamp((mass - stage.minMass) / (nextStage.minMass - stage.minMass), 0, 1);
};

export const canEat = (playerMass: number, targetMass: number) =>
  levelForMass(targetMass) <= levelForMass(playerMass);

export const isDangerous = (playerMass: number, targetMass: number) =>
  levelForMass(targetMass) > levelForMass(playerMass);

export const pointsForPrey = (
  playerMass: number,
  targetMass: number,
  combo: number,
) => {
  const sameLevelBonus = levelForMass(targetMass) === levelForMass(playerMass) ? 1.25 : 1;
  return Math.round(targetMass * 7 * sameLevelBonus * (1 + Math.min(combo, 8) * 0.08));
};

export const sameLevelPreyRequired = (playerLevel: number) =>
  2 + (clamp(Math.round(playerLevel), 1, EVOLUTION_STAGES.length - 1) - 1) * 0.2;

export const growthForPrey = (playerMass: number, targetMass: number) => {
  const playerStage = evolutionStageForMass(playerMass);
  const nextStage = EVOLUTION_STAGES[playerStage.level];
  if (!nextStage) return 0;

  const targetLevel = levelForMass(targetMass);
  const levelDifference = Math.max(0, playerStage.level - targetLevel);
  const stageMass = nextStage.minMass - playerStage.minMass;
  const sameLevelGrowth = stageMass / sameLevelPreyRequired(playerStage.level);
  return sameLevelGrowth / 3 ** levelDifference;
};

export const massAfterEating = (playerMass: number, targetMass: number) =>
  playerMass + growthForPrey(playerMass, targetMass);

export const difficultyForSeconds = (seconds: number) =>
  clamp(seconds / 180, 0, 1);

export const requiredLevelForSeconds = (seconds: number) =>
  clamp(
    1 + Math.floor(Math.max(0, seconds) / PRESSURE_INTERVAL_SECONDS),
    1,
    EVOLUTION_STAGES.length,
  );

export const abyssThreatForSeconds = (seconds: number) =>
  clamp(Math.max(0, seconds) / 360, 0, 1);

export const threatTierForSeconds = (seconds: number) =>
  clamp(1 + Math.floor(abyssThreatForSeconds(seconds) * 5), 1, 5);

export const mineSpawnChanceForSeconds = (seconds: number) =>
  0.28 + abyssThreatForSeconds(seconds) * 0.52;

export const maxMinesForSeconds = (seconds: number) =>
  1 + Math.floor(abyssThreatForSeconds(seconds) * 2);

export const depthMetersForWorldY = (worldY: number) =>
  Math.floor(Math.max(0, worldY) * DEPTH_METERS_PER_ZONE / DEPTH_ZONE_HEIGHT);

export const requiredLevelForDepth = (worldY: number) =>
  clamp(
    1 + Math.floor(Math.max(0, worldY) / DEPTH_ZONE_HEIGHT),
    1,
    EVOLUTION_STAGES.length,
  );

export const depthZoneNameForLevel = (level: number) => {
  const normalizedLevel = clamp(Math.round(level), 1, EVOLUTION_STAGES.length);
  if (normalizedLevel === 1) return "阳光浅海";
  if (normalizedLevel <= 4) return "蓝水层";
  if (normalizedLevel <= 8) return "暮光层";
  if (normalizedLevel <= 12) return "午夜层";
  return "深渊层";
};

export const isDepthUnsafe = (playerLevel: number, worldY: number) =>
  clamp(Math.round(playerLevel), 1, EVOLUTION_STAGES.length) < requiredLevelForDepth(worldY);

export const enemyRarityForLevel = (level: number) =>
  0.84 ** (clamp(Math.round(level), 1, EVOLUTION_STAGES.length) - 1);

const relativeSpawnWeight = (levelDifference: number) => {
  if (levelDifference <= -2) return 0.28;
  if (levelDifference === -1) return 0.38;
  if (levelDifference === 0) return 0.22;
  if (levelDifference === 1) return 0.09;
  return 0.03;
};

export const pickEnemyLevel = (
  playerLevel: number,
  random: () => number = Math.random,
) => {
  const normalizedPlayerLevel = clamp(Math.round(playerLevel), 1, EVOLUTION_STAGES.length);
  const minimumLevel = Math.max(1, normalizedPlayerLevel - 2);
  const maximumLevel = Math.min(EVOLUTION_STAGES.length, normalizedPlayerLevel + 2);
  const candidates = Array.from(
    { length: maximumLevel - minimumLevel + 1 },
    (_, index) => minimumLevel + index,
  );
  const weights = candidates.map((level) =>
    relativeSpawnWeight(level - normalizedPlayerLevel) * enemyRarityForLevel(level));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let roll = clamp(random(), 0, 0.999_999) * totalWeight;

  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return candidates[index];
  }

  return candidates.at(-1) ?? normalizedPlayerLevel;
};

export const pickEnemyLevelForDepth = (
  playerLevel: number,
  worldY: number,
  random: () => number = Math.random,
) => {
  const normalizedPlayerLevel = clamp(Math.round(playerLevel), 1, EVOLUTION_STAGES.length);
  const depthLevel = requiredLevelForDepth(worldY);
  const maximumLevel = Math.min(depthLevel, normalizedPlayerLevel + 2);
  const minimumLevel = Math.max(1, Math.min(normalizedPlayerLevel - 2, maximumLevel));
  const candidates = Array.from(
    { length: maximumLevel - minimumLevel + 1 },
    (_, index) => minimumLevel + index,
  );
  const depthBias = (depthLevel - 1) / (EVOLUTION_STAGES.length - 1);
  const levelSpan = Math.max(1, maximumLevel - minimumLevel);
  const weights = candidates.map((level) => {
    const positionInDepthBand = (level - minimumLevel) / levelSpan;
    const deepWaterMultiplier = 1 + depthBias * 12 * positionInDepthBand ** 1.4;
    return relativeSpawnWeight(level - normalizedPlayerLevel)
      * enemyRarityForLevel(level)
      * deepWaterMultiplier;
  });
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let roll = clamp(random(), 0, 0.999_999) * totalWeight;

  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return candidates[index];
  }

  return candidates.at(-1) ?? 1;
};

export const massForLevel = (
  level: number,
  random: () => number = Math.random,
) => {
  const stage = evolutionStageForLevel(level);
  const nextStage = EVOLUTION_STAGES[stage.level];
  const upperBound = nextStage?.minMass ?? stage.minMass * 1.22;
  return stage.minMass + (upperBound - stage.minMass) * (0.18 + random() * 0.52);
};
