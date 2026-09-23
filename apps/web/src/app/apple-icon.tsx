import { ImageResponse } from "next/og";

import { logoMarkSvg, svgDataUri } from "@/lib/brand-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Full-bleed mark: iOS applies its own rounded mask. */
export default function AppleIcon() {
  return new ImageResponse(
    <img
      src={svgDataUri(logoMarkSvg({ rounded: false, stroke: 6 }))}
      width={180}
      height={180}
      alt=""
    />,
    size,
  );
}
