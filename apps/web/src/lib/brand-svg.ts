/**
 * The logo mark as an SVG string, for places that need an image rather than a React component
 * (Open Graph images, the Apple touch icon).
 */
const AMPERSAND =
  "M49 33 C 44 44, 33 52, 24 51 C 15 50, 15 39, 25 32 C 34 26, 36 17, 30 14 C 24 11, 19 17, 23 25 C 28 35, 39 45, 51 51";

export function logoMarkSvg({
  rounded = true,
  stroke = 7,
}: { rounded?: boolean; stroke?: number } = {}): string {
  const radius = rounded ? 15 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="s"><rect width="64" height="64" rx="${radius}"/></clipPath><clipPath id="p"><polygon points="0,0 64,0 64,18 0,50"/></clipPath><clipPath id="b"><polygon points="0,50 64,18 64,64 0,64"/></clipPath></defs><g clip-path="url(#s)"><rect width="64" height="64" fill="#fffdf8"/><polygon points="0,50 64,18 64,64 0,64" fill="#1c1b19"/></g>${
    rounded
      ? '<rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#1c1b19" stroke-width="1.5"/>'
      : ""
  }<g fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path clip-path="url(#p)" stroke="#1c1b19" d="${AMPERSAND}"/><path clip-path="url(#b)" stroke="#ece7dc" d="${AMPERSAND}"/></g><circle cx="51" cy="51" r="4.3" fill="#c43e18"/></svg>`;
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
