# T5.6A – V8 Memory Attribution (bez invazivního profilování)

## Cíl

T5.5 prokázal během 30 minut růst RSS přibližně z 671 MiB na 1 635 MiB
a nárůst síťových trailů z 2 890 na 59 330 bodů. To samo o sobě
**nedokazuje memory leak**, protože proces po nasazení zahřívá cache, V8
zvětšuje heap a traily mají vlastní časové limity.

T5.6A přidává **pouze interní** údaje do existujícího, autentizovaného
`/api/system/runtime-performance` (`schemaVersion: 2`, aditivní pole):

- `runtime.v8HeapSpaces`: maximálně 16 V8 heap-space záznamů,
  pouze name/usedBytes/sizeBytes/availableBytes/physicalBytes.
- `runtime.majorGcCount`: počet pozorovaných major-GC událostí.
- `runtime.postMajorGc`: poslední přibližná observer-time paměťová
  stopa po major GC: čas, heapUsedBytes, rssBytes a oldSpaceUsedBytes.

Vše běží v **témže procesu** jako již opravený T5.5 observer.
Žádné raw heap objekty, pozice letadel, SQL parametry ani soukromé
řetězce se neshromažďují. V8 měření se volá při diagnostickém čtení
a během major GC, nikoliv při každém čtení letadel. V případě chyby
observeru se nepřeruší live ingest.

**Pozor:** `postMajorGc` reprezentuje čtení při asynchronním vyvolání
callbacku – mezi GC a callbackem mohou proběhnout další alokace. Nejde
o retainer snapshot a rozdíl dvou měření není důkazem úniku paměti.

## Měření na produkčním LXC po nasazení

```bash
cd /var/www/airradar
# WATCHLIST_ADMIN_TOKEN nastavte bezpečně, bez výpisu do logů
T56_SECONDS=3600 T56_INTERVAL_SECONDS=30 T56_WARMUP_SECONDS=600 \
  node scripts/t56-memory-production-audit.mjs
```

Skript provádí výhradně čtení dvou existujících autorizovaných endpointů,
ověřuje neměnnost buildu/PID/diagnostického procesu, prvních 10 minut měření
vynechá ze steady-state analýzy, deduplikuje major-GC baselines podle
časového razítka a ukládá anonymizované agregáty do `/tmp`
(výchozí práva `0600`). Výchozí doba 60 min, limit 30–120 min.
`T56_BASE_URL` dovoluje pouze oficiální HTTPS hostitele nebo loopback.

Při chybě autentizace/disabled observability skončí fail-closed.
Srovnávejte pouze při odpovídajícím provozu a stabilním procesu.

## Rozhodnutí

- **PASS WITH LIMITATIONS**: minimálně 30 minut stabilního procesu,
  15 steady-state vzorků, 2 odlišné pozorované major GC a 0 chyb měření.
- **INSUFFICIENT EVIDENCE**: přerušení procesu, nedostatečné okno,
  výpadky nebo nepřítomné major GC baseline.

T5.6A zatím **neoptimalizuje** retenci a nic nemění v mapě, historii,
PostgreSQL, SSE ani veřejném API.

## Další etapy

1. **T5.6B**: ověřit životní cyklus local/network trailů a odstraňování
   bodů při stale eviction; rozdíl v paměti ověřit v kontrolovaném DEV replay.
2. **T5.6C**: matched DEV CPU profil pro source merge, altitude provenance
   a track fusion, před případným zásahům do runtime.
3. **T5.6D**: teprve po průkazném výsledku porovnat produkční before/after
   za odpovídající zátěže; bez spekulativní změny trail limitů.
