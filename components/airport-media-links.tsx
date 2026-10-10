"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { airportMediaCopy } from "@/lib/i18n/airport-media-v6-h";
import { AIRPORT_MEDIA_MAX_LINKS, addAirportMediaLink, mediaAirportKey, parseAirportMediaLinks, resolveAirportMediaEmbed, sanitizeAirportMediaLink, type AirportMediaKind, type AirportMediaLink } from "@/lib/aviation-media-v6-h";

export function AirportMediaLinks({ icao }: { icao: string }) {
  const copy = airportMediaCopy(t.locale);
  const key = mediaAirportKey(icao);
  const [links, setLinks] = useState<AirportMediaLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<AirportMediaKind>("camera");
  const [message, setMessage] = useState("");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try { if (key) stored = window.localStorage.getItem(key); } catch { /* storage is optional */ }
    setLinks(parseAirportMediaLinks(stored));
    setPlayingUrl(null);
    setLoaded(true);
  }, [key]);

  const save = (next: AirportMediaLink[]) => {
    setLinks(next);
    if (playingUrl && !next.some((link) => link.url === playingUrl)) setPlayingUrl(null);
    try { if (key) window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* no persistence in private mode */ }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = sanitizeAirportMediaLink({ title, url, kind });
    if (!input || links.some((item) => item.url === input.url)) { setMessage(copy.invalid); return; }
    save(addAirportMediaLink(links, input));
    setTitle(""); setUrl(""); setMessage("");
  };

  return <section className="airport-card airport-v6-media" data-testid="airport-media-v6-h" aria-labelledby="airport-media-title">
    <h2 id="airport-media-title">{copy.title}</h2>
    <p>{copy.help}</p>
    {loaded && (links.length ? <ul>{links.map((item) => {
      const embed = resolveAirportMediaEmbed(item);
      const playing = Boolean(embed && playingUrl === item.url);
      return <li key={item.url} className="airport-media-entry">
        <span><strong>{item.kind === "camera" ? copy.camera : copy.audio}:</strong> <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${copy.open}: ${item.title}`}>{item.title} ↗</a></span>
        {embed && <Button variant="secondary" size="compact" aria-expanded={playing} onClick={() => setPlayingUrl(playing ? null : item.url)}>{playing ? copy.stop : copy.play}</Button>}
        <Button variant="ghost" size="compact" onClick={() => save(links.filter((link) => link.url !== item.url))}>{copy.remove}</Button>
        {playing && embed && <div className="airport-media-embed" data-testid="airport-media-embed">
          <iframe src={embed.iframeUrl} title={item.title} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          <small>{copy.embedHelp} <a href={item.url} target="_blank" rel="noopener noreferrer">{copy.open} ↗</a></small>
        </div>}
      </li>;
    })}</ul> : <p>{copy.empty}</p>)}
    {loaded && links.length < AIRPORT_MEDIA_MAX_LINKS && <form onSubmit={submit}>
      <label>{copy.sourceTitle}<input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>{copy.link}<input required type="url" maxLength={500} placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <label>{copy.title}<select value={kind} onChange={(event) => setKind(event.target.value as AirportMediaKind)}><option value="camera">{copy.camera}</option><option value="audio">{copy.audio}</option></select></label>
      <Button type="submit" variant="secondary" size="compact">{copy.add}</Button>
    </form>}
    {message && <p role="alert">{message}</p>}
    <small>{copy.privacy}</small>
  </section>;
}
