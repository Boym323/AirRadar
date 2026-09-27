# Flight Story V1

Flight Story je read-only zkušenost `/flights/[id]`. Kombinuje persistovaný
`Flight`, omezené vzorky `FlightPosition` a řádky `FlightEvent` v jednom
serverovém read modelu vystaveném přes `getFlightStory()`.

Playback timestamp je jediná master hodnota pro marker mapy, kurzor profilu,
výběr timeline a seek události. Znovu používá existující interpolaci historie
a publikuje historický čas přes `MapTimeController`; nikdy nespouští
intelligence detekci, alerty ani notifikace. URL stav přijímá `?at=` a platné
hodnoty omezuje na uložený rozsah pozic.

Pozice a události jsou řazeny chronologicky. Pokud pozice překročí omezený
payload limit, deterministické full-span vzorkování zachová první, poslední,
rovnoměrně rozmístěné vzorky a nejbližší vzorek pro každou událost.
`positionSampling` uvádí původní a vrácené počty. DTO událostí obsahují
pouze bezpečná explicitní pole; evidence a metadata JSON zůstávají privátní.

Události jsou propojeny pouze přes persistované `FlightEvent.flightId`.
Události bez souřadnic zůstávají v timeline a nedostávají vymyšlené mapové
markery. Persistovaný origin/destination se zobrazuje jen jako route context;
neprovádí se nový historický flight-plan request. Historický radar, METAR,
vítr a AUP/UUP se řeší přes Map Context V2 ve stejném playback okamžiku.

Částečná data jsou podporována: metadata a empty states zůstávají použitelná
bez pozic, událostí, route data nebo historického kontextu. V1 neodvozuje
letiště, dráhy, route phases ani kauzalitu počasí.
