"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { airportMediaCopy } from "@/lib/i18n/airport-media-v6-h";
import { resolveAuthorizedPlayer } from "@/lib/aviation-media-player-v6";
import { AIRPORT_MEDIA_MAX_LINKS, addAirportMediaLink, mediaAirportKey, parseAirportMediaLinks, sanitizeAirportMediaLink, type AirportMediaKind, type AirportMediaLink } from "@/lib/aviation-media-v6-h";

export function AirportMediaLinks({ icao }: { icao: string }) {
  const copy = airportMediaCopy(t.locale), key = mediaAirportKey(icao);
  const [links, setLinks] = useState<AirportMediaLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState(""), [url, setUrl] = useState("");
  const [kind, setKind] = useState<AirportMediaKind>("camera");
  const [message, setMessage] = useState("");
  const [permission, setPermission] = useState(false);
  const [nativeHls, setNativeHls] = useState(false);
  useEffect(() => { setNativeHls(Boolean(document.createElement("video").canPlayType("application/vnd.apple.mpegurl"))); }, []);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try { if (key) stored = window.localStorage.getItem(key); } catch { /* storage optional */ }
    setLinks(parseAirportMediaLinks(stored));
    setPlayingUrl(null);
    setLoaded(true);
    setPermission(false); // Permission is session-only, never persisted.
    setActiveUrl(null);
  }, [key]);

  const save = (next: AirportMediaLink[]) => {
    setLinks(next);
    if (activeUrl && !next.some(link => link.url === activeUrl)) setActiveUrl(null);
    try { if (key) window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = sanitizeAirportMediaLink({ title, url, kind });
    if (!input || links.some(item => item.url === input.url)) { setMessage(copy.invalid); return; }
    save(addAirportMediaLink(links, input));
    setTitle(""); setUrl(""); setMessage("");
  };

  return <section className="airport-card airport-v6-media" data-testid="airport-media-v6-h" aria-labelledby="airport-media-title">
    <h2 id="airport-media-title">{copy.title}</h2>
    <p>{copy.help}</p>
    {loaded && links.length > 0 && <label className="airport-v6-media-permission">
      <input type="checkbox" checked={permission} onChange={event => { setPermission(event.target.checked); if (!event.target.checked) setActiveUrl(null); }} /> {copy.consent}
    </label>}
    {loaded && (links.length ? <ul>{links.map(item => {
      const player = resolveAuthorizedPlayer(item.url, item.kind);
      const playable = Boolean(player && (player.type !== "hls" || nativeHls));
      const active = activeUrl === item.url && permission && playable;
      return <li key={item.url} className="airport-v6-media-item">
        <span><strong>{item.kind === "camera" ? copy.camera : copy.audio}:</strong> <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${copy.open}: ${item.title}`}>{item.title} ↗</a></span>
        {playable && <Button type="button" variant="secondary" size="compact" disabled={!permission} onClick={() => setActiveUrl(active ? null : item.url)}>{active ? copy.stop : copy.play}</Button>}
        <Button type="button" variant="ghost" size="compact" onClick={() => save(links.filter(link => link.url !== item.url))}>{copy.remove}</Button>
        {active && player && <div className="airport-v6-player" data-testid="airport-v6-authorized-player">
          {player.type === "youtube" && <iframe title={item.title} src={player.src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen
            style={{width:"100%", aspectRatio:"16 / 9", minHeight:225, border:0}} />}
          {(player.type === "audio" || player.type === "hls" && item.kind === "audio") && <audio controls preload="none" src={player.src} style={{width:"100%"}} />}
          {(player.type === "video" || player.type === "hls" && item.kind === "camera") && <video controls playsInline preload="none" src={player.src} style={{width:"100%", maxHeight:480}} />}

        </div>}
        {player?.type === "hls" && !nativeHls && <small>{copy.hlsUnsupported}</small>}
        {!player && <small>{copy.unsupported}</small>}
      </li>;
    })}</ul> : <p>{copy.empty}</p>)}
    {loaded && links.length < AIRPORT_MEDIA_MAX_LINKS && <form onSubmit={submit}>
      <label>{copy.sourceTitle}<input required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>{copy.link}<input required type="url" maxLength={500} placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} /></label>
      <label>{copy.title}<select value={kind} onChange={event => setKind(event.target.value as AirportMediaKind)}><option value="camera">{copy.camera}</option><option value="audio">{copy.audio}</option></select></label>
      <Button type="submit" variant="secondary" size="compact">{copy.add}</Button>
    </form>}
    {message && <p role="alert">{message}</p>}
    <small>{copy.privacy}</small>
  </section>;
}
