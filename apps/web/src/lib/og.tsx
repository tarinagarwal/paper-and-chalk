import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { logoMarkSvg, svgDataUri } from "./brand-svg";

export const ogSize = { width: 1200, height: 630 };
export const ogAlt =
  "Paper & Chalk: paper for notes, chalk for ideas. PDFs, notebooks and infinite whiteboards in one realtime document.";

const font = (file: string) => readFile(join(process.cwd(), "src/assets/fonts", file));

const DOTS = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="1.4" fill="#d3ccbd"/></svg>',
);

/** Paper page resting on a chalkboard, with a red-pencil circle and a sticky. */
const SCENE = svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 420">
  <defs><pattern id="d" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1" fill="#2c2e33"/></pattern>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#1c1b19" flood-opacity="0.22"/></filter></defs>
  <rect x="120" y="70" width="310" height="330" rx="18" fill="#1d1e21"/><rect x="120" y="70" width="310" height="330" rx="18" fill="url(#d)"/>
  <rect x="250" y="110" width="96" height="38" rx="9" fill="none" stroke="#ece7dc" stroke-width="2"/>
  <rect x="250" y="190" width="120" height="104" fill="#f5e6a3" transform="rotate(-3 310 242)"/>
  <g filter="url(#sh)"><rect x="10" y="20" width="250" height="330" rx="3" fill="#ffffff"/></g>
  <rect x="36" y="50" width="120" height="9" rx="2" fill="#8f897e"/>
  <rect x="30" y="86" width="214" height="16" rx="2" fill="rgba(232,183,48,0.45)"/>
  ${[92, 110, 128, 146].map((y, i) => `<rect x="36" y="${y}" width="${[200, 190, 204, 150][i]}" height="5" rx="2.5" fill="#ddd8ce"/>`).join("")}
  <rect x="36.5" y="170.5" width="199" height="90" rx="2" fill="none" stroke="#ddd8ce"/>
  ${[
    [52, 24],
    [90, 40],
    [128, 34],
    [166, 62],
    [204, 46],
  ]
    .map(
      ([x, h]) =>
        `<rect x="${x}" y="${250 - (h ?? 0)}" width="24" height="${h}" fill="${x === 166 ? "#8f897e" : "#ddd8ce"}"/>`,
    )
    .join("")}
  ${[282, 300, 318].map((y) => `<rect x="36" y="${y}" width="${y === 318 ? 120 : 200}" height="5" rx="2.5" fill="#ddd8ce"/>`).join("")}
  <path d="M 206 196 C 204 168, 150 166, 148 198 C 146 232, 206 238, 210 210 C 212 196, 200 186, 184 184" fill="none" stroke="#c43e18" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M 212 214 C 236 220, 250 232, 262 240" fill="none" stroke="#1c1b19" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M 262 240 C 272 246, 280 252, 290 262" fill="none" stroke="#ece7dc" stroke-width="2.6" stroke-linecap="round"/>
</svg>`);

export async function renderOgImage() {
  const [serif, serifItalic, sans, mono] = await Promise.all([
    font("newsreader-regular.ttf"),
    font("newsreader-italic.ttf"),
    font("geist-medium.ttf"),
    font("geist-mono-regular.ttf"),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f3f0e8",
        backgroundImage: `url(${DOTS})`,
        padding: "64px 72px",
        color: "#1c1b19",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={svgDataUri(logoMarkSvg())} width={52} height={52} alt="" />
          <div style={{ display: "flex", fontFamily: "Newsreader", fontSize: 38 }}>
            Paper&nbsp;<span style={{ fontStyle: "italic", color: "#c43e18" }}>&amp;</span>
            &nbsp;Chalk
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 70,
            fontFamily: "Newsreader",
            fontSize: 88,
            lineHeight: 1,
            letterSpacing: "-0.025em",
          }}
        >
          <span>Paper for notes,</span>
          <span style={{ fontStyle: "italic", marginTop: 10 }}>chalk for ideas.</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontFamily: "Geist",
            fontSize: 27,
            lineHeight: 1.4,
            color: "#46423b",
            maxWidth: 600,
          }}
        >
          PDFs, notebooks and infinite whiteboards in one realtime document.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontFamily: "Geist Mono",
            fontSize: 18,
            letterSpacing: "0.08em",
            color: "#6b665e",
          }}
        >
          INK · PDF MARKUP · WORKS OFFLINE
        </div>
      </div>
      <img src={SCENE} width={440} height={420} alt="" style={{ marginTop: 40 }} />
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Newsreader", data: serif, style: "normal", weight: 400 },
        { name: "Newsreader", data: serifItalic, style: "italic", weight: 400 },
        { name: "Geist", data: sans, style: "normal", weight: 500 },
        { name: "Geist Mono", data: mono, style: "normal", weight: 400 },
      ],
    },
  );
}
