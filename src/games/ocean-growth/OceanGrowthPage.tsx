import {
  ArrowLeft,
  Expand,
  Heart,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { INITIAL_PLAYER_MASS } from "./core/rules";
import { createOceanGame } from "./game/createOceanGame";
import type {
  OceanGameController,
  OceanGameMode,
  OceanSnapshot,
} from "./game/types";

const initialSnapshot: OceanSnapshot = {
  score: 0,
  mass: INITIAL_PLAYER_MASS,
  goalMass: 105,
  lives: 3,
  combo: 0,
  timeLeft: null,
  status: "running",
};

export function OceanGrowthPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<OceanGameController | null>(null);
  const [mode, setMode] = useState<OceanGameMode>("classic");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [hasStarted, setHasStarted] = useState(false);

  const startGame = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    controllerRef.current?.destroy();
    host.replaceChildren();
    controllerRef.current = createOceanGame(host, mode, {
      onReady: setSnapshot,
      onSnapshot: setSnapshot,
    });
    setHasStarted(true);
  }, [mode]);

  const togglePause = () => {
    if (snapshot.status === "paused") {
      controllerRef.current?.resume();
    } else {
      controllerRef.current?.pause();
    }
  };

  const restartGame = () => {
    controllerRef.current?.restart();
  };

  const enterFullscreen = async () => {
    if (!stageRef.current || document.fullscreenElement) return;
    await stageRef.current.requestFullscreen();
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && snapshot.status === "running") {
        controllerRef.current?.pause();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [snapshot.status]);

  useEffect(
    () => () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    },
    [],
  );

  const progress = Math.min(100, (snapshot.mass / snapshot.goalMass) * 100);
  const isFinished = snapshot.status === "won" || snapshot.status === "gameover";

  return (
    <main className="game-page">
      <div className="game-page-heading page-width">
        <Link to="/" className="back-link">
          <ArrowLeft aria-hidden="true" size={17} />
          游戏库
        </Link>
        <div>
          <p className="eyebrow">SURVIVAL / 01</p>
          <h1>深海进化</h1>
        </div>
      </div>

      <section
        ref={stageRef}
        className="game-stage"
        aria-label="深海进化游戏区域"
      >
        <div ref={canvasHostRef} className="game-canvas-host" />

        {hasStarted && (
          <div className="game-hud">
            <div className="hud-stats" aria-live="polite">
              <div className="hud-stat">
                <span>得分</span>
                <strong>{snapshot.score.toLocaleString("zh-CN")}</strong>
              </div>
              <div className="hud-stat hud-growth">
                <span>进化</span>
                <strong>{Math.round(progress)}%</strong>
                <i aria-hidden="true">
                  <b style={{ width: `${progress}%` }} />
                </i>
              </div>
              <div className="hud-lives" aria-label={`剩余 ${snapshot.lives} 点生命`}>
                {Array.from({ length: mode === "rush" ? 2 : 3 }).map((_, index) => (
                  <Heart
                    key={index}
                    aria-hidden="true"
                    size={18}
                    fill={index < snapshot.lives ? "currentColor" : "none"}
                  />
                ))}
              </div>
              {snapshot.timeLeft !== null && (
                <div className="hud-stat hud-time">
                  <span>剩余</span>
                  <strong>{snapshot.timeLeft}s</strong>
                </div>
              )}
            </div>

            <div className="hud-actions">
              <button
                type="button"
                className="icon-command"
                onClick={togglePause}
                aria-label={snapshot.status === "paused" ? "继续" : "暂停"}
                title={snapshot.status === "paused" ? "继续" : "暂停"}
                disabled={isFinished}
              >
                {snapshot.status === "paused" ? <Play size={19} /> : <Pause size={19} />}
              </button>
              <button
                type="button"
                className="icon-command"
                onClick={enterFullscreen}
                aria-label="全屏"
                title="全屏"
              >
                <Expand size={19} />
              </button>
            </div>
          </div>
        )}

        {snapshot.combo >= 2 && !isFinished && (
          <div className="combo-badge" aria-live="polite">
            {snapshot.combo} 连吞
          </div>
        )}

        {!hasStarted && (
          <div className="game-overlay game-intro-overlay">
            <p className="overlay-kicker">OCEAN RUN</p>
            <h2>从浅海游向食物链顶端</h2>
            <div className="mode-control" aria-label="游戏模式">
              <button
                type="button"
                className={mode === "classic" ? "active" : ""}
                onClick={() => setMode("classic")}
              >
                经典
              </button>
              <button
                type="button"
                className={mode === "rush" ? "active" : ""}
                onClick={() => setMode("rush")}
              >
                极速
              </button>
            </div>
            <button type="button" className="game-start-command" onClick={startGame}>
              <Play aria-hidden="true" size={19} fill="currentColor" />
              开始潜游
            </button>
          </div>
        )}

        {snapshot.status === "paused" && hasStarted && (
          <div className="game-overlay">
            <p className="overlay-kicker">PAUSED</p>
            <h2>航行暂停</h2>
            <button
              type="button"
              className="game-start-command"
              onClick={() => controllerRef.current?.resume()}
            >
              <Play aria-hidden="true" size={19} fill="currentColor" />
              继续
            </button>
          </div>
        )}

        {isFinished && hasStarted && (
          <div className="game-overlay result-overlay">
            <p className="overlay-kicker">
              {snapshot.status === "won" ? "EVOLUTION COMPLETE" : "RUN ENDED"}
            </p>
            <h2>{snapshot.status === "won" ? "进化完成" : "被深海截停"}</h2>
            <strong>{snapshot.score.toLocaleString("zh-CN")}</strong>
            <span>本轮得分</span>
            <button type="button" className="game-start-command" onClick={restartGame}>
              <RotateCcw aria-hidden="true" size={18} />
              再来一局
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
