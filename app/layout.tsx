import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "AirRadar — personal ADS-B radar",
  description: "Personal ADS-B radar powered by readsb",
  applicationName: "AirRadar",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#08111d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
