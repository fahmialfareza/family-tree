import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// The brand mark (see components/common/logo.tsx) rendered for favicons.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, borderRadius: 18, background: "#3f7a52", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 12, left: 24, width: 16, height: 16, borderRadius: 16, background: "#fbf7ee" }} />
        <div style={{ position: "absolute", top: 34, left: 12, width: 13, height: 13, borderRadius: 13, background: "#fbf7ee" }} />
        <div style={{ position: "absolute", top: 34, left: 39, width: 13, height: 13, borderRadius: 13, background: "#fbf7ee" }} />
        <div style={{ position: "absolute", top: 51, left: 26, width: 12, height: 4, borderRadius: 2, background: "#c9714a" }} />
      </div>
    ),
    size,
  );
}
