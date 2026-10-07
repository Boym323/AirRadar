import { AirRadarPageShell } from "@/components/airradar-shell";
import { DeliveryHealthPage } from "@/components/delivery-health-page";

export const dynamic = "force-dynamic";

export default function AdminDeliveryHealthPage() {
  return <AirRadarPageShell><DeliveryHealthPage /></AirRadarPageShell>;
}
