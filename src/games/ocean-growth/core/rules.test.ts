import { describe, expect, it } from "vitest";
import {
  EVOLUTION_STAGES,
  CLASSIC_GOAL_MASS,
  RUSH_GOAL_MASS,
  canEat,
  abyssThreatForSeconds,
  difficultyForSeconds,
  enemyRarityForLevel,
  evolutionStageForMass,
  growthForPrey,
  hasCompletedGrowthGoal,
  isDangerous,
  levelForMass,
  massAfterEating,
  massForLevel,
  maxMinesForSeconds,
  mineSpawnChanceForSeconds,
  pickEnemyLevel,
  pointsForPrey,
  scaleForMass,
  sameLevelPreyRequired,
  stageProgressForMass,
  requiredLevelForSeconds,
  threatTierForSeconds,
} from "./rules";

describe("ocean growth rules", () => {
  it("allows same-level catches while keeping higher stages dangerous", () => {
    const playerMass = EVOLUTION_STAGES[2].minMass;
    expect(canEat(playerMass, EVOLUTION_STAGES[1].minMass)).toBe(true);
    expect(canEat(playerMass, playerMass + 8)).toBe(true);
    expect(isDangerous(playerMass, playerMass + 8)).toBe(false);
    expect(isDangerous(playerMass, EVOLUTION_STAGES[3].minMass)).toBe(true);
  });

  it("never refreshes fish more than two levels above the player", () => {
    expect(pickEnemyLevel(2, () => 0.99)).toBe(4);
    expect(pickEnemyLevel(6, () => 0.99)).toBe(8);
    expect(pickEnemyLevel(12, () => 0.99)).toBe(13);
    expect(pickEnemyLevel(2, () => 0)).toBe(1);
  });

  it("makes advanced fish progressively rarer", () => {
    expect(enemyRarityForLevel(1)).toBeGreaterThan(enemyRarityForLevel(6));
    expect(enemyRarityForLevel(6)).toBeGreaterThan(enemyRarityForLevel(13));

    const sample = Array.from({ length: 1_000 }, (_, index) =>
      pickEnemyLevel(6, () => index / 1_000));
    const count = (level: number) => sample.filter((candidate) => candidate === level).length;
    expect(count(6)).toBeGreaterThan(count(7));
    expect(count(7)).toBeGreaterThan(count(8));
  });

  it("keeps classic mode running at the final tier", () => {
    expect(hasCompletedGrowthGoal("classic", CLASSIC_GOAL_MASS)).toBe(false);
    expect(hasCompletedGrowthGoal("classic", CLASSIC_GOAL_MASS * 2)).toBe(false);
    expect(hasCompletedGrowthGoal("rush", RUSH_GOAL_MASS)).toBe(true);
  });

  it("keeps generated mass inside the requested evolution stage", () => {
    const mass = massForLevel(4, () => 0.5);
    expect(levelForMass(mass)).toBe(4);
    expect(evolutionStageForMass(mass).texture).toBe("fish-tier-4");
  });

  it("uses a 3x prey-value ladder and progressively harder stages", () => {
    const levelSixMass = EVOLUTION_STAGES[5].minMass;
    const levelSixGrowth = growthForPrey(levelSixMass, EVOLUTION_STAGES[5].minMass);
    const levelFiveGrowth = growthForPrey(levelSixMass, EVOLUTION_STAGES[4].minMass);
    const levelFourGrowth = growthForPrey(levelSixMass, EVOLUTION_STAGES[3].minMass);
    const levelSixGap = EVOLUTION_STAGES[6].minMass - levelSixMass;

    expect(sameLevelPreyRequired(1)).toBe(2);
    expect(sameLevelPreyRequired(6)).toBe(3);
    expect(sameLevelPreyRequired(12)).toBe(4.2);
    expect(levelSixGrowth * 3).toBeCloseTo(levelSixGap);
    expect(levelFiveGrowth * 9).toBeCloseTo(levelSixGap);
    expect(levelFourGrowth * 27).toBeCloseTo(levelSixGap);
    expect(massAfterEating(levelSixMass, EVOLUTION_STAGES[5].minMass)).toBeGreaterThan(levelSixMass);
  });

  it("takes about 3 level-six, 9 level-five, or 27 level-four fish to reach level seven", () => {
    const startMass = EVOLUTION_STAGES[5].minMass;
    const levelSevenMass = EVOLUTION_STAGES[6].minMass;
    const consume = (count: number, preyMass: number) => {
      let mass = startMass;
      for (let index = 0; index < count; index += 1) {
        mass = massAfterEating(mass, preyMass);
      }
      return mass;
    };

    expect(consume(2, EVOLUTION_STAGES[5].minMass)).toBeLessThan(levelSevenMass);
    expect(consume(3, EVOLUTION_STAGES[5].minMass)).toBeCloseTo(levelSevenMass);
    expect(consume(9, EVOLUTION_STAGES[4].minMass)).toBeCloseTo(levelSevenMass);
    expect(consume(27, EVOLUTION_STAGES[3].minMass)).toBeCloseTo(levelSevenMass);
  });

  it("scores more for same-level prey and combos", () => {
    const playerMass = EVOLUTION_STAGES[2].minMass;
    const lowerLevelScore = pointsForPrey(playerMass, EVOLUTION_STAGES[1].minMass, 0);
    const sameLevelScore = pointsForPrey(playerMass, playerMass, 0);
    expect(sameLevelScore).toBeGreaterThan(lowerLevelScore);
    expect(pointsForPrey(playerMass, playerMass, 4)).toBeGreaterThan(sameLevelScore);
  });

  it("changes render scale only at evolution thresholds", () => {
    expect(scaleForMass(42)).toBe(scaleForMass(71.9));
    expect(scaleForMass(72)).toBeGreaterThan(scaleForMass(71.9));
    expect(stageProgressForMass(72)).toBe(0);
    expect(stageProgressForMass(10_000)).toBe(1);
    expect(difficultyForSeconds(999)).toBe(1);
  });

  it("raises the survival level every 45 seconds and caps it at the final stage", () => {
    expect(requiredLevelForSeconds(0)).toBe(1);
    expect(requiredLevelForSeconds(44)).toBe(1);
    expect(requiredLevelForSeconds(45)).toBe(2);
    expect(requiredLevelForSeconds(90)).toBe(3);
    expect(requiredLevelForSeconds(99_999)).toBe(EVOLUTION_STAGES.length);
  });

  it("makes abyss threats and mines steadily more lethal over time", () => {
    expect(abyssThreatForSeconds(0)).toBe(0);
    expect(abyssThreatForSeconds(180)).toBe(0.5);
    expect(abyssThreatForSeconds(360)).toBe(1);
    expect(threatTierForSeconds(0)).toBe(1);
    expect(threatTierForSeconds(360)).toBe(5);
    expect(mineSpawnChanceForSeconds(360)).toBeGreaterThan(mineSpawnChanceForSeconds(60));
    expect(maxMinesForSeconds(0)).toBe(1);
    expect(maxMinesForSeconds(180)).toBe(2);
    expect(maxMinesForSeconds(360)).toBe(3);
  });
});
