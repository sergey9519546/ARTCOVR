import { Resvg } from "@resvg/resvg-js";
import { OutfitWordmarkPaths } from "../src/lib/outfit/paths";

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#f3ecd9"/>
  <g transform="translate(100, 200) scale(0.65)" fill="#122519">
    ${OutfitWordmarkPaths.map(d => `<path d="${d}"/>`).join("")}
  </g>
  <text x="100" y="560" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#122519" letter-spacing="2">++hellohello · Signature Collection · 2026</text>
  <circle cx="1080" cy="80" r="8" fill="#122519"/>
  <circle cx="1110" cy="80" r="8" fill="#122519"/>
</svg>`;

const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
const png = resvg.render().asPng();
await Bun.write("public/og-image.png", png);
console.log("OG image generated: public/og-image.png");
