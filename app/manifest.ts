import type { MetadataRoute } from "next";

// Next serves this at /manifest.webmanifest. Theme and background match the dark control-room
// brand (oklch(0.15 0.012 250) ~= #131519). Synthetic data only; no real minors.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Custody: consistency control room",
    short_name: "Custody",
    description:
      "Globally consistent parental consent and minor spend control, strongly consistent across regions on commit, with a tamper-evident audit trail.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#131519",
    theme_color: "#131519",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
