export type GameStatus = "ready" | "soon";

export interface GameDefinition {
  slug: string;
  title: string;
  category: string;
  description: string;
  cover: string;
  href?: string;
  status: GameStatus;
  accent: string;
}
