import { defaultEchoTopProvider } from "@/lib/server/weather-radar/echotop-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request:Request,context:{params:Promise<{id:string}>}):Promise<Response>{
  const {id}=await context.params;
  if(!/^\d{12}$/.test(id))return new Response("Invalid frame",{status:400,headers:{"Cache-Control":"no-store"}});
  try{
    const bytes=await defaultEchoTopProvider.getFrame(id);
    return new Response(bytes as BodyInit,{
      headers:{"Content-Type":"image/png","X-Content-Type-Options":"nosniff",
        "Cache-Control":"public, max-age=1200"}
    });
  }catch{
    return new Response("Echo Top frame unavailable",{
      status:503,headers:{"Cache-Control":"no-store"}
    });
  }
}
