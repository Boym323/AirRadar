import { AirRadarPageShell } from "@/components/airradar-shell";
import { DigitalTwinCalibrationCenter } from "@/components/digital-twin-calibration-center";

export const dynamic = "force-dynamic";

export default function DigitalTwinCalibrationPage() {
  return (
    <AirRadarPageShell>
      <DigitalTwinCalibrationCenter />
    </AirRadarPageShell>
  );
}
