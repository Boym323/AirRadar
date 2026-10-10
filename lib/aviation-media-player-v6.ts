import type { AirportMediaKind } from "@/lib/aviation-media-v6-h";
export type AuthorizedPlayer = { type: "youtube" | "video" | "audio" | "hls"; src: string };
/** The browser may only embed the official YouTube player or a user-authorized public media file.
 * Never proxy, scrape, mirror, rebroadcast or bypass a provider's player/terms.
 */
export function resolveAuthorizedPlayer(value: string, kind: AirportMediaKind): AuthorizedPlayer | null {
  try{
    const url=new URL(value);
    if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash) return null;
    const host=url.hostname.toLowerCase();
    // LiveATC explicitly prohibits use of its streams in third-party products.
    if(host==="liveatc.net"||host.endsWith(".liveatc.net"))return null;
    let id:string|null=null;
    if(["www.youtube.com","youtube.com","m.youtube.com","www.youtube-nocookie.com","youtube-nocookie.com"].includes(host)){
      if(url.pathname==="/watch")id=url.searchParams.get("v");
      else id=url.pathname.match(/^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]??null;
    }else if(host==="youtu.be"||host==="www.youtu.be"){
      id=url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]??null;
    }
    if(id){
      if(kind!=="camera"||!/^[A-Za-z0-9_-]{11}$/.test(id))return null;
      return {type:"youtube",src:`https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1`};
    }
    if(!host.includes(".")||host.endsWith(".local")||host==="localhost"||host.startsWith("[")||/^(?:127|10|0|192\.168|169\.254)\./.test(host)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(host))return null;
    const path=url.pathname.toLowerCase();
    if(kind==="camera"&&/\.(?:mp4|webm|ogv)$/.test(path))return {type:"video",src:url.toString()};
    if(kind==="camera"&&path.endsWith(".m3u8"))return {type:"hls",src:url.toString()};
    if(kind==="audio"&&/\.(?:mp3|m4a|aac|oga|ogg|wav)$/.test(path))return {type:"audio",src:url.toString()};
    if(kind==="audio"&&path.endsWith(".m3u8"))return {type:"hls",src:url.toString()};
    return null;
  }catch{return null;}
}
