import { Gamepad2 } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { BrandMark } from "./BrandMark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="洋流街机首页">
          <BrandMark />
          <span>洋流街机</span>
        </Link>
        <nav className="site-nav" aria-label="主导航">
          <NavLink to="/" end>
            <Gamepad2 aria-hidden="true" size={18} strokeWidth={2.2} />
            游戏库
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
