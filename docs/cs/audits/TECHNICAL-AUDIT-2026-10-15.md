# Technický audit AirRadaru — 15. 10. 2026

## Shrnutí

Jde o audit aktuálního repozitáře a veřejně dostupné produkční diagnostiky v
režimu pouze pro čtení. Produkční služba, databáze, cooldowny, konfigurace
providerů, secrety, migrace, build ani release nebyly změněny.

Na hranici pozorování (15:04 UTC / 17:04 CEST) produkce obsluhovala
`1.0.462`, commit `e8282c48`, zatímco aktuální zdrojový `main` byl
`475c40ed`. Produkční health byl HTTP 200: aplikace, databáze a lokální
přijímač byly zdravé; ve vzorku bylo 73 lokálních letadel.

Audit nepotvrdil kořenovou příčinu PostgreSQL pro historické hodnoty P95/P99.
Aktuální telemetry rozlišuje tyto skutečnosti:

- databázový health byl OK; poslední hodinové rozdělení latence mělo P50 4 ms,
  P95 986 ms a P99 4 994 ms z 62 vzorků; 24hodinové P99 bylo 1 153 ms;
- route-cache zaznamenala 108 bypassů kvůli souběhu a 24 chyb DB; jde o důkaz
  aplikačního admission/error stavu, nikoli o důkaz pětisekundového SQL dotazu;
- ADSB.lol routeset byl v trvalém cooldownu do 20:37 CEST, měl 115
  blokovaných lookupů a žádný nový probe; provozně zůstává
  `BLOCKED_BY_PROVIDER_APPROVAL`;
- runtime vzorek měl event-loop P50/P95/P99 přibližně 20,1/21,0/59,6 ms,
  ale jedno omezené okno dosáhlo 4 152 ms. Příčina nebyla určena a nebyl
  proveden spekulativní přepis runtime;
- RSS byl přibližně 1,48 GiB a použitý heap přibližně 617 MiB. Jde o signál
  paměťového tlaku, nikoli důkaz memory leaku.

Konkrétním výsledkem auditu je omezený orchestrátor
`npm run audit:integrations` s režimy pouze pro čtení, offline fixture a CI,
sanitizovaným JSON/Markdown výstupem, klasifikací stavů a regresními testy.
Nikdy neposílá probe providerům ani zápisy do databáze.

## 1. Stav repozitáře, deploymentu a GitHubu

