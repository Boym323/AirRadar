import { getAtcData } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await getAtcData(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
