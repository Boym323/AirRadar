# AIRRADAR INTELLIGENCE ROADMAP – REPORT PARALELNÍ IMPLEMENTACE

## Audit orchestrace

`main` byl fast-forwardnut na `f71483bf`, merge commit obsahující PR #141.
PR #141 změnil flight-intelligence detector/types, server adapter, i18n,
fixtures, testy a audit dokument. ATC, weather a receiver práce začaly z
čistého `main` a nestackovaly se na tuto feature branch.

| Stream | Branch | Pravděpodobně dotčené moduly | Závislosti | Riziko konfliktu |
|---|---|---|---|---|
| A | `feat/flight-intelligence-v2-stage2` | `lib/intelligence/*`, flight fixtures/testy | sloučená stage 1 | střední |
| B | `feat/atc-intelligence-v2` | `lib/atc-context/*`, ATC testy | žádné | nízké |
| C | `feat/weather-intelligence` | `lib/weather/*`, weather testy | žádné | nízké |
| D | `feat/receiver-quality-dashboard` | receiver quality helper, aditivní system-status contract | žádné | střední |

## Schopnosti

- A: explicitní detekce epizody `GO_AROUND_DETECTED` s guardy fresh-position,
  low-approach, sustained-climb, airborne a movement-away; event metadata
  obsahují detection type a reason codes.
- B: omezený průnik forward-ray s publikovanými sector polygons s boundary
  distance, groundspeed ETA, stale guardem a confidence ambiguity.
- C: sjednocená weather freshness `FRESH`/`STALE`/`OFFLINE`, nearest METAR,
  klasifikace wind component, vztah SIGMET inside/proximity/movement a omezený
  around-aircraft summary.
- D: receiver quality `GOOD`/`DEGRADED`/`OFFLINE`, medián/P90 freshness
  pozice, dostupné telemetry rates, normalizace max-range, omezené coverage
  buckety a aditivní exposure v system-status.

## Výsledky větví a PR

| Stream | PR | Commit | Testy | Lokální CI/build | Výkon | Stav |
|---|---|---|---|---|---|---|
| A | [#147](https://github.com/Boym323/AirRadar/pull/147) | `cac54d5f` | 173 souborů / 1 185 passed | lint, typecheck, production build passed | omezená existující historie; žádné nové I/O | GitHub CI pending |
| B | [#148](https://github.com/Boym323/AirRadar/pull/148) | `5b5d635e` | 173 souborů / 1 185 passed | lint, typecheck, production build passed | candidate/polygon omezené; žádná per-frame práce | GitHub CI pending |
| C | [#145](https://github.com/Boym323/AirRadar/pull/145) | `ef33cebb` | 173 souborů / 1 185 passed | lint, typecheck, production build passed | omezené dodané kolekce; žádné nové requesty | GitHub CI pending |
| D | [#146](https://github.com/Boym323/AirRadar/pull/146) | `8cdfd7cc` | 173 souborů / 1 184 passed | lint, typecheck, production build passed | jeden snapshot pass; žádný DB query | GitHub CI pending |

První pokus o build byl zneplatněn lokálním test setupem používajícím
symlinkovaný `node_modules`; Turbopack tento symlink napříč kořeny worktree
odmítá. Po instalaci skutečných per-worktree dependencies všechny čtyři
produkční buildy prošly. Nebyl spuštěn žádný production release.

## Výsledek paralelizace

A, B, C a D byly auditovány a implementovány v samostatných worktrees v
parallel-ready větvích ze stejného baseline. Žádná feature branch nebyla
sloučena do `main` a pro B, C ani D nebyla použita stacked branch. Jedinou
sdílenou změnou kontraktu je volitelné system-status quality pole z D, takže je
aditivní a nemění SSE envelope. Práce se vyhnula hlavním merge-conflict
hotspotům; očekávané zkrácení critical path vychází z nezávislého backend
review/CI, nikoli z předpokladu, že už jsou větve integrovány.

## Známá omezení

- PR nejsou sloučené; E–H zůstávají za integrační bariérou.
- A záměrně potlačuje go-arounds s neznámým letištěm a zůstává konzervativní
  u trajektorií podobných touch-and-go.
- Nový geometry helper v B je horizontální; existující ATC context engine
  vlastní vertical-volume matching.
- C konzumuje existující/providerem dodané weather collections; nepřidává
  nového providera ani route predictor.
- D hlásí null rates, když jsou source countery nedostatečné, a nevymýšlí
  receiver uptime ani MLAT telemetry.

## Další doporučená práce

1. Po dokončení GitHub CI zkontrolovat a sloučit A–D nezávisle.
2. Po každém backend merge rebase/retest zbývajících větví.
3. Vytvořit integrační checkpoint a ověřit SSE/system-status kontrakty.
4. Spustit E, F a G ze sloučeného backend baseline.
5. H spustit až po stabilizaci UI kontraktů, včetně radar performance a
   desktop/mobile production gates.
