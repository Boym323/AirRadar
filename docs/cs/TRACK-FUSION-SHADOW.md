# Track Fusion Shadow V1

Track Fusion Shadow V1 je omezená in-memory validační vrstva pro budoucí
multi-source canonical stav letadla. Běží vedle současného local/network merge a
source-affinity continuity logiky. V1 nikdy nenahrazuje canonical `Aircraft`,
nemění radar SSE payload a nezapisuje fused ani estimated pozice do PostgreSQL.

## Proč nejdřív shadow

AirRadar už má silné hranice mezi zdroji: local receiver zůstává autoritativní
pro receiver history/statistiky, network ADS-B/MLAT zůstává jen v RAM, source
affinity brání přeskakování markeru, continuity guard chrání mass-drop a
per-source plausible-position kontrola zahazuje nemožné skoky.

Track Fusion Shadow měří, zda field-level estimator dokáže continuity zlepšit
bez oslabení těchto garancí.

## Observation model

Každý retained local/network `Aircraft` se normalizuje na field observations:
position, altitude, groundspeed, track a vertical rate. Kandidát zachovává
source class, origin, ADS-B/MLAT source, čas pole, protocol provenance, ADS-B
integrity, freshness, quality score a confidence.

Skóre preferuje čerstvé lokální ADS-B, ale nevyžaduje, aby všechna pole přišla
ze stejného zdroje. LOCAL může zůstat position source a NETWORK doplnit
chybějící groundspeed.

## Shadow estimator

Pro každé ICAO vybírá V1 nejlepší kandidát zvlášť pro jednotlivá pole. Když
existují LOCAL i NETWORK pozice, měří se great-circle residual. Přechod zdroje
se kontroluje proti constant-velocity projekci předchozího fused shadow stavu.
Přechod mimo bounded uncertainty obálku se odmítne. Bez věrohodné observed
position lze nejvýše šest sekund použít dead reckoning.

Ne-position pole lze držet nejvýše deset sekund. Estimated stav je explicitně
označen a jeho uncertainty roste.

## Diagnostika

Admin `/system` zobrazuje GOOD/DEGRADED/ESTIMATED/NO_POSITION tracky, overlap,
LOCAL↔NETWORK residualy, accepted/rejected transitions, gap fills, divergence
proti canonical a per-field source selections.

Autentizovaný detail `GET /api/admin/track-fusion/:hex` vrací pouze shadow state
a používá `no-store`.

## Runtime hranice

Track Fusion Shadow není nový ingest. Čte už retained local/network mapy, nemá
vlastní timer/socket/EventSource/upstream request, neprovádí DB I/O, nevolá
enrichment providery a nikdy neserializuje fused state do veřejného radar
snapshotu.

Defaultně je zapnutý; lze jej vypnout přes
`AIRRADAR_TRACK_FUSION_SHADOW_ENABLED=false`.

## Kritický provenance invariant

Fused nebo estimated position není local receiver evidence.

```text
LOCAL observation   -> receiver history/statistics/FlightPosition
NETWORK observation -> RAM network context
FUSED/ESTIMATED     -> pouze display/intelligence
```

Budoucí release může fused state použít pro display, Digital Twin nebo
route-conformance až po vyhodnocení shadow evidence. V1 nic nepromuje.

## Doporučená graduation cesta

1. nasbírat reálné overlap residual a transition evidence;
2. vyhodnotit false rejection a gap-fill rate;
3. doplnit bounded outcome report source handoverů;
4. promovat fusion pouze do opt-in display path;
5. samostatně vyhodnotit Digital Twin input;
6. durable local-receiver evidence ponechat beze změny.
