import { WatchlistPage } from "@/components/watchlist-page";
import { AirRadarPageShell } from "@/components/airradar-shell";

export const dynamic = "force-dynamic";

export default function WatchlistRoute() {
  return <AirRadarPageShell><WatchlistPage /></AirRadarPageShell>;
}
