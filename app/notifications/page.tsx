import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { NotificationCenter } from "@/components/notification-center";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications — AirRadar",
};

export default function NotificationsPage() {
  return <AirRadarPageShell><NotificationCenter /></AirRadarPageShell>;
}
