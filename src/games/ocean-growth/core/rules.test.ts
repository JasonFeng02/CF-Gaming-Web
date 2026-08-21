import { describe, expect, it } from "vitest";
import {
  canEat,
  difficultyForSeconds,
  isDangerous,
  massAfterEating,
  pickEnemyMass,
  pointsForPrey,
  scaleForMass,
} from "./rules";

describe("ocean growth rules", () => {
  it("keeps a neutral size band between prey and predators", () => {
    expect(canEat(100, 86)).toBe(true);
    expect(canEat(100, 87)).toBe(false);
    expect(isDangerous(100, 113)).toBe(false);
    expect(isDangerous(100, 114)).toBe(true);
  });

  it("grows and scores more for larger prey and combos", () => {
    expect(massAfterEating(25, 10)).toBeGreaterThan(25);
    expect(pointsForPrey(20, 4)).toBeGreaterThan(pointsForPrey(10, 0));
  });

  it("caps render scale and difficulty", () => {
    expect(scaleForMass(1)).toBe(0.48);
    expect(scaleForMass(10000)).toBe(1.55);
    expect(difficultyForSeconds(999)).toBe(1);
  });

  it("can deterministically generate prey, neutral fish, and predators", () => {
    const values = [0.1, 0, 0.65, 0.5, 0.95, 1];
    let index = 0;
    const random = () => values[index++] ?? 0;

    expect(pickEnemyMass(100, random)).toBe(36);
    expect(pickEnemyMass(100, random)).toBe(99);
    expect(pickEnemyMass(100, random)).toBe(185);
  });
});
