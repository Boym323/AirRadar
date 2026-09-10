import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "AirRadar — osobní radar leteckého provozu",
  description: "Soukromý radar pro přehled leteckého provozu v okolí.",
  applicationName: "AirRadar",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#08111d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
