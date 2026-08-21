import { describe, expect, it } from "vitest";
import {
  EVOLUTION_STAGES,
  canEat,
  difficultyForSeconds,
  evolutionStageForMass,
  isDangerous,
  levelForMass,
  massAfterEating,
  massForLevel,
  pickEnemyLevel,
  pointsForPrey,
  scaleForMass,
  stageProgressForMass,
} from "./rules";

describe("ocean growth rules", () => {
  it("uses discrete stages so prey, peers, and predators are unambiguous", () => {
    const playerMass = EVOLUTION_STAGES[2].minMass;
    expect(canEat(playerMass, EVOLUTION_STAGES[1].minMass)).toBe(true);
    expect(canEat(playerMass, playerMass + 8)).toBe(false);
    expect(isDangerous(playerMass, playerMass + 8)).toBe(false);
    expect(isDangerous(playerMass, EVOLUTION_STAGES[3].minMass)).toBe(true);
  });

  it("never refreshes fish more than two levels above the player", () => {
    expect(pickEnemyLevel(2, () => 0.99)).toBe(4);
    expect(pickEnemyLevel(6, () => 0.99)).toBe(7);
    expect(pickEnemyLevel(2, () => 0)).toBe(1);
  });

  it("keeps generated mass inside the requested evolution stage", () => {
    const mass = massForLevel(4, () => 0.5);
    expect(levelForMass(mass)).toBe(4);
    expect(evolutionStageForMass(mass).texture).toBe("fish-tier-4");
  });

  it("grows and scores more for larger prey and combos", () => {
    expect(massAfterEating(28, 18)).toBeGreaterThan(28);
    expect(pointsForPrey(20, 4)).toBeGreaterThan(pointsForPrey(10, 0));
  });

  it("changes render scale only at evolution thresholds", () => {
    expect(scaleForMass(28)).toBe(scaleForMass(42.9));
    expect(scaleForMass(43)).toBeGreaterThan(scaleForMass(42.9));
    expect(stageProgressForMass(43)).toBe(0);
    expect(stageProgressForMass(10_000)).toBe(1);
    expect(difficultyForSeconds(999)).toBe(1);
  });
});
