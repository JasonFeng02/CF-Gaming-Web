import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const assetDirectory = path.resolve("public/assets/ocean-growth");
const assets = [
  "fish-player",
  "fish-small",
  "fish-mid",
  "fish-danger",
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
