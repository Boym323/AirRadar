import { getSigmetResponse } from "@/lib/server/weather-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return getSigmetResponse(request);
}
