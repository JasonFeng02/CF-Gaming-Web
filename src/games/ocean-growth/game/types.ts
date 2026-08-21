export type OceanGameMode = "classic" | "rush";
export type OceanGameStatus = "running" | "paused" | "won" | "gameover";

export interface OceanSnapshot {
  score: number;
  mass: number;
  goalMass: number;
  lives: number;
  combo: number;
  timeLeft: number | null;
  status: OceanGameStatus;
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
