# AirRadar — třetí kolo čištění radarové mapy (18. 10. 2026)

[English](../../agents/CLEANUP-ROUND3-2026-10-18.md)

> Datovaný záznam úkolu, ne nové globální pravidlo. Před použitím ověř [AGENTS.md](../../../AGENTS.md), aktuální main a produkční commit.

## Dokončené a automaticky nasazené změny

| Dávka | Commit a produkční release | Změna | Ověření |
| --- | --- | --- | --- |
| Skrytá ATC vrstva a oddělení mapových generátorů | [992f636e](https://github.com/Boym323/AirRadar/commit/992f636e761fec45836d9fb3b7b90f5aa16ead9a), [PR #1037](https://github.com/Boym323/AirRadar/pull/1037), [v1.0.527](https://github.com/Boym323/AirRadar/releases/tag/v1.0.527) | Čisté ATC/Navigation Integrity 2D GeoJSON generátory přesunuty do `lib/radar/airspace-geojson.ts`. Skrytá ATC vrstva vrací původní prázdný FeatureCollection bez sestavení indexu plánované aktivity. | [PR CI](https://github.com/Boym323/AirRadar/actions/runs/39162247482), [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39162247544), [škálování 1×/2×/4×](https://github.com/Boym323/AirRadar/actions/runs/39162247589), [main CI/deploy](https://github.com/Boym323/AirRadar/actions/runs/39162525477). |
| Sdílená ATC metadata sektorů | [0eddfcf4](https://github.com/Boym323/AirRadar/commit/0eddfcf474c7cc33265b1a9df3073c9d4029ef05), [PR #1038](https://github.com/Boym323/AirRadar/pull/1038), [v1.0.528](https://github.com/Boym323/AirRadar/releases/tag/v1.0.528) | Po ověření polygonů se formátování služby, výškových hranic, frekvencí, plánované aktivity a načtení dopravních metadat provede jednou za sektor, nikoli znovu pro každý polygon. Každý polygon dál obsahuje vlastní objekt s totožnými GeoJSON metadaty. | [PR CI](https://github.com/Boym323/AirRadar/actions/runs/39162817936), [CodeQL](https://github.com/Boym323/AirRadar/actions/runs/39162817994), [škálování 1×/2×/4×](https://github.com/Boym323/AirRadar/actions/runs/39162817927), [main CI/deploy](https://github.com/Boym323/AirRadar/actions/runs/39163113649). |

Automatický release ověřil identitu obou nasazených SHA, lokální i veřejný health a build artefakt. Nedotčeny: readsb ingest, kanonické slučování letadel, ATC assignment, SSE, síťové fallbacky, autentizace, produkční konfigurace i databáze.

## Co je prokázané a co ne

- **PROKÁZÁNO:** Skrytá ATC vrstva nesmí načítat ani záměrně nečitelný Proxy objekt plánované aktivity. Viditelné ATC polygony a metadata zůstávají stejné. Test více polygonů ověřuje jediné načtení provozu a pole frekvencí na sektor.
- **PROKÁZÁNO:** U obou změn prošly plné CI, CodeQL, syntetické škálování a automatický release s health.
- **VELIKOST ARTEFAKTU (NE RYCHLOST):** ZIP v1.0.527 = 73 922 258 B; v1.0.528 = 73 923 249 B (+991 B).
- **NEMĚŘENO:** Produkční CPU, RSS, GC, DB/síťová práce, event-loop P95/P99 ani odezva prohlížeče před/po. Z testů se neodvozuje procento runtime úspory.

## Další kandidáti podle důkazů

1. **ATC Shadow Prediction:** `lib/server/aircraft-state.ts` a `lib/server/atc-prediction-validation.ts` mají živého konzumenta veřejné validační diagnostiky. Profilovat A/B zapnuto/vypnuto na stejném replay a při různých hustotách letadel; oddělit od kanonického přiřazování ATC sektorů. ZACHOVAT do prokázání parity a opakovatelné úspory.
2. **Digital Twin truth/outcome validátory:** Pět pozorovacích kroků nad lokálním snapshotem a automatická kalibrace. Měřit exkluzivní CPU, alokace a tail latence; překrývající se inkluzivní časy nesčítat. ZACHOVAT do měření.
3. **FlightPosition Persistence Shadow:** Opt-in experiment. Zachovat historii i kanonický writer; bez vyhodnocení diagnostik a kontraktů nemazat.
4. **ADSBHub / ADSB.lol:** Zachovat pokrytí a failover, měřit unikátní pozice/MLAT, freshness, síťové bajty a CPU na kontrolovaném replay.
5. **Další dělení radarového UI:** Oddělovat malé čisté moduly bez dalších pollerů, SSE klientů a vlastnictví MapLibre zdrojů; zachovat browser/screenshot paritu.

Bez další autorizace nespouštět produkční T58/forced GC, neměnit tajné hodnoty, ručně nenasazovat a nezasahovat destruktivně do historické DB. Před dalším pushem ověřit SHA, single-writer proces, testy a non-force zápis.
