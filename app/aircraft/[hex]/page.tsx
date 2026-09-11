import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AircraftDetailV2 } from "@/components/aircraft-detail-v2";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getAircraftDetail, HistoryDatabaseUnavailableError, type AircraftDetailResponse } from "@/lib/server/history";
import { enrichAircraftDetailView } from "@/lib/server/aircraft-detail-enrichment";

export const dynamic = "force-dynamic";

async function resolveAircraft(hex: string): Promise<{ detail: AircraftDetailResponse | null; liveAircraft: ReturnType<ReturnType<typeof getAircraftStateService>["getAircraft"]> }> {
  const icaoHex = normalizeIcaoHex(hex);
  if (!icaoHex) return { detail: null, liveAircraft: null };

  let detail: AircraftDetailResponse | null = null;
  try {
    detail = await getAircraftDetail(icaoHex);
  } catch (error) {
    if (!(error instanceof HistoryDatabaseUnavailableError)) throw error;
  }

  let liveAircraft: ReturnType<ReturnType<typeof getAircraftStateService>["getAircraft"]> = null;
  try {
    const service = getAircraftStateService();
    // The radar/SSE path owns startup and polling. A standalone detail request
    // only reads the already-running RAM state and never starts another loop.
    liveAircraft = await enrichAircraftDetailView(service.getAircraft(icaoHex), new Date());
  } catch {
    // A receiver or optional enrichment outage must not hide durable aircraft metadata/history.
  }
  return { detail, liveAircraft };
}

export async function generateMetadata({ params }: { params: Promise<{ hex: string }> }): Promise<Metadata> {
  const { hex } = await params;
  const icaoHex = normalizeIcaoHex(hex);
  return { title: `${icaoHex ?? "Aircraft"} — AirRadar` };
}

export default async function AircraftPage({ params }: { params: Promise<{ hex: string }> }) {
  const { hex } = await params;
  const icaoHex = normalizeIcaoHex(hex);
  if (!icaoHex) notFound();
  const { detail, liveAircraft } = await resolveAircraft(icaoHex);
  if (!detail?.aircraft && !liveAircraft) notFound();
  return <AircraftDetailV2 detail={detail} liveAircraft={liveAircraft} />;
}
