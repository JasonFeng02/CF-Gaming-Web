export type OceanGameMode = "classic" | "rush";
export type OceanGameStatus = "running" | "paused" | "won" | "gameover";
export type OceanDeathCause = "mine" | "predator" | "timeout" | null;

export interface OceanSnapshot {
  score: number;
  mass: number;
  goalMass: number;
  level: number;
  species: string;
  stageProgress: number;
  lives: number;
  combo: number;
  timeLeft: number | null;
  status: OceanGameStatus;
  deathCause: OceanDeathCause;
}

export interface OceanGameHooks {
  onReady: (snapshot: OceanSnapshot) => void;
  onSnapshot: (snapshot: OceanSnapshot) => void;
}

export interface OceanGameController {
  pause: () => void;
  resume: () => void;
  restart: () => void;
  destroy: () => void;
}
