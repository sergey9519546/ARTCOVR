/**
 * Renders every site icon from one inline SVG, so they cannot drift apart.
 *
 * This script imports @resvg/resvg-js, which was never declared in package.json
 * — `bun run gen-icons` failed with "Cannot find module" and so the icons could
 * not be regenerated. That is also why public/favicon.ico was missing entirely
 * and every page load 404'd on it. The dependency is now a devDependency and
 * favicon.ico is generated here alongside the rest.
 *
 *   bun run gen-icons
 */
import { Resvg } from "@resvg/resvg-js";

/** The mark: five tiles on the deep-green ground, in the cream foreground. */
function markSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#122519"/>
    <g transform="translate(${size * 0.15}, ${size * 0.4}) scale(${size / 200})" fill="#f3ecd9">
      <rect x="0" y="0" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="32" y="0" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="64" y="0" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="16" y="32" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="48" y="32" width="24" height="24" rx="2" fill="#f3ecd9"/>
    </g>
  </svg>`;
}

function renderPng(size: number): Buffer {
  const resvg = new Resvg(markSvg(size), { fitTo: { mode: "width", value: size } });
  return resvg.render().asPng();
}

function makeIcon(size: number, file: string) {
  Bun.write(file, renderPng(size));
  console.log(`Generated ${file}`);
}

/**
 * Packs PNGs into a multi-resolution .ico. The ICO container permits a raw PNG
 * payload per entry, which every browser in support has accepted for years and
 * keeps the file small. A dimension of 256 or more is encoded as 0 by the spec;
 * nothing here reaches that, but the clamp keeps the writer honest.
 */
function makeFavicon(sizes: number[], file: string) {
  const images = sizes.map((size) => ({ size, png: renderPng(size) }));
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;
  const entries: Buffer[] = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(ENTRY);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size (0 = truecolour)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  Bun.write(file, Buffer.concat([header, ...entries, ...images.map((i) => i.png)]));
  console.log(`Generated ${file} (${images.map((i) => `${i.size}x${i.size}`).join(", ")})`);
}

// Browsers request /favicon.ico unprompted; without it every page load 404s.
// Nothing else in the repository writes this file, so it is always safe to
// regenerate.
makeFavicon([16, 32, 48], "public/favicon.ico");

// ---------------------------------------------------------------------------
// The three PNG icons are DELIBERATELY behind a flag.
//
// scripts/catalog/Prepare-DisplayAssets.ps1 also writes apple-touch-icon.png,
// icon-192.png and icon-512.png — but it scales them from the featured artwork,
// not from the mark above. The icons currently committed are that artwork
// version (245 KB photographic; the mark renders to 4 KB flat vector). Running
// this script unflagged used to mean silently replacing branded artwork icons
// with an abstract placeholder, which is why it must be asked for explicitly.
//
// Settle which generator owns these files before using this flag.
//   bun run gen-icons -- --with-png-icons
// ---------------------------------------------------------------------------
if (process.argv.includes("--with-png-icons")) {
  console.warn("Overwriting the artwork-derived PNG icons with the vector mark.");
  makeIcon(180, "public/apple-touch-icon.png");
  makeIcon(192, "public/icon-192.png");
  makeIcon(512, "public/icon-512.png");
} else {
  console.log(
    "Skipped apple-touch-icon.png / icon-192.png / icon-512.png — owned by " +
      "Prepare-DisplayAssets.ps1 (artwork-derived). Pass --with-png-icons to override.",
  );
}
