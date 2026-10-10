# SondeHub V1 – volitelná vrstva meteorologických sond

SondeHub poskytuje nezávislá telemetrická data radiosond. V AirRadaru se zobrazují
jen po výslovném zapnutí přepínače na mapě. Provozovatel integraci aktivuje
nastavením \`SONDEHUB_ENABLED=true\` a restartováním AirRadaru; výchozí stav je vypnutý.

Server čte dokumentovaný endpoint
\`GET https://api.v2.sondehub.org/sondes\` s parametry kolem nastaveného přijímače
(\`lat\`, \`lon\`, \`distance=400000\`, \`last=3600\`).
Načtení proběhne až po vyžádání vrstvy, současné požadavky sdílejí jednu odpověď
a úspěšný snímek zůstává ve společné RAM cache 20 minut.
Integrace nepřidává časovač pravidelného stahování, další SSE, spojení MQTT/WebSocket
ani zápisy do PostgreSQL.

**SondeHub výslovně nedoporučuje pravidelné dotazování REST API.**
V1 proto obsahuje časově označené snímky, nikoli skutečné živé sledování balónů.
Budoucí živá vrstva musí využívat oficiálně dokumentovaný MQTT-over-WebSocket stream,
nikoli krátký interval REST požadavků.

Objem odpovědi je omezený na 1 MiB, maximálně 300 sond. Souřadnice dotazu jsou vždy
odvozené z konfigurace přijímače, nikoli z libovolných parametrů veřejného API.
Neplatné polohy, výšky a časy se odmítají. Při výpadku poskytovatele se vrátí
nedostupný stav nebo maximálně 60 minut stará poslední platná odpověď.
Přijímání ADS-B, OGN a historie letů běží nezávisle.

Na mapě jsou samostatné značky sond s popisem sériového čísla a detailem, který
obsahuje pozorovanou výšku, rychlost stoupání či klesání a čas měření.
**Predikce dopadu ve V1 není odvozována ani domýšlena.**
Pro budoucí zobrazení dopadu je nutné ověřené predikční API SondeHubu
a výslovné označení zdroje a míry nejistoty.

Autorství a licence: **SondeHub contributors, Creative Commons BY-SA 2.0**.
Zdroj: https://sondehub.org/; licence:
https://creativecommons.org/licenses/by-sa/2.0/.
Při redistribuci odvozených dat je nutné prověřit podmínky zachování stejné licence.

Testy: \`npx vitest run tests/sondehub-provider.test.ts\`.
