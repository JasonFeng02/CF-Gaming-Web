import type { GameDefinition } from "./types";

export const games: GameDefinition[] = [
  {
    slug: "power-run",
    title: "战力突围",
    category: "跑酷 · 数值",
    description: "穿越五大战区，在数字门、补给与伏击之间壮大小队，挑战钢铁统帅。",
    cover: "/assets/power-run/power-run-preview.svg",
    href: "/games/power-run",
    status: "ready",
    accent: "#ffd447",
  },
  {
    slug: "ocean-growth",
    title: "深海进化",
    category: "生存 · 成长",
    description: "穿过鱼群，吞食更小的目标，在深海追猎者包围前完成进化。",
    cover: "/assets/ocean-growth/ocean-preview.svg",
    href: "/games/ocean-growth",
    status: "ready",
    accent: "#d9f45c",
  },
  {
    slug: "orbit-drift",
    title: "轨道漂移",
    category: "反应 · 闪避",
    description: "控制卫星切换轨道，在越来越密集的碎片带中保持航行。",
    cover: "/assets/covers/orbit-drift.svg",
    status: "soon",
    accent: "#ff765e",
  },
  {
    slug: "block-counter",
    title: "砖阵反击",
    category: "策略 · 弹射",
    description: "调整一次角度，打出连续反弹，用有限回合拆解整片砖阵。",
    cover: "/assets/covers/block-counter.svg",
    status: "soon",
    accent: "#71d7c3",
  },
];

export const featuredGame = games[0];
