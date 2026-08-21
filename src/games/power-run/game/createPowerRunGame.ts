import Phaser from "phaser";
import { POWER_RUN_SCENE_KEY, PowerRunScene } from "./PowerRunScene";
import type { PowerRunController, PowerRunHooks } from "./types";

export function createPowerRunGame(
  parent: HTMLElement,
  hooks: PowerRunHooks,
): PowerRunController {
  const scene = new PowerRunScene(hooks);
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
      height: Math.max(parent.clientHeight, 520),
    },
    scene: [scene],
  });

  const getScene = () => game.scene.getScene(POWER_RUN_SCENE_KEY) as PowerRunScene;

  return {
    pause: () => getScene().pauseByUser(),
    resume: () => getScene().resumeByUser(),
    restart: () => getScene().scene.restart(),
    destroy: () => game.destroy(true),
  };
}
