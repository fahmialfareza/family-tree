import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <span
        role="img"
        aria-label="tree"
        style={{
          fontSize: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
      >
        🌳
      </span>
    ),
    {
      ...size,
    }
  );
}