| Položka | Důkaz | Výsledek |
| --- | --- | --- |
| Aktuální checkout | `475c40ed942c30713026e17eafda0858feac6c98` | `main`, čistý sledovaný strom před auditem |
| Produkce | `/api/version` | `1.0.462`, `e8282c48`, production channel |
| Zdroj vs. produkce | kontrola ancestry | aktuální `main` je napřed pouze metadata commitem |
| Otevřené PR | GitHub search | žádné |
| Poslední úspěšné CI | [run 38753979148](https://github.com/Boym323/AirRadar/actions/runs/38753979148) | success pro release commit |
| Poslední CodeQL | [run 38752725190](https://github.com/Boym323/AirRadar/actions/runs/38752725190) | success na commitu `90b17978` |
| T58 soak | [run 38754621669](https://github.com/Boym323/AirRadar/actions/runs/38754621669) | probíhá; výsledek se netvrdí |

Požadované optimalizační a bezpečnostní PR jsou v ancestry obsluhovaného
commitu: [#895](https://github.com/Boym323/AirRadar/pull/895),
[#896](https://github.com/Boym323/AirRadar/pull/896),
[#898](https://github.com/Boym323/AirRadar/pull/898),
[#899](https://github.com/Boym323/AirRadar/pull/899),
[#902](https://github.com/Boym323/AirRadar/pull/902) a
[#906](https://github.com/Boym323/AirRadar/pull/906). Tato kontrola ancestry
nenahrazuje srovnatelný produkční benchmark po každé optimalizaci.

## 2. Produkční stav a matice providerů

Produkční pozorování byla získána omezenými GET požadavky. Raw payloady
letadel, identifikátory, pozice, texty chyb providerů, credentials a databázové
řádky nebyly zapsány do auditního výstupu.

| Oblast/provider | Stav | Důkaz nebo omezení |
| --- | --- | --- |
| readsb / lokální Beast + JSON failover | VERIFIED HEALTHY | Health hlásí živý lokální zdroj; vzorek měl 73 letadel. |
| Dostupnost PostgreSQL | VERIFIED HEALTHY | Health hlásí databázi `ok`; nejde o důkaz pool/lock/SQL příčiny. |
| ADSBHub | NOT VERIFIED | Implementováno a inventarizováno; aktivní probe nebyl spuštěn. |
| ADSB.lol live coverage | NOT VERIFIED | Nebyl spuštěn oddělený probe live provideru. |
| ADSB.lol HTTP fallback | NOT VERIFIED | Nebyl spuštěn aktivní fallback request. |
| ADSB.lol routeset | BLOCKED | Aktivní refusal cooldown; nový POST nebyl odeslán. Je třeba schválení providerem. |
| OGN APRS-IS | NOT VERIFIED | Live integrace nebyla testována. |
| OGN DDB | NOT VERIFIED | Nebyl spuštěn refresh. |
| SoftRF snapshot | NOT VERIFIED | Čerstvost lokálního snapshotu nebyla v produkci nezávisle odečtena. |
| ADSBDB | NOT VERIFIED | Nebyl odeslán externí enrichment request. |
| RXW Hub / FPN | NOT VERIFIED | Nebyl odeslán aktivní požadavek hubu. |
| Aviation Weather / METAR / TAF / SIGMET / PIREP | NOT VERIFIED | On-demand integrace nebyly testovány. |
| Airport/aircraft metadata | NOT VERIFIED | Hranice existují ve zdroji; produkční freshness není v bezpečném endpointu. |
| ATC sektory/trasy/body | NOT VERIFIED | Zdroj i testy existují; aktivace ani produkční geometry canary se neměnily. |

`AIRRADAR_ATC_RESOLUTION_ENABLED=false` a
`AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED=false` jsou hodnoty lokálního
deploymentu. Health endpoint hlásí 114 nakonfigurovaných sektorů. Automatické
resolution audit neaktivoval.

## 3. PostgreSQL a route cache

Veřejná process telemetry nevystavuje odděleně čekání na pool, serverové SQL,
lock wait ani event-loop scheduling. P95/P99 proto znamenají inclusive
aplikační pozorování a nesmí se číst jako jeden PostgreSQL dotaz trvající
4 994 ms.

### Důkazy

| Metrika | Hodnota |
| --- | ---: |
| DB vzorky, poslední hodina | 62 |
| DB P50 / P95 / P99, poslední hodina | 4 / 986 / 4 994 ms |
| DB P50 / P95 / P99, posledních 24 hodin | 6 / 205 / 1 153 ms |
| Route DB chyby | 24 |
| Route DB bypassy | 2 085 |
| Route-cache concurrency bypassy od startu procesu | 108 |
| Route-cache timeouty | 0 |
| Route-cache connection failures | 0 |
| Route-cache SQL P50 / P95 / P99 | 7,4 / 33,8 / 88,5 ms |

Route cache už obsahuje omezený foreground concurrency, nižší limit zápisů,
circuit/backoff stav, timeout accounting držící slot do skutečného dokončení
promise a žádné runtime DDL. Naměřené concurrency bypassy jsou reálný symptom,
ale bez pool a DB důkazů neodůvodňují zvýšení limitů ani timeoutů. Index ani
databázová migrace se nenavrhují.

### Klasifikace kořenové příčiny

| Kandidát | Výsledek |
| --- | --- |
| Nedostupná databáze | Aktuální health to nepodporuje; není prokázanou příčinou |
| PostgreSQL lock/deadlock | NOT VERIFIED; v tomto běhu nebyla dostupná read-only kontrola locků |
| Čekání na connection pool | NOT VERIFIED |
| Čas SQL execution | Nelze oddělit od inclusive client timing |
| Aplikační admission concurrency | POTVRZENÝ symptom: 108 route-cache bypassů |
| Odmítnutí routesetu providerem | POTVRZENO a nezávislé: cooldown bez nového requestu |
| Node scheduling/GC jako příčina 4,15s stallu | UNKNOWN; pouze korelace |

Přesná kořenová příčina DB latence zůstává `INSUFFICIENT EVIDENCE`.

## 4. Runtime, paměť, SSE a ATC

Runtime endpoint vrátil 15 omezených event-loop oken. Největší maximum bylo
4 152 ms, zatímco bodové P50/P95/P99 bylo přibližně 20,1/21,0/59,6 ms. To
nevyvrací historický 7,4s event ani nepotvrzuje leak. Potvrzuje to, že v
nedávném okně se stále vyskytují několikasekundové stalls; je třeba chráněný
soak s CPU, GC, cgroup throttling a fázovou atribucí.

Paměť byla přibližně 1,48 GiB RSS, 617 MiB použitý heap a 923 MiB heap total.
Heap snapshot nebyl pořízen, protože může obsahovat citlivá runtime data.
Dlouhodobé struktury jsou ve zdroji omezené pro trails, metadata, SSE,
enrichment, ATC i fronty providerů; retention není bez delšího soaku ověřena.

SSE fan-out nebyl zatěžován. Produkční vzorek měl nula aktivních SSE klientů,
takže neověřuje chování s 1/5/20 klienty, reconnect ani backpressure.
Implementace z #895 zůstává bounded/coalesced a zachovává V1/V2 sequence state;
veřejný protokol se neměnil.

ATC implementace obsahuje asynchronní přípravu datasetu, bbox candidate index,
immutable atomic publication, vertical filtering a freshness/generation guard.
Existují differential/geometry testy. Produkční aktivace ani benchmark
50/100/250/500 letadel v tomto auditu spuštěny nebyly.

## 5. Bezpečnost a zacházení s daty

- `.env` je z Git ignorován a má režim `0600`, vlastníkem je service account.
- `.env.dev.local` je z Git ignorován a byl opraven z `0644` na `0600`; míří
  na izolovanou databázi `airradar_dev`. Žádné hodnoty secretů nejsou v reportu.
- V auditním artefaktu není žádný secret, token, password, database URL, raw
  position ani identifikátor letadla.
- Produkce má `AIRRADAR_ADMIN_AUTH_ENABLED=false`. Jde o záměrný režim privátního
  receiveru, ale admin diagnostika spoléhá na síťové soukromí. Zapnutí auth
  vyžaduje schválení operátora a token; zde se neměnilo.
- CodeQL hardening z #896 je v ancestry. Poslední pozorovaný CodeQL byl
  úspěšný, ale nový PR bez alertů se netvrdí před jeho vlastním během.

## 6. Provedené změny

| Oblast | Původní problém | Změna | Ověření | Stav |
| --- | --- | --- | --- | --- |
| Integration diagnostics | Původní skript pokrýval jen route counters a neměl jeden machine-readable verdict | Přidán `scripts/integration-audit.mjs` s režimy read-only/offline/CI, bounded GET, sanitizací, inventářem providerů, porovnáním a JSON/Markdown | 2 Vitest testy, syntax check, diff check | FIXED LOCALLY; CI PENDING |
| Security regression | Auditní výstup nesmí být raw HTTP/file sink | Přidány allowlist projekce a safety flags; fixture test odmítá raw aircraft payload | Dedikovaný Vitest regression prošel | FIXED LOCALLY; CI PENDING |
| CI viditelnost | Integration health neměl uložený sanitizovaný report | Workflow nyní audit spouští a ukládá pouze omezené JSON/Markdown artefakty | Změna čeká na CI | FIXED LOCALLY; CI PENDING |
| Lokální permissions secretů | `.env.dev.local` byl čitelný pro všechny (`0644`) | Změněn pouze režim na `0600`; obsah beze změny | `stat`, kontrola izolované DB | FIXED LOCALLY |

Neměnilo se chování routesetu, autorizace providerů, aktivace ATC, schema DB,
pool limity, retry, SSE protokol ani produkční deployment.

## 7. Výkonnostní srovnání

Pro tento audit neexistuje platný before/after produkční experiment. T57/T58 a
benchmarky PR mají odlišné commity nebo workloady a zůstávají observační či
syntetické.

| Měření | Aktuálně | Platné before/after tvrzení |
| --- | ---: | --- |
| DB P95/P99 poslední hodiny | 986 / 4 994 ms | Ne; inclusive telemetry bez matched baseline |
| Route-cache SQL P50/P95/P99 | 7,4 / 33,8 / 88,5 ms | Ne; rolling process sample |
| Event-loop max ve vrácených oknech | 4 152 ms | Ne; bez matched soaku a příčiny |
| RSS / použitý heap | 1,48 GiB / 617 MiB | Ne; pouze bodový vzorek |

Správný závěr je `INSUFFICIENT EVIDENCE` pro produkční speedup nebo odstranění
leaku. Syntetické benchmarky a differential testy jsou regresní gates, nikoli
důkaz produkční kauzality.

## 8. CI, PR a release plán

Auditní branch má obsahovat jeden reviewovatelný PR s automatizací a testy.
Před merge musí projít Vitest, TypeScript, ESLint, production build/
release-preview, browser gates, performance regression a CodeQL. Implementace je
připravena v draftu [PR #912](https://github.com/Boym323/AirRadar/pull/912);
PR nebyl mergnut a release se nespouštěl.

Po výslovném schválení je bezpečný postup:

1. Zkontrolovat auditní artefakt a přesné PR checks.
2. Mergovat pouze přes chráněný `main`; v této relaci nemergovat automaticky.
3. Nechat standardní CI/deploy ověřit a nasadit pinned artifact; nespouštět
   `npm run build` v živém checkoutu.
4. Po deployi spustit nový read-only audit a uložit sanitizovaný artefakt.
5. Spustit autentizovaný read-only soak s process identity, route queue/admission,
   DB operation, event-loop, GC, RSS a SSE agregáty. Produkční SSE load test
   vyžaduje explicitní schválení.
6. U routesetu kontaktovat ADSB.lol a získat produkční approval před recovery
   requestem. Cooldown se nesmí resetovat ani obcházet změnou identity.

Rollback auditního kódu je běžný application release rollback přes
`deploy/release.sh`; protože změna nemá DB migraci, není nutný DB rollback.
Lokální oprava permissions je vratná explicitní akcí, ale `0600` má zůstat.

## 9. Konečný stav

### HOTOVO

- Ověřen aktuální zdroj, served identity, ancestry PR, CI/CodeQL a veřejný
  produkční health.
- Read-only diagnostika proběhla bez POSTů providerům, DB zápisů, restartů,
  migrací a release akcí.
- Odděleny konkrétní nálezy route-cache, routesetu, latency tailu,
  runtime stallu a paměti od nepodložených příčinných tvrzení.
- Přidány bounded integration audit, regresní testy a CI artifact plumbing.
- Lokální `.env.dev.local` má opravená permissions `0600`.

### ČEKÁ NA SCHVÁLENÍ

- Produkční release nebo deploy této branch.
- Recovery probe routesetu nebo žádost o provider approval.
- Aktivace ATC resolution, změna admin auth, DB settings/limitů nebo produkční
  SSE/browser load.

### NEOVĚŘENO

- Rozdělení PostgreSQL pool acquisition vs. lock wait vs. server SQL execution.
- Úplná freshness/connectivity matice on-demand integrací.
- Produkční ATC geometry canary a benchmark 50/100/250/500 letadel.
- Reálný browser SSE fan-out, reconnect a backpressure s 1/5/20 klienty.
- Důkaz memory retention/leaku a příčina nedávného 4,15s event-loop maxima.
- Nové CI, CodeQL, production build a browser gates do doby běhů GitHubu.
