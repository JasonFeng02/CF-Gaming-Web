import Phaser from "phaser";
import { OceanScene, OCEAN_SCENE_KEY } from "./OceanScene";
import type {
  OceanGameController,
  OceanGameHooks,
  OceanGameMode,
} from "./types";

export function createOceanGame(
  parent: HTMLElement,
  mode: OceanGameMode,
  hooks: OceanGameHooks,
): OceanGameController {
  const scene = new OceanScene(mode, hooks);
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    transparent: true,
    render: {
      antialias: true,
      powerPreference: "high-performance",
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: Math.max(parent.clientWidth, 320),
      height: Math.max(parent.clientHeight, 420),
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [scene],
  });

  const getScene = () => game.scene.getScene(OCEAN_SCENE_KEY) as OceanScene;

  return {
    pause: () => getScene().pauseByUser(),
    resume: () => getScene().resumeByUser(),
    restart: () => getScene().scene.restart(),
    destroy: () => game.destroy(true),
  };
}
