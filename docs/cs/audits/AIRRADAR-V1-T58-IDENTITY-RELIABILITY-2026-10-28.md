# Spolehlivost identity T58 AirRadar V1 — 28. 10. 2026

## Rozsah

Tato změna řeší měření T58 s 61 vzorky a 18 segmenty procesu. Týká se pouze
odvození identity životnosti procesu a regresních testů T58. Neaktivuje CPU
profilování, forced GC ani restart produkce, nemění autentizaci a nepublikuje PID
ani interní diagnostické identifikátory.

## Zjištění

Segmentace byla artefaktem měření. `lib/server/system-status.ts` při každém dotazu
počítal `application.startedAt` jako `čas dotazu - uptimeSeconds`. Hodnota se proto
měnila při běžném posunu hodin a subsekundovém zaokrouhlení, i když Node.js stále
běžel. Veřejný fingerprint v `scripts/t57-soak-analysis.mjs` hashoval
`[commit, startedAt]`, takže každou změnu vydával za nový proces.

Oprava zachytí reprezentaci startu procesu jednou při inicializaci modulu
(`Date.now() - process.uptime()`). Explicitní runtime start zůstává podporován,
takže skutečný restart vytvoří nový fingerprint. Změna commitu zůstává záměrně
samostatným segmentem.

## Ověření

- Opakované status dotazy a simulovaný posun hodin zachovají `startedAt`.
- Změněný explicitní start vytvoří nový fingerprint.
- Změněný commit vytvoří nový fingerprint.
- Analýza T58 dál odděluje restart/změnu commitu do segmentů.
- Regresní testy pokrývají obnovení checkpointu workflow a token-free veřejný režim.
- Cílený Vitest: 42 testů prošlo.
- Kontrakt workflow T58: 2 testy prošly.
- TypeScript typecheck prošel.

## Interpretace produkce a omezení

Historický běh `#40665798048` zůstává důkazem staré implementace: 61/61 vzorků a
18 segmentů. Zpětně nelze odlišit churn hodin od skutečného restartu.

Opravený produkční běh [#40682255974](https://github.com/Boym323/AirRadar/actions/runs/40682255974)
proběhl ve veřejném read-only režimu proti nasazenému commitu `3cbd777f` / verzi
`1.0.563`. Nasbíral 61/61 vzorků za 3601,604 sekundy, bez nedostupných vzorků,
s jediným segmentem procesu, bez přechodů segmentů a s
`stableProcessAndCommit: true`. Sanitizovaný report je uložen v
[`audit/t58-history`](https://github.com/Boym323/AirRadar/tree/audit/t58-history/reports/t58/2026/10/28/run-40682255974-attempt-1).

U jednoho stabilního procesu se očekává jediný segment. Přechod po této opravě
znamená buď skutečný restart, nebo změnu commitu/verze; tyto případy se vyšetřují
odděleně. Veřejné T58 měří jen sanitizované CPU/RSS/event-loop údaje; neměří privátní
hot-path atribuci, GC, retention, SQL latenci, PID ani interní store identity. Jeden
stabilní běh dokládá kontinuitu v daném intervalu, není však zárukou, že budoucí
nezávislý deploy nikdy nerestartuje proces.
