import {
  ArrowLeft,
  Expand,
  Flag,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Swords,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BOSS_POWER,
  GATE_PAIRS,
  INITIAL_SQUAD_POWER,
} from "./core/rules";
import { createPowerRunGame } from "./game/createPowerRunGame";
import type {
  PowerRunController,
  PowerRunSnapshot,
} from "./game/types";

const initialSnapshot: PowerRunSnapshot = {
  power: INITIAL_SQUAD_POWER,
  bossPower: BOSS_POWER,
  armor: 0,
  combo: 0,
  score: 0,
  progress: 0,
  elapsedSeconds: 0,
  timeLeft: 319,
  chapterIndex: 0,
  chapterName: "海岸前线",
  gatesPassed: 0,
  totalGates: GATE_PAIRS.length,
  enemiesDefeated: 0,
  lastEvent: null,
  status: "running",
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, Math.floor(seconds % 60));
  return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
};

export function PowerRunPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PowerRunController | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [hasStarted, setHasStarted] = useState(false);

  const startGame = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    controllerRef.current?.destroy();
    host.replaceChildren();
    controllerRef.current = createPowerRunGame(host, {
      onReady: setSnapshot,
      onSnapshot: setSnapshot,
    });
    setHasStarted(true);
  }, []);

  const togglePause = () => {
    if (snapshot.status === "paused") {
      controllerRef.current?.resume();
    } else {
      controllerRef.current?.pause();
    }
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

  return (
    <main className="game-page power-run-page">
      <section
        ref={stageRef}
        className="game-stage power-run-stage"
        aria-label="战力突围游戏区域"
      >
        <div ref={canvasHostRef} className="game-canvas-host power-run-canvas-host" />

        <div className="stage-meta power-run-meta">
          <Link to="/" className="stage-back-link" aria-label="返回游戏库" title="返回游戏库">
            <ArrowLeft aria-hidden="true" size={18} />
          </Link>
          <div>
            <span>POWER RUN / 01</span>
            <strong>战力突围</strong>
          </div>
        </div>

        {hasStarted && (
          <div className="power-run-hud">
            <div className="power-counter" aria-live="polite">
              <Shield aria-hidden="true" size={22} fill="currentColor" />
              <div>
                <span>小队战力</span>
                <strong>{snapshot.power}</strong>
                <div className="power-armor" aria-label={"护盾 " + snapshot.armor}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <i key={index} className={index < snapshot.armor ? "active" : ""} />
                  ))}
                </div>
              </div>
            </div>

            <div
              className="run-progress"
              aria-label={"关卡进度 " + Math.round(snapshot.progress * 100) + "%"}
            >
              <div className="run-progress-labels">
                <span>{snapshot.chapterIndex + 1} / 5 · {snapshot.chapterName}</span>
                <strong>{formatTime(snapshot.timeLeft)}</strong>
                <span>{snapshot.gatesPassed} / {snapshot.totalGates} 门</span>
              </div>
              <i aria-hidden="true">
                <b style={{ width: String(snapshot.progress * 100) + "%" }} />
                <Flag size={15} />
              </i>
            </div>

            <div className="hud-actions power-run-actions">
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

        {hasStarted && snapshot.lastEvent && !isFinished && (
          <div className="power-event" aria-live="polite">
            {snapshot.lastEvent}
          </div>
        )}

        {hasStarted && snapshot.combo >= 3 && !isFinished && (
          <div className="power-combo" aria-live="polite">
            连续增益 ×{snapshot.combo}
          </div>
        )}

        {!hasStarted && (
          <div className="game-overlay power-run-intro">
            <div className="intro-squad" aria-hidden="true">
              <img src="/assets/power-run/scout.svg" alt="" />
              <img src="/assets/power-run/soldier.svg" alt="" />
              <img src="/assets/power-run/heavy.svg" alt="" />
              <img src="/assets/power-run/medic.svg" alt="" />
              <img src="/assets/power-run/mech.svg" alt="" />
            </div>
            <p className="overlay-kicker">5 战区 · 05:19</p>
            <h1>战力突围</h1>
            <div className="gate-formula" aria-hidden="true">
              <span>+950</span>
              <span>×2</span>
              <i>12 → 5000+</i>
            </div>
            <button
              type="button"
              className="game-start-command power-start-command"
              onClick={startGame}
            >
              <Play aria-hidden="true" size={19} fill="currentColor" />
              开始突围
            </button>
          </div>
        )}

        {snapshot.status === "paused" && hasStarted && (
          <div className="game-overlay power-run-pause">
            <p className="overlay-kicker">PAUSED</p>
            <h2>行动暂停</h2>
            <button
              type="button"
              className="game-start-command power-start-command"
              onClick={() => controllerRef.current?.resume()}
            >
              <Play aria-hidden="true" size={19} fill="currentColor" />
              继续
            </button>
          </div>
        )}

        {isFinished && hasStarted && (
          <div className={"game-overlay power-result " + snapshot.status}>
            <div className="result-emblem" aria-hidden="true">
              {snapshot.status === "won" ? <Flag size={34} /> : <Swords size={34} />}
            </div>
            <p className="overlay-kicker">
              {snapshot.status === "won" ? "MISSION COMPLETE" : "SQUAD LOST"}
            </p>
            <h2>{snapshot.status === "won" ? "战线突破" : "小队覆没"}</h2>
            <div className="result-versus">
              <span>
                <small>小队</small>
                <strong>{snapshot.power}</strong>
              </span>
              <i>VS</i>
              <span>
                <small>首领</small>
                <strong>{snapshot.bossPower}</strong>
              </span>
            </div>
            <p className="result-score">
              得分 {snapshot.score.toLocaleString("zh-CN")} · 击破 {snapshot.enemiesDefeated}
              {" · "}{formatTime(snapshot.elapsedSeconds)}
            </p>
            <button
              type="button"
              className="game-start-command power-start-command"
              onClick={() => controllerRef.current?.restart()}
            >
              <RotateCcw aria-hidden="true" size={18} />
              再来一局
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
