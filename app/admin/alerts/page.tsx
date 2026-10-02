import { AirRadarPageShell } from "@/components/airradar-shell";
import { AlertsAdminPage } from "@/components/alerts-admin-page";
export const dynamic = "force-dynamic";
export default function AdminAlertsPage() { return <AirRadarPageShell><AlertsAdminPage /></AirRadarPageShell>; }
