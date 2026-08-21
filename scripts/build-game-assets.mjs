import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const assetDirectory = path.resolve("public/assets/ocean-growth");
const assets = [
  "fish-player",
  "fish-small",
  "fish-mid",
  "fish-danger",
  "fish-tier-1",
  "fish-tier-2",
  "fish-tier-3",
  "fish-tier-4",
  "fish-tier-5",
  "fish-tier-6",
  "fish-tier-7",
  "fish-tier-8",
  "fish-tier-9",
  "fish-tier-10",
  "fish-tier-11",
  "fish-tier-12",
  "fish-tier-13",
  "sea-mine",
  "bubble",
];

await mkdir(assetDirectory, { recursive: true });

await Promise.all(
  assets.map((name) => {
    const size = name === "bubble" ? { width: 40, height: 40 } : { width: 240, height: 130 };

    return sharp(path.join(assetDirectory, `${name}.svg`), { density: 192 })
      .resize(size.width, size.height, { fit: "fill" })
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(assetDirectory, `${name}.png`));
  }),
);

console.log(`Built ${assets.length} raster game assets.`);
