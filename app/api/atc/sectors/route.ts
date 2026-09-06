import { SAMPLE_ATC_SECTORS, SAMPLE_ATC_TRANSMITTERS } from "@/lib/server/atc-data";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ sectors: SAMPLE_ATC_SECTORS, transmitters: SAMPLE_ATC_TRANSMITTERS }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
