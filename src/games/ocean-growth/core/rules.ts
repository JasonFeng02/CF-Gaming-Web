export const INITIAL_PLAYER_MASS = 25;
export const CLASSIC_GOAL_MASS = 105;
export const RUSH_GOAL_MASS = 82;

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const scaleForMass = (mass: number) =>
  clamp(0.36 + Math.sqrt(mass) / 18, 0.48, 1.55);

export const canEat = (playerMass: number, targetMass: number) =>
  targetMass <= playerMass * 0.86;

export const isDangerous = (playerMass: number, targetMass: number) =>
  targetMass >= playerMass * 1.14;

export const pointsForPrey = (targetMass: number, combo: number) =>
  Math.round(targetMass * 7 * (1 + Math.min(combo, 8) * 0.08));

export const massAfterEating = (playerMass: number, targetMass: number) =>
  playerMass + Math.max(1.4, targetMass * 0.2);

export const difficultyForSeconds = (seconds: number) =>
  clamp(seconds / 150, 0, 1);

export const pickEnemyMass = (
  playerMass: number,
  random: () => number = Math.random,
) => {
  const roll = random();
  let ratio: number;

  if (roll < 0.58) {
    ratio = 0.36 + random() * 0.45;
  } else if (roll < 0.78) {
    ratio = 0.9 + random() * 0.18;
  } else {
    ratio = 1.2 + random() * 0.72;
  }

  return clamp(playerMass * ratio, 8, 185);
};
