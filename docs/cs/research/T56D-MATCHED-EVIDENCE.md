# AirRadar T5.6D – porovnání paměti a izolovaný SSE benchmark

## Cíl

T5.5 ukázal růst RSS a síťových trailů. T5.6A/B přidaly interní metriky
paměti V8 a kontrolu počtu uchovaných bodů. **Samotný nárůst RSS
neprokazuje memory leak.** T5.6D proto doplňuje dva měřicí nástroje
bez spekulativní změny limitů nebo chování radaru.

## 1. Porovnání dvou dokončených T5.6 měření

Nejprve na odpovídajícím prostředí pořiďte dva autorizované reporty
podle [postupu T5.6A](T56-MEMORY-ATTRIBUTION.md). Soukromé soubory
neukládejte do repozitáře.

```bash
node scripts/t56d-matched-evidence.mjs /secure/before.json /secure/after.json
```

Skript znovu vypočte agregáty a odmítne nestabilní proces, nedostatečné
měření, chybějící data, překročení limitů trailů, shodný commit,
odlišný warmup/délku měření nebo nesrovnatelnou zátěž. Mediány počtu
letadel a bodů trailů se musí lišit nejvýše o 15 %, medián a maximum
počtu SSE klientů se musí shodovat přesně.

- `MATCHED_OBSERVATIONAL_ONLY`: provoz je podle omezených metrik
  přibližně srovnatelný, nikoli prokazatelně stejně náročný
- `INCOMPARABLE`: výsledky nelze bezpečně srovnávat (exit code 2)
- Chyba formátu či čtení vstupu: exit code 1

Výstup obsahuje jen agregátní hodnoty RSS, heap, GC a zátěže.
Nezobrazuje PID, interní ID diagnostiky ani identitu/pozice letadel.
Pro interpretaci je stále nutné ručně ověřit verzi Node, uptime,
provozní skladbu, zahřátí cache a další procesy.

## 2. Offline benchmark SSE V2

Na izolovaném DEV checkoutu:

```bash
JITI_TSCONFIG_PATHS=true jiti scripts/t56d-sse-fanout-benchmark.ts
```

Scénáře: 100 / 1 000 / 5 000 letadel, 0 / 1 / 5 / 20 klientů a
změny 2 % nebo 15 % letadel na aktualizaci. Měří se medián CPU a
čas zpracování skutečného `SseDeltaEncoder` včetně JSON/UTF-8
serializace a objem odesílaných dat. Scénáře používají výhradně
syntetický provoz bez kontaktu s readsb, PostgreSQL nebo produkcí.

**Limity:** test nesimuluje síť, reverse proxy, `ReadableStream`
backpressure, heartbeat ani reálné připojení klientů. Měření
na sdílených CI runnerech nesmí být použito jako výkonová hranice.

## Kontroly

```bash
npm run test:targeted -- tests/t56d-matched-evidence.test.mjs tests/t56d-sse-fanout-benchmark.test.ts
npm run typecheck
npm run lint
```

Kód nemění uchovávání historie, source affinity, SSE kontrakt, API,
bezpečnost ani databázi. Nasazení musí projít standardní CI a
release pipeline.

[English version](../../research/T56D-MATCHED-EVIDENCE.md).
