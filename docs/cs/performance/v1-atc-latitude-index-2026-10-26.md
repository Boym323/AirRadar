# AirRadar V1 – index šířkových pásem ATC polygonů (26. 10. 2026)

**Stav:** Implementace a specializovaná CI přejímka PASS v draft PR
[#1114](https://github.com/Boym323/AirRadar/pull/1114).
**Produkční `main` a běžící V1 zůstávají beze změny.**

## Proč
Velké CZ/SK ATC ringy obsahují až desítky tisíc souřadnic.
Dosavadní synchronní ray-casting smyčka `ringContains` procházela všechny
hrany pro každou polohu; to může blokovat Node event loop, zejména
při vícenásobném vyhodnocování ATC kontextu.

## Implementace
- `lib/atc-context/latitude-ring-index.ts`: slabě referencovaný `WeakMap`
  index 0,25° zeměpisné šířky; seznam hran uchováván jako `Uint32Array`.
- Indexují se jen velké **deep-frozen** ringy s 2 048+ body a korektními
  konečnými souřadnicemi, s limity počtu referencí a délky jednotlivé hrany.
  Mutable ringy zůstávají na původním skenování bez cache.
- Rozsahy indexu jsou rozšířené o stejných `1e-9` jako původní test hran;
  nesmí zmizet hraniční bod ani segment ležící na hranici pásma.
- Asynchronní příprava datasetu zavolá `prewarmFrozenAtcRing` a po každých
  nejvýše 1 024 hranách uvolní event loop. Sync cesta používá lazy build.
- Žádné zásahy do DB, ADS-B, zdrojů dat, streamu, UI ani konfigurace.
- Index zanikne, když GC uvolní starý připravený ATC ring.

## Kontrolovaná A/B zkouška současného V1 kódu

[GitHub Actions #40295058778](https://github.com/Boym323/AirRadar/actions/runs/40295058778)
– stejný runner, 128 deterministických poloh, SK polygon s 46 993 vrcholy.
Obě větve volají **stejný aktuální `pointInPolygon` z V1**. Před = mutable
polygon bez indexu, po = shodná hluboce zmrazená geometrie s indexem.

| Metrika | Aktuální V1 bez indexu | V1 s indexem |
|---|---:|---:|
| P50 jednoho dotazu | 0,172 ms | 0,092 ms |
| P95 jednoho dotazu | 0,425 ms | 0,283 ms |
| P99 jednoho dotazu | 1,533 ms | 0,291 ms |
| Max jednoho dotazu | 1,842 ms | 0,293 ms |
| CPU 128 dotazů | 38,081 ms | 14,782 ms |
| Max zpoždění event loopu | 1,924 ms | 1,143 ms |
| Neshody klasifikace | — | **0 ze 128** |
| Asynchronní příprava indexu | — | 5,887 ms |

Pozor: [předběžný běh #40294252784](https://github.com/Boym323/AirRadar/actions/runs/40294252784)
porovnával nový index vůči **starší pre-V8 geometrické referenci**, takže
P95 9,50 → 0,42 ms ani CPU 843 → 22 ms **nejsou korektní měření proti
aktuální V1**. Výsledky z tohoto běhu se nesmějí citovat jako zrychlení
současné produkce. Správné porovnání v tabulce výše znamená zlepšení
CPU o přibližně 61 %, P95 o 34 % a P99 o 81 % jen pro tento výpočet.

**Limity:** syntetické polohy nad reálným polygonem, nikoli živý T58 soak
ani CPU/RSS celé produkce. Rozdílná krátká okna RSS a GC se nedají
poctivě zaměnit za důkaz nižší RAM v produkci. Varianta `owned: true`
skutečně používá hluboce zmrazené polygonové body z
`getAtcDataSnapshot()`/`freezeAtcSector()`, takže asynchronní index
je použitelný pro reálné ATC datasety bez jejich mutace.

[Specializovaná CI](https://github.com/Boym323/AirRadar/actions/runs/40295058778)
PASS také pro TypeScript, integrační test ATC a mutable/frozen/hole parity.

## Zbývající brány
1. CodeQL a obecné škálovací testy PR bez regresí.
2. Původní V1 CI zatím selhává **před sestavením** na auditu stávajících
   produkčních závislostí (Next.js/undici); neobcházet audit kvůli optimalizaci.
3. Před produkčním sloučením změřit stejné T58 scénáře při reálném provozu:
   CPU, RSS, P95/P99 event-loop, maximální stall, přesnost ATC výběru a
   schopnost rollbacku. Srovnat se stejným hardwarem a verzemi.
4. Konfliktní Rust ATC pilot [PR #1107](https://github.com/Boym323/AirRadar/pull/1107)
   posoudit společně; oba optimalizují stejnou část ATC a bez dalšího A/B
   se nesmějí nasadit současně.
