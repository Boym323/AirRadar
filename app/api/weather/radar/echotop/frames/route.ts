import { defaultEchoTopProvider } from "@/lib/server/weather-radar/echotop-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET():Promise<Response>{
  const catalog=await defaultEchoTopProvider.getFrames();
  return Response.json(catalog,{headers:{"Cache-Control":"no-store"}});
}
