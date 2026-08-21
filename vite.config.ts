import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    sourcemap: true,
    // Phaser is route-split and only loaded after a player opens a game.
    chunkSizeWarningLimit: 1_300,
  },
});
