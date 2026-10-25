import { ImageResponse } from "next/og";

// Shared links in both languages use one image, so its text is bilingual.
export const alt = "Sakdulur — build your family tree together / susun silsilah keluarga bersama";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const card = (name: string, years: string, color: string, x: number, y: number) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 230,
        height: 84,
        borderRadius: 18,
        background: "#fffdf8",
        border: "2px solid #e6dccb",
        display: "flex",
        alignItems: "center",
        paddingLeft: 26,
        gap: 16,
        borderLeft: `8px solid ${color}`,
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 44, background: "#efe6d4" }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#3a3127" }}>{name}</span>
        <span style={{ fontSize: 18, color: "#7a6d5d" }}>{years}</span>
      </div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f9f6ef", position: "relative", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, width: 600, gap: 24 }}>
          <span style={{ fontSize: 34, color: "#c9714a", fontWeight: 800 }}>Sakdulur</span>
          <span style={{ fontSize: 60, lineHeight: 1.1, fontWeight: 800, color: "#3a3127" }}>Silsilah keluarga, disusun bersama.</span>
          <span style={{ fontSize: 28, color: "#7a6d5d" }}>Your family tree, built together. Free and private.</span>
        </div>
        {card("Hasan", "1938–2011", "#6f8fb3", 640, 120)}
        {card("Siti", "1942–2019", "#c98585", 900, 120)}
        <div style={{ position: "absolute", left: 868, top: 236, width: 18, height: 18, borderRadius: 18, background: "#c9714a" }} />
        {card("Ahmad", "1965", "#6f8fb3", 640, 330)}
        {card("Dewi", "1968", "#c98585", 900, 330)}
        {card("Rani", "1994", "#c98585", 770, 480)}
      </div>
    ),
    size,
  );
}
