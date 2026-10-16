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
retence 30 dní. Při selhání sběru se ukládá poslední **anonymizovaný částečný souhrn** a bezpečná kategorie chyby, nikdy původní odpovědi API.

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

## Odolnost vůči výpadkům a kvalita důkazů

První validní vzorek pouze v paměti určí identitu produkčního procesu.
Po každém pokusu se atomicky uloží anonymizované soubory JSON a Markdown.
Jediný výpadek HTTPS neukončí celý běh; další plánovaný vzorek se zkusí
znovu a rozdíly CPU, GC ani cgroup se nepřepočítávají přes vynechané
intervaly. Tři chyby za sebou, chybějící vstupní telemetrie,
nepovolený přístup nebo změna produkčního procesu sběr zastaví.

Neúplná data mají verdikt `PARTIAL` nebo `INSUFFICIENT_EVIDENCE`,
nikoli PASS. Log obsahuje jen předem určenou kategorii chyby.
Žádné tokeny, cookies, PID, interní ID ani původní HTTP odpovědi
se do reportů nezapisují.

Artefakty se nahrají i při neúspěšném jobu a zůstanou dostupné 30 dní.
Nový běh proti produkci vyžaduje **ruční spuštění z main**;
CI na PR spouští pouze syntetické testy.

Příčinu starého selhání #38851649335 nelze z dostupného logu zpětně
prokázat, protože dřívější sběrač uváděl jen obecnou chybu.
Nový sběrač umí bezpečně rozlišit odmítnutí přístupu, HTTP chybu,
timeout, síťový výpadek, chybějící telemetrii a změnu procesu.
