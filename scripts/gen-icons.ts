import { Resvg } from "@resvg/resvg-js";

function makeIcon(size: number, file: string) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#122519"/>
    <g transform="translate(${size*0.15}, ${size*0.4}) scale(${size/200})" fill="#f3ecd9">
      <rect x="0" y="0" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="32" y="0" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="64" y="0" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="16" y="32" width="24" height="24" rx="2" fill="#f3ecd9"/>
      <rect x="48" y="32" width="24" height="24" rx="2" fill="#f3ecd9"/>
    </g>
  </svg>`;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  Bun.write(file, resvg.render().asPng());
  console.log(`Generated ${file}`);
}

makeIcon(180, "public/apple-touch-icon.png");
makeIcon(192, "public/icon-192.png");
makeIcon(512, "public/icon-512.png");
