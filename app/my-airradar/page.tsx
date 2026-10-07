import { AirRadarPageShell } from "@/components/airradar-shell";
import { MyAirRadarHome } from "@/components/my-airradar-home";

export const dynamic = "force-dynamic";

export default function MyAirRadarPage() {
  return (
    <AirRadarPageShell>
      <MyAirRadarHome />
    </AirRadarPageShell>
  );
}
