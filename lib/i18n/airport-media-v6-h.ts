export function airportMediaCopy(locale: string) {
  return locale.startsWith("cs") ? {
    title: "Letecká média", help: "Vlastní externí odkazy na kamery a letecké audio. Ověřte souhlas poskytovatele a případná omezení.",
    empty: "Zatím žádný odkaz pro toto letiště.", camera: "Kamera", audio: "Audio", sourceTitle: "Název zdroje", link: "HTTPS adresa",
    add: "Přidat odkaz", remove: "Odebrat", open: "Otevřít externí zdroj", invalid: "Neplatná nebo duplicitní veřejná HTTPS adresa.",
    privacy: "Přehrávání vyžaduje souhlas a svolení poskytovatele. Žádný stream neprochází serverem AirRadar.",
    consent: "Potvrzuji oprávnění k přehrávání tohoto zdroje v AirRadaru (nebo oficiální povolené vložení).",
    play: "Přehrát zde", stop: "Zastavit", unsupported: "Přímé vložení tohoto zdroje není podporováno; použijte externí odkaz.",
    hlsUnsupported: "Prohlížeč nepodporuje nativní HLS; použijte externí odkaz.",
  } : {
    title: "Aviation media", help: "Your external links to webcams or aviation audio. Check provider consent and applicable restrictions.",
    empty: "No links saved for this airport.", camera: "Camera", audio: "Audio", sourceTitle: "Source name", link: "HTTPS address",
    add: "Add link", remove: "Remove", open: "Open external source", invalid: "Invalid or duplicate public HTTPS address.",
    privacy: "Playback requires your confirmation of provider authorization; AirRadar never proxies media streams.",
    consent: "I confirm this source permits playback in AirRadar (or the official embed is allowed).",
    play: "Play here", stop: "Stop", unsupported: "This link has no supported embedded player; use the external link.",
    hlsUnsupported: "This browser does not support native HLS; use the external link.",
  };
}
