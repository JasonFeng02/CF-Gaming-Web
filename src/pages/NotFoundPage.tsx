import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="empty-state page-width">
      <p className="eyebrow">404</p>
      <h1>这条航线不存在</h1>
      <Link className="secondary-command" to="/">
        <ArrowLeft aria-hidden="true" size={18} />
        返回游戏库
      </Link>
    </main>
  );
}
