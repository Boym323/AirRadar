export function airportMediaCopy(locale: string) {
  return locale.startsWith("cs") ? {
    title: "Letecká média", help: "Vlastní externí odkazy na kamery a letecké audio. Ověřte souhlas poskytovatele a případná omezení.",
    empty: "Zatím žádný odkaz pro toto letiště.", camera: "Kamera", audio: "Audio", sourceTitle: "Název zdroje", link: "HTTPS adresa",
    add: "Přidat odkaz", remove: "Odebrat", open: "Otevřít externí zdroj", invalid: "Neplatná nebo duplicitní veřejná HTTPS adresa.",
    privacy: "Obsah není přehráván v AirRadaru. Otevření může podléhat pravidlům jiného webu.",
  } : {
    title: "Aviation media", help: "Your external links to webcams or aviation audio. Check provider consent and applicable restrictions.",
    empty: "No links saved for this airport.", camera: "Camera", audio: "Audio", sourceTitle: "Source name", link: "HTTPS address",
    add: "Add link", remove: "Remove", open: "Open external source", invalid: "Invalid or duplicate public HTTPS address.",
    privacy: "AirRadar does not play this content. Following the link may be subject to another site's rules.",
  };
}
