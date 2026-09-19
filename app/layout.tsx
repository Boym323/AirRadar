import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./radar-aircraft-panel.css";
import { PwaRegister } from "@/components/pwa-register";
import { AirRadarQueryProvider } from "@/components/query-provider";

export const metadata: Metadata = {
  title: "AirRadar — osobní radar leteckého provozu",
  description: "Soukromý radar pro přehled leteckého provozu v okolí.",
  applicationName: "AirRadar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#07131f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AirRadarQueryProvider>{children}</AirRadarQueryProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
