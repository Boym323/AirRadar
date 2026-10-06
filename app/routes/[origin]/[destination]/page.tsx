import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { RouteNetworkDetail } from "@/components/route-network-detail";
import { normalizeAirportIcao } from "@/lib/server/airport-resolver";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ origin: string; destination: string }> }): Promise<Metadata> {
  const { origin: rawOrigin, destination: rawDestination } = await params;
  const origin = normalizeAirportIcao(rawOrigin);
  const destination = normalizeAirportIcao(rawDestination);
  return origin && destination
    ? { title: `${origin} → ${destination} — AirRadar` }
    : { title: "Route detail — AirRadar" };
}

export default async function RouteNetworkDetailPage({ params }: { params: Promise<{ origin: string; destination: string }> }) {
  const { origin: rawOrigin, destination: rawDestination } = await params;
  const origin = normalizeAirportIcao(rawOrigin);
  const destination = normalizeAirportIcao(rawDestination);
  if (!origin || !destination || origin === destination) notFound();
  return <AirRadarPageShell><RouteNetworkDetail origin={origin} destination={destination} /></AirRadarPageShell>;
}
