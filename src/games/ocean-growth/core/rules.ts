export interface EvolutionStage {
  level: number;
  name: string;
  minMass: number;
  texture: string;
  renderScale: number;
}

export const EVOLUTION_STAGES: readonly EvolutionStage[] = [
  { level: 1, name: "银鳍幼鱼", minMass: 18, texture: "fish-tier-1", renderScale: 0.22 },
  { level: 2, name: "蓝纹沙丁", minMass: 28, texture: "fish-tier-2", renderScale: 0.245 },
  { level: 3, name: "金翼蝶鱼", minMass: 43, texture: "fish-tier-3", renderScale: 0.27 },
  { level: 4, name: "珊瑚刺豚", minMass: 62, texture: "fish-tier-4", renderScale: 0.3 },
  { level: 5, name: "红斑石斑", minMass: 86, texture: "fish-tier-5", renderScale: 0.33 },
  { level: 6, name: "远洋金枪", minMass: 116, texture: "fish-tier-6", renderScale: 0.365 },
  { level: 7, name: "暗礁梭鱼", minMass: 152, texture: "fish-tier-7", renderScale: 0.4 },
];

export const INITIAL_PLAYER_MASS = EVOLUTION_STAGES[1].minMass;
export const CLASSIC_GOAL_MASS = EVOLUTION_STAGES.at(-1)?.minMass ?? 152;
export const RUSH_GOAL_MASS = EVOLUTION_STAGES[4].minMass;

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
  levelForMass(targetMass) < levelForMass(playerMass);

export const isDangerous = (playerMass: number, targetMass: number) =>
  levelForMass(targetMass) > levelForMass(playerMass);

export const pointsForPrey = (targetMass: number, combo: number) =>
  Math.round(targetMass * 7 * (1 + Math.min(combo, 8) * 0.08));

export const massAfterEating = (playerMass: number, targetMass: number) =>
  playerMass + Math.max(1.4, targetMass * 0.16);

export const difficultyForSeconds = (seconds: number) =>
  clamp(seconds / 180, 0, 1);

export const pickEnemyLevel = (
  playerLevel: number,
  random: () => number = Math.random,
) => {
  const roll = random();
  let offset: number;

  if (roll < 0.12) offset = -2;
  else if (roll < 0.54) offset = -1;
  else if (roll < 0.7) offset = 0;
  else if (roll < 0.93) offset = 1;
  else offset = 2;

  return clamp(
    Math.round(playerLevel) + offset,
    1,
    Math.min(EVOLUTION_STAGES.length, Math.round(playerLevel) + 2),
  );
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
