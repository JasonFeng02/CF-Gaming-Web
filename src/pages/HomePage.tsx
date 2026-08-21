import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { GameCard } from "../components/GameCard";
import { featuredGame, games } from "../games/registry";

export function HomePage() {
  return (
    <main>
      <section className="library-intro page-width">
        <p className="eyebrow">BROWSER ARCADE / 01</p>
        <h1>洋流街机</h1>
        <p>轻量、即开即玩的网页小游戏集合。</p>
      </section>

      <section className="featured-game" aria-labelledby="featured-title">
        <img src={featuredGame.cover} alt="深海中的鱼群与珊瑚" />
        <div className="featured-shade" />
        <div className="featured-content page-width">
          <p className="featured-label">
            <Sparkles aria-hidden="true" size={17} />
            本期游戏
          </p>
          <h2 id="featured-title">{featuredGame.title}</h2>
          <p>{featuredGame.description}</p>
          <Link className="primary-command" to={featuredGame.href!}>
            立即开玩
            <ArrowRight aria-hidden="true" size={19} />
          </Link>
        </div>
      </section>

      <section className="game-library page-width" aria-labelledby="library-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GAME INDEX</p>
            <h2 id="library-title">游戏库</h2>
          </div>
          <span>{games.filter((game) => game.status === "ready").length} 款可游玩</span>
        </div>
        <div className="game-grid">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </section>
    </main>
  );
}
