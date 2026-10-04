# Aircraft Watchlist & Alerts V1

Aircraft Watchlist & Alerts V1 dokončuje existující serverový watchlist jako
jednu produktovou vrstvu místo několika oddělených alert mechanismů.

## Rozsah

Watchlist umí párovat letadla podle ICAO hex, registrace, přesného callsignu,
wildcard callsignu, typu letadla nebo aerolinky. Existující omezení vzdálenosti
a společný alert cooldown zůstávají beze změny.

Integrovaný přehled aktivity obsahuje události navázané na watchlist pravidla z
existujících alert a Flight Intelligence pipeline:

- první zachycení odpovídajícího letadla,
- vstup do nastaveného okruhu přijímače,
- pravděpodobný vzlet a přistání,
- přiblížení, go-around, potvrzený holding, odklon a top of descent,
- přechod na speciální squawk 7500, 7600 nebo 7700.

Nevzniká druhý detektor letových událostí.

## History-only speciální squawk

Detekce speciálního squawku je nově oddělena od externího doručení. Pokud
sledované letadlo přejde na 7500, 7600 nebo 7700 a globální emergency push je
vypnutý, AirRadar stále uloží omezenou watchlist událost a označí doručení jako
vypnuté. Pushover se nevolá.

Pokud jsou globální emergency alerty zapnuté, existující high-priority cesta
zůstává beze změny. Ke stejné události se navíc připojí ID odpovídajících
watchlist pravidel, takže se zobrazí také v integrované aktivitě watchlistu.

První živý snapshot zůstává baseline a nemůže po restartu vytvořit squawk
alert storm.

## API a UI

`GET /api/watchlist/activity` vrací omezenou historii událostí přiřazených k
aktuálně nakonfigurovaným watchlist pravidlům. Podporované parametry:

- `page`
- `pageSize` (maximum 50)
- `ruleId` (lze vybrat jen aktuálně existující watchlist pravidlo)

Endpoint používá existující public watchlist rate limit a vrací
`Cache-Control: no-store`.

Stránka `/watchlist` zobrazuje posledních 20 událostí a panel obnovuje každých
30 sekund. Nevytváří další SSE spojení.

## Hranice

- Není potřeba databázová migrace.
- Pro jednoduchý watchlist zůstává autoritativní existující `alerts.json`.
- Pro pohybové události zůstává autoritativní Flight Intelligence.
- Existující alert history zůstává event ledgerem.
- Konfigurace Pushoveru se neposílá do prohlížeče.
- Výpadek receiver coverage může stále způsobit nezachycení přechodu.
