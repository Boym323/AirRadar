import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AirportDetail } from "@/components/airport-detail";
import { resolveAirportDetail } from "@/lib/server/airport-detail";
import { getNearbyAirports } from "@/lib/server/nearby-airports";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ icao: string }> }): Promise<Metadata> {
  const { icao } = await params;
  const airport = await resolveAirportDetail(icao);
  return airport
    ? { title: `${airport.iataCode ? `${airport.iataCode} · ` : ""}${airport.icaoCode} — ${airport.name}` }
    : { title: "Airport — AirRadar" };
}

export default async function AirportPage({ params }: { params: Promise<{ icao: string }> }) {
  const { icao } = await params;
  const airport = await resolveAirportDetail(icao);
  if (!airport) notFound();
  const nearbyAirports = await getNearbyAirports(airport);
  return <AirportDetail airport={airport} nearbyAirports={nearbyAirports} />;
}
