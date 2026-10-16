# T58 – cílená diagnostika CPU špiček, cgroup a GC

Jedná se o **samostatnou, krátkou read-only diagnostiku** navazující na
T58 #38808450941 (verze 1.0.469), kde zůstaly záseky event-loop až
4,49 sekundy a CPU P95 dosáhlo 94 %.

## Dosud dostupné důkazy

Původní T58 neobsahuje žádné vhodné párové vzorky
`cgroup.cpuThrottledUsecDelta`. Jde o **nedostupné údaje**, nikoliv
důkaz nulového throttlingu. Korelace `gc.pause` a maxima záseků
v minutových oknech byla -0,176. Neprokazuje ani nevylučuje
vliv jednotlivých událostí GC.

Cesta `twin.eventOutcome.local` vykázala 35 928,668 ms atribuovaného
CPU napříč 990 voláními. Jde o přibližné překrývající se čítače,
ne o flamegraph skutečných JavaScript funkcí.

## Spuštění na GitHubu po začlenění do main

**Actions → T58 CPU Spike Diagnosis → Run workflow → main**.
Vyberte 120 nebo 600 sekund. Workflow každých pět sekund pouze čte
stávající agregované diagnostiky ze dvou administrátorských HTTPS
endpointů a případně se autentizuje existujícím tajným klíčem T58.

Před měřením vyžaduje správnou administrátorskou odpověď a funkční
runtime diagnostiku. Po dobu měření kontroluje nezměněný commit,
identifikátor procesu a interní identifikátor diagnostiky – pouze
v paměti, nikdy v artefaktech.

Nedochází k restartu, změně konfigurace, nasazení, databázovému
zápisu, spuštění Node inspectoru, heap snapshotu ani práci s
identitami nebo souřadnicemi letadel. Do GitHub Actions se nahrává
pouze `summary.json` a `summary.md` s agregovanými hodnotami,
retence 30 dní. Selhání sběru nezpřístupňuje původní odpovědi API.

## Měřené hodnoty

- Delta procesního uživatelského a systémového CPU času, vyjádřená
  jako procento jednoho jádra; může přesahovat 100 %.
- Rozdíly čítačů `nr_throttled` a `throttled_usec` z cgroup v2 (nebo `throttled_time` z cgroup v1 po převodu z ns)
  a nastavená CPU kvóta. Jde o celý cgroup, nejen aplikaci.
  Pokud chybí data, výsledek je **N/A**, nikoliv nula.
- Počet a kumulativní doba pauz V8 GC, podíl na měřeném čase
  a největší nedávno zaznamenaná pauza.
- CPU doby předem povolených pojmenovaných aplikačních cest.
  Vnořené časy se mohou překrývat a nesmějí se sčítat.
- Klouzavé P99 zpoždění event-loop a počet sledovaných letadel.

Rozlišení pěti sekund neumožňuje samo o sobě prokázat příčinu
konkrétního několikasekundového záseku a nejde o skutečný V8
CPU flamegraph. K určení přesného JavaScript stacku by bylo
potřeba další řízené profilování přímo na hostiteli.

Lokální kontrola:
```bash
node --test tests/t58-cpu-spikes.test.mjs
```

CI na PR ověřuje algoritmy a ochranu dat, nikoliv produkční endpointy.
