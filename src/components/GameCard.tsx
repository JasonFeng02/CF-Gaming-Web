import { ArrowUpRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import type { GameDefinition } from "../games/types";

interface GameCardProps {
  game: GameDefinition;
}

export function GameCard({ game }: GameCardProps) {
  const body = (
    <>
      <div className="game-card-media">
        <img src={game.cover} alt="" />
        <span className={`game-status game-status-${game.status}`}>
          {game.status === "ready" ? "可游玩" : "制作中"}
        </span>
      </div>
      <div className="game-card-body">
        <div>
          <p className="game-card-kicker">{game.category}</p>
          <h3>{game.title}</h3>
        </div>
        {game.status === "ready" ? (
          <ArrowUpRight aria-hidden="true" size={22} />
        ) : (
          <Clock3 aria-hidden="true" size={20} />
        )}
      </div>
      <p className="game-card-description">{game.description}</p>
    </>
  );

  if (game.status === "ready" && game.href) {
    return (
      <Link className="game-card" to={game.href} aria-label={`打开${game.title}`}>
        {body}
      </Link>
    );
  }

  return <article className="game-card game-card-disabled">{body}</article>;
}
