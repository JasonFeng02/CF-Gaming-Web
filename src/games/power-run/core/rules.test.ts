import { describe, expect, it } from "vitest";
import {
  BOSS_POWER,
  CHAPTERS,
  COURSE,
  GATE_PAIRS,
  INITIAL_SQUAD_POWER,
  MAX_SQUAD_POWER,
  POWER_RUN_DURATION_SECONDS,
  applyGate,
  applySupply,
  bestGateForPower,
  canDefeatBoss,
  resolveBattle,
  resolveHazard,
  scoreForBattle,
  scoreForGate,
} from "./rules";

describe("power run rules", () => {
  it("applies every gate operator and clamps the squad", () => {
    expect(applyGate(12, { operator: "add", value: 8, label: "+8" })).toBe(20);
    expect(applyGate(12, { operator: "subtract", value: 20, label: "−20" })).toBe(1);
    expect(applyGate(12, { operator: "multiply", value: 2, label: "×2" })).toBe(24);
    expect(applyGate(13, { operator: "divide", value: 2, label: "÷2" })).toBe(6);
    expect(applyGate(8_000, { operator: "multiply", value: 2, label: "×2" })).toBe(
      MAX_SQUAD_POWER,
    );
  });

  it("authors a five-zone winning run longer than five minutes", () => {
    expect(POWER_RUN_DURATION_SECONDS).toBeGreaterThanOrEqual(300);
    expect(CHAPTERS).toHaveLength(5);
    expect(COURSE.filter((item) => item.kind === "gate")).toHaveLength(20);
    expect(COURSE.filter((item) => item.kind === "wave")).toHaveLength(10);
    expect(COURSE.filter((item) => item.kind === "hazard")).toHaveLength(10);
    expect(COURSE.filter((item) => item.kind === "supply")).toHaveLength(5);
    expect(COURSE.filter((item) => item.kind === "boss")).toHaveLength(5);
  });

  it("keeps the authored best route winnable through the final boss", () => {
    let power = INITIAL_SQUAD_POWER;
    let armor = 0;

    for (const item of COURSE) {
      if (item.kind === "gate") {
        power = applyGate(power, bestGateForPower(power, GATE_PAIRS[item.pairIndex]));
      } else if (item.kind === "supply") {
        power = applySupply(power, item.power);
        armor = Math.min(3, armor + item.armor);
      } else if (item.kind === "wave") {
        const result = resolveBattle(power, item.power);
        expect(result.won).toBe(true);
        power = result.remainingPower;
      } else if (item.kind === "boss") {
        if (item.final) {
          expect(canDefeatBoss(power, item.power)).toBe(true);
        } else {
          const result = resolveBattle(power, item.power);
          expect(result.won).toBe(true);
          power = applySupply(result.remainingPower, item.reward);
        }
      }
    }

    expect(power).toBeGreaterThan(BOSS_POWER);
    expect(armor).toBe(3);
  });

  it("uses armor before power when a hazard is hit", () => {
    expect(resolveHazard(100, 1, 60)).toEqual({
      survived: true,
      remainingPower: 100,
      remainingArmor: 0,
      absorbed: true,
    });
    expect(resolveHazard(100, 0, 60)).toEqual({
      survived: true,
      remainingPower: 40,
      remainingArmor: 0,
      absorbed: false,
    });
    expect(resolveHazard(50, 0, 60).survived).toBe(false);
  });

  it("requires strictly more power for waves and exact power for the final boss", () => {
    expect(resolveBattle(30, 12)).toEqual({ won: true, remainingPower: 18 });
    expect(resolveBattle(12, 12)).toEqual({ won: false, remainingPower: 0 });
    expect(canDefeatBoss(BOSS_POWER)).toBe(true);
    expect(canDefeatBoss(BOSS_POWER - 1)).toBe(false);
  });

  it("rewards growth, combos and defeated enemies", () => {
    expect(scoreForGate(12, 24, 0)).toBeGreaterThan(scoreForGate(12, 6, 0));
    expect(scoreForGate(12, 24, 4)).toBeGreaterThan(scoreForGate(12, 24, 0));
    expect(scoreForBattle(22)).toBe(550);
  });
});
