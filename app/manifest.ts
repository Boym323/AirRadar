import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AirRadar",
    short_name: "AirRadar",
    description: "Soukromý radar pro přehled leteckého provozu v okolí.",
    start_url: "/",
    display: "standalone",
    background_color: "#08111d",
    theme_color: "#08111d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
