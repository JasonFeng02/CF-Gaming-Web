import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";

const OceanGrowthPage = lazy(() =>
  import("../games/ocean-growth/OceanGrowthPage").then((module) => ({
    default: module.OceanGrowthPage,
  })),
);

export function App() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/games/ocean-growth"
          element={
            <Suspense fallback={<div className="route-loading" aria-label="游戏载入中" />}>
              <OceanGrowthPage />
            </Suspense>
          }
        />
        <Route path="/games" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
