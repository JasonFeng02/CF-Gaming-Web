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
import {
  CLASSIC_GOAL_MASS,
  EVOLUTION_STAGES,
  INITIAL_PLAYER_MASS,
  evolutionStageForMass,
} from "./core/rules";
import { createOceanGame } from "./game/createOceanGame";
import type {
  OceanGameController,
  OceanGameMode,
  OceanSnapshot,
} from "./game/types";

const initialStage = evolutionStageForMass(INITIAL_PLAYER_MASS);
const initialSnapshot: OceanSnapshot = {
  score: 0,
  mass: INITIAL_PLAYER_MASS,
  goalMass: CLASSIC_GOAL_MASS,
  level: initialStage.level,
  species: initialStage.name,
  stageProgress: 0,
  lives: 3,
  combo: 0,
  timeLeft: null,
  status: "running",
  deathCause: null,
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

  const isFinished = snapshot.status === "won" || snapshot.status === "gameover";
  const evolutionStages = mode === "rush" ? EVOLUTION_STAGES.slice(0, 5) : EVOLUTION_STAGES;
  const overallProgress = Math.min(
    100,
    ((snapshot.level - 1 + snapshot.stageProgress) / (evolutionStages.length - 1)) * 100,
  );
  const currentTexture = EVOLUTION_STAGES[snapshot.level - 1]?.texture ?? initialStage.texture;
  const resultTitle = snapshot.status === "won"
    ? "进化完成"
    : snapshot.deathCause === "mine"
      ? "误触海雷"
      : snapshot.deathCause === "timeout"
        ? "潮汐结束"
        : "被深海截停";

  return (
    <main className="game-page">
      <section
        ref={stageRef}
        className="game-stage"
        aria-label="深海进化游戏区域"
      >
        <div ref={canvasHostRef} className="game-canvas-host" />

        <div className="stage-meta">
          <Link to="/" className="stage-back-link" aria-label="返回游戏库" title="返回游戏库">
            <ArrowLeft aria-hidden="true" size={18} />
          </Link>
          <div>
            <span>OCEAN RUN</span>
            <strong>深海进化</strong>
          </div>
        </div>

        {hasStarted && (
          <div className="game-hud">
            <div className="hud-vitals" aria-live="polite">
              <img
                src={`/assets/ocean-growth/${currentTexture}.png`}
                alt=""
                aria-hidden="true"
              />
              <div className="hud-identity">
                <span>LV.{snapshot.level}</span>
                <strong>{snapshot.species}</strong>
              </div>
              <div className="hud-score">
                <span>得分</span>
                <strong>{snapshot.score.toLocaleString("zh-CN")}</strong>
              </div>
              <div className="hud-lives" aria-label={`剩余 ${snapshot.lives} 点生命`}>
                {Array.from({ length: mode === "rush" ? 2 : 3 }).map((_, index) => (
                  <Heart
                    key={index}
                    aria-hidden="true"
                    size={17}
                    fill={index < snapshot.lives ? "currentColor" : "none"}
                  />
                ))}
              </div>
              {snapshot.timeLeft !== null && (
                <div className="hud-time">
                  <span>剩余</span>
                  <strong>{snapshot.timeLeft}s</strong>
                </div>
              )}
            </div>

            <div className="evolution-hud" aria-label={`当前进化等级 ${snapshot.level}`}>
              <div className="evolution-rail" aria-hidden="true">
                <i>
                  <b style={{ width: `${overallProgress}%` }} />
                </i>
                {evolutionStages.map((stage) => (
                  <span
                    key={stage.level}
                    className={
                      stage.level < snapshot.level
                        ? "complete"
                        : stage.level === snapshot.level
                          ? "current"
                          : ""
                    }
                  >
                    <img src={`/assets/ocean-growth/${stage.texture}.png`} alt="" />
                  </span>
                ))}
              </div>
              <small>
                {snapshot.level >= evolutionStages.length
                  ? "终极形态"
                  : `下一形态 ${Math.round(snapshot.stageProgress * 100)}%`}
              </small>
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
            <div className="intro-fish-line" aria-hidden="true">
              {EVOLUTION_STAGES.slice(0, 4).map((stage) => (
                <img key={stage.level} src={`/assets/ocean-growth/${stage.texture}.png`} alt="" />
              ))}
            </div>
            <p className="overlay-kicker">OPEN WATER / EVOLVE</p>
            <h1>游向更深的海域</h1>
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
            <div className="encounter-legend" aria-label="鱼群关系标记">
              <span><i className="prey" />猎物</span>
              <span><i className="prey" />同阶可食</span>
              <span><i className="danger" />危险</span>
              <span><i className="mine" />海雷致命</span>
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
            <h2>{resultTitle}</h2>
            <img
              className="result-fish"
              src={`/assets/ocean-growth/${currentTexture}.png`}
              alt=""
              aria-hidden="true"
            />
            <strong>{snapshot.score.toLocaleString("zh-CN")}</strong>
            <span>LV.{snapshot.level} · {snapshot.species}</span>
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
