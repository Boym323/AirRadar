import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AirRadar",
    short_name: "AirRadar",
    description: "Soukromý radar pro přehled leteckého provozu v okolí.",
    start_url: "/",
    display: "standalone",
    background_color: "#080f1b",
    theme_color: "#080f1b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
