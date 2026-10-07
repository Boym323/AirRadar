import { AirRadarPageShell } from "@/components/airradar-shell";
import { AlertRuleSimulatorPage } from "@/components/alert-rule-simulator-page";
export const dynamic = "force-dynamic";
export default function AdminAlertSimulatorPage() { return <AirRadarPageShell><AlertRuleSimulatorPage /></AirRadarPageShell>; }
