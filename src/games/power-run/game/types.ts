export type PowerRunStatus = "running" | "paused" | "won" | "gameover";

export interface PowerRunSnapshot {
  power: number;
  bossPower: number;
  armor: number;
  combo: number;
  score: number;
  progress: number;
  elapsedSeconds: number;
  timeLeft: number;
  chapterIndex: number;
  chapterName: string;
  gatesPassed: number;
  totalGates: number;
  enemiesDefeated: number;
  lastEvent: string | null;
  status: PowerRunStatus;
}

export interface PowerRunHooks {
  onReady: (snapshot: PowerRunSnapshot) => void;
  onSnapshot: (snapshot: PowerRunSnapshot) => void;
}

export interface PowerRunController {
  pause: () => void;
  resume: () => void;
  restart: () => void;
  destroy: () => void;
}
