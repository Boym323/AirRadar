# AirRadar — zadání redukce zbytečné runtime práce (18. 10. 2026)

[English](../../agents/RUNTIME-REDUNDANT-WORK-2026-10-18.md)

> **Časově označené zadání konkrétní úlohy, nikoli globální instrukce.** Nejprve načti kořenový [AGENTS.md](../../../AGENTS.md). Aktuální implementace, ověřené testy a aktuální SHA mají přednost před touto historickou baseline. Používej [výkonový postup](PERFORMANCE-WORKFLOW.md), [pravidla vývoje](../DEVELOPMENT.md) a [runtime invarianty](../RUNTIME-INVARIANTS.md). Pokud starší dokument zmiňuje PR/větve, má přednost pravidlo přímého vývoje do `main` z kořenového AGENTS.md.

## Cíl

Prokazatelně snížit **zbytečné výpočty, kopírování/alokace, databázovou práci a režii plánování** AirRadaru bez ztráty funkcí či změny významu dat. Nejde o svolení vypínat síťové zdroje, historii, prediktivní evidenci, ATC, telemetrii ani bezpečnostní ochrany. Neprováděj spekulativní přepis do Rustu ani plošné mazání kódu.

**Způsob práce:** Na začátku ověř čerstvý `origin/main` a identitu produkce. Použij oddělený neprodukční checkout, malé samostatně ověřené změny a neforce commity přímo do `main` s jedním zapisujícím agentem. Push může vyvolat stávající automatické CI/CD. **Bez samostatného výslovného povolení** nespouštěj ruční deploy/restart, neměň produkční nastavení/secrety/DB a neprováděj těžké testy v živém checkoutu.

## Historická baseline: T58 #20 (nejde o potvrzení současného stavu)

