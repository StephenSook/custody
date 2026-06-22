import { ImageResponse } from "next/og";

// Dynamic Open Graph / link-preview card, rendered by Vercel (no static asset, no Playwright).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Custody. Strongly consistent parental consent and minor-spend control across regions, on Amazon Aurora DSQL.";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "72px 80px",
        background: "#0a0e0d",
        color: "#e8f0ec",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", color: "#1ed28f", letterSpacing: 8, fontSize: 20 }}>
        SYSTEM OF RECORD
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: -3,
          marginTop: 10,
        }}
      >
        CUSTODY
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#aebfb7",
          marginTop: 24,
          maxWidth: 1000,
          lineHeight: 1.35,
        }}
      >
        Strongly consistent parental consent and minor-spend control across regions, on Amazon
        Aurora DSQL.
      </div>
      <div style={{ display: "flex", fontSize: 20, color: "#8aa79b", marginTop: 44 }}>
        custody-zeta.vercel.app · Aurora DSQL multi-region · Next.js on Vercel
      </div>
    </div>,
    { ...size },
  );
}
