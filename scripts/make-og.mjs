import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#0d0d0d" opacity="0.15"/>
    </pattern>
  </defs>

  <!-- background -->
  <rect width="1200" height="630" fill="#faf6ed"/>
  <rect width="1200" height="630" fill="url(#dots)"/>

  <!-- magenta corner blob -->
  <circle cx="1100" cy="-50" r="280" fill="#ff2d6f"/>

  <!-- yellow tape (top left) -->
  <g transform="translate(80,40) rotate(-3)">
    <rect width="180" height="36" fill="#ffe14a" stroke="#0d0d0d" stroke-width="3"/>
    <rect width="180" height="36" fill="none" stroke="#0d0d0d" stroke-width="3" transform="translate(6,6)" opacity="0"/>
    <text x="90" y="25" font-family="'Space Mono', monospace" font-size="13" font-weight="700" text-anchor="middle" letter-spacing="2.3">EST. MMXXVI</text>
  </g>

  <!-- shadow under tape -->
  <rect x="86" y="46" width="180" height="36" fill="#0d0d0d" transform="rotate(-3 176 64)" opacity="0"/>

  <!-- main title NFT -->
  <text x="80" y="260" font-family="'Archivo Black', sans-serif" font-size="180" font-weight="900" fill="#0d0d0d" letter-spacing="-4">NFT</text>

  <!-- GALLERIA italic -->
  <text x="80" y="410" font-family="'Archivo Black', sans-serif" font-size="180" font-weight="900" fill="#0d0d0d" font-style="italic" letter-spacing="-4">
    GALLE<tspan fill="#ff2d6f">R</tspan>IA
  </text>

  <!-- subtitle -->
  <g transform="translate(80,470)">
    <text font-family="'Space Mono', monospace" font-size="22" font-weight="700" fill="#0d0d0d" letter-spacing="4">CURATED ART GALLERY · ON-CHAIN</text>
  </g>

  <!-- chain chips bottom -->
  <g transform="translate(80,540)">
    <!-- ETH -->
    <rect x="0" y="0" width="160" height="40" fill="#ffe14a" stroke="#0d0d0d" stroke-width="3"/>
    <text x="80" y="27" font-family="'Space Mono', monospace" font-size="14" font-weight="700" fill="#0d0d0d" text-anchor="middle" letter-spacing="3">◆ ETHEREUM</text>
    <!-- SOL -->
    <rect x="180" y="0" width="140" height="40" fill="#ff2d6f" stroke="#0d0d0d" stroke-width="3"/>
    <text x="250" y="27" font-family="'Space Mono', monospace" font-size="14" font-weight="700" fill="#faf6ed" text-anchor="middle" letter-spacing="3">◆ SOLANA</text>
    <!-- APE -->
    <rect x="340" y="0" width="160" height="40" fill="#00d6a3" stroke="#0d0d0d" stroke-width="3"/>
    <text x="420" y="27" font-family="'Space Mono', monospace" font-size="14" font-weight="700" fill="#0d0d0d" text-anchor="middle" letter-spacing="3">◆ APECHAIN</text>
  </g>

  <!-- right side stamp -->
  <g transform="translate(1060,470) rotate(-12)">
    <circle r="80" fill="#0d0d0d"/>
    <text y="-15" font-family="'Space Mono', monospace" font-size="16" font-weight="700" fill="#faf6ed" text-anchor="middle" letter-spacing="2">ON</text>
    <text y="8" font-family="'Space Mono', monospace" font-size="16" font-weight="700" fill="#faf6ed" text-anchor="middle" letter-spacing="2">VIEW</text>
    <text y="31" font-family="'Space Mono', monospace" font-size="16" font-weight="700" fill="#faf6ed" text-anchor="middle" letter-spacing="2">NOW</text>
  </g>

  <!-- saints credit -->
  <text x="1140" y="605" font-family="'Space Mono', monospace" font-size="12" font-weight="700" fill="#0d0d0d" text-anchor="end" letter-spacing="3" opacity="0.55">— A SAINTS OF LA JOINT —</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: "DejaVu Sans",
  },
});
const png = resvg.render().asPng();
writeFileSync("/home/saintsola13/NFTGalleria/public/og.png", png);
console.log("✓ og.png written:", png.length, "bytes");