- [GitHub Actions run 39132862866](https://github.com/Boym323/AirRadar/actions/runs/39132862866): všech sedm částí úspěšně dokončeno, verdikt `PASS_WITH_LIMITATIONS`.
- [Archivovaný sanitizovaný report](https://github.com/Boym323/AirRadar/blob/audit/t58-history/reports/t58/2026/10/18/run-39132862866-attempt-1/summary.md): měřená verze `1.0.516`, SHA `fd19dbdd`, 61/61 platných vzorků, žádné mezery, 3 602,094 s a jediný stabilní proces.
- CPU P50/P95 **17,009 / 19,092 %**; RSS P50/P95/max **910,094 / 937,477 / 947,066 MiB**; heap P50/P95/max **466,082 / 589,933 / 675,367 MiB**.
- P99 event-loop v dokončených oknech, P50/P95/max **43,516 / 50,233 / 51,610 ms**; nejhorší stall **1 184,891 ms**, jedna blokace nad 1 s **bez prokázané synchronní příčiny**.
- Post-major-GC trend: heap **+96,326 MiB**, old-space **+78,233 MiB**, RSS **+48,262 MiB**. Samo o sobě to nedokazuje leak.
- Instrumentované přibližné CPU časy, **inkluzivní a překrývající se**: `ingest.local-beast` **61,5 s**, `snapshot.network` **45,1 s**, `history.persist` **41,6 s**, `snapshot.network.ingest` **27,7 s**. Časy vnořených scope nesčítej; async elapsed není exkluzivní CPU.
- `snapshot.trail-update` mělo **3 731 544 volání** v dokončených oknech. Jde o **aktualizace stop letadel (trail)**, nikoli o vyhodnocování letových tras.
- Omezení: **0 SSE klientů**, neřízený letecký provoz, vypnutý cgroup CPU throttling controller a neměřená server-side SQL latence. Rozdíl vůči T57 není kontrolovaný kauzální důkaz.

## Pracovní balíčky

Následující oblasti jsou **kandidáti**, nikoli potvrzená zbytečná práce. Před další změnou dokonči ověření předchozí.

### P0 — Síťové snapshoty: no-op a alokace

Prověř `lib/server/aircraft-state.ts` (`applyNetworkSnapshotCore`, `updateTrail`, continuity, source affinity, track fusion), `lib/server/network-failover-provider.ts` a příslušné testy.

- Změř počet přijatých identit, skutečně změněných pozic/zpráv/provenance, zahozených stale záznamů, zápisů do map, kopií objektů, klíčů track fusion a invalidací live snapshotů na jeden poll.
- Pokud má význam, navrhni **konzervativní fast path pro nezměněná pozorování**, který zachová čerstvost a příchozí časy, původ a prioritu zdrojů, přepnutí se grace period, ochranu mass-drop, stopy, analytiku, stav letadel, track fusion i publikaci SSE.
- Stejné ICAO neznamená stejné pozorování. Nepřeskakuj expiraci, stárnutí pozice, přechod zdroje ani retenční limity. Nedělej již hotovou optimalizaci znovu.

### P1 — Ukládání historie: skutečné no-op operace

Prověř `lib/server/aircraft-state.ts` (`queueHistory`, `drainHistoryQueue`, `persistHistoryCore`), `lib/server/history.ts`, `lib/server/history-statement-profiler.ts`, vzorkování a DB testy.

- Měř kandidáty vs splatné polohy, prázdnou údržbu, počet batchů/řádků, SQL settlement, chyby/opakování, hloubku fronty a prodlevy.
- Odstraňuj jen **prokázané** duplicitní převody, prázdnou práci či dotazy, u nichž jsou vedlejší účinky bezpečně vyřešené. Zachovej first sighting, retry pro ICAO, jednořadový koaleskovaný writer, periodickou údržbu i fail-soft DB chování.
- Rozliš klientskou/Prisma dobu od **server-side SQL času**, který T58 neměřilo. Bez autorizace neměň schéma ani indexy produkční DB.

### P2 — Lokální BEAST ingest a trail

Před změnou zjisti, co už zajišťuje Rust parser/CRC24 a Node adaptér. Měř počet rámců, alokace, objektové konverze, kopírování a režii přechodu mezi jazyky.

- Prověř, zda zbytečně nevznikají objekty nebo změny trailu u nezměněných pozorování; zachovej parity partial frames, escaped bytes, provenance a ne-ICAO identity.
- U `snapshot.trail-update` dolož cenu jednoho volání a celkový význam; **počet volání není důkazem plýtvání**.
- Přepis do Rust/C++ jen při stabilním A/B přínosu na stejné zátěži **včetně FFI režie**, parity fallbacku a rollbacku.

### P3 — Zbytkové stally, paměť a SSE

- Prověř jednorázový 1,185s stall pomocí omezené event-loop/synchronní ingest diagnostiky. Korelace sama nedokazuje příčinu GC, snapshotu nebo DB.
- Vyšetři post-major-GC trend a retenční struktury v izolovaném DEV. Bez dalšího souhlasu nedělej produkční heap snapshoty, forced GC ani citlivé dumpy.
- Doplň **izolované** scénáře s 0/10/50 SSE klienty, měř event-loop, CPU, alokace, bounded/coalesced delivery i disconnect cleanup. Historické T58 žádné klienty nemělo.
- Zachovej sanitizované read-only GET diagnostiky. Kvůli úloze neměň produkční telemetrii ani cgroup nastavení.

## Metodika a akceptace

1. Před úpravou zapiš aktuální SHA `main`/produkce, skutečné vlastnictví kódu a zdroj evidence. Rozliš **pozorování / hypotéza / neměřeno**.
2. V izolovaném DEV/CI vytvoř reprodukovatelný baseline na pevném syntetickém/replay workloadu: malé/střední/velké počty letadel, 0/10/100 % změněných dat, vybrané kombinace providerů, cold/warm cache a případně 0/10/50 SSE klientů. Zapiš Node/Rust verzi, runner, seed, počet pollů a feature flags.
3. Kandidáta porovnej se stejnou baseline v opakovaných bězích. Dolož rozptyl, throughput, CPU nebo CPU-ms/event, alokace bytes/event, RSS/heap/GC, event-loop P95/P99/max a DB settlement. Nevydávej překrývající se časy za výlučné CPU.
4. Ověř funkční paritu: ICAO/callsign, stale/chybějící pozice, source affinity a MLAT, smíšené zdroje, trail, continuity guard, network-only RAM-only, historie a retry, SSE 0/slow/disconnect, alerty a výpadky volitelných providerů dle rozsahu.
5. Spusť cílené testy, typecheck, lint, dotčené features/docs/visual/production gates a celý suite, vyžaduje-li to dopad. Před push ověř celý diff, release scope a EN/CZ dokumentační dopad.
6. **KEEP** jen při opakovatelném přínosu nad šumem bez regrese správnosti, tailů a bezpečnosti; jinak **REWORK**, **REVERT** nebo **NO_CHANGE**. Nevytvářej commit jen pro zdání aktivity. Malý ověřený commit může jít přímo do `main`; před dalším release-triggering commitem ověř příslušné CI/CodeQL/deploy.
7. T58 slouží jako **observační post-deploy regresní kontrola**, nikoli náhrada kontrolovaného A/B. Nové T58 spusť pouze po ověření deploye, admin auth, workflow oprávnění a se samostatným výslovným schválením. Nikdy nepředstírej PASS ani nespouštěj ruční release bez autorizace.

## Výstupy

Pro každého kandidáta dodej (a) soubor/funkci a důkaz zbytečné práce, (b) srovnatelnou tabulku A/B s P50/P95/P99 a nejistotami, (c) regresní/paritní testy, (d) změněné soubory a commit v `main` + CI link, je-li opodstatněný, (e) možnost návratu, (f) omezení a neprokázaná tvrzení. Krátký závěrečný report česky s označením **PROKÁZÁNO / NEPROKÁZÁNO / NEOVĚŘENO**. Uveď také kandidáty ponechané beze změny.

**STOP:** porušená parita, chyba freshness/source arbitration, únik citlivých dat, riziko zásahu do historie/DB, nespolehlivý benchmark, selhání CI/CodeQL či neschválená produkční operace. V takovém případě produkci neměň a popiš blokaci.
