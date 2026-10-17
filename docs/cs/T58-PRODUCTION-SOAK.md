# T58 – hodinový read-only test jedním příkazem s historií na GitHubu

## Spuštění

Po sloučení PR s tímto workflow do `main` stačí z libovolného počítače s
přihlášeným GitHub CLI:

```sh
gh workflow run t58-production-soak.yml --repo Boym323/AirRadar --ref main
```

Nebo z checkoutu repozitáře:

```sh
bash scripts/run-t58.sh
```

Alternativně **GitHub → Actions → T58 Production Soak → Run workflow → main**.

Test poběží 60 minut na GitHub runneru a provádí pouze autorizované čtení
existujících diagnostických endpointů. **Nenasazuje ani nerestartuje AirRadar,
nepřistupuje k databázi pro zápis a nemění nastavení produkce.**

## Jednorázové podmínky

- Produkční diagnostika na `https://airradar.pomykal.cz` musí být dostupná
  z GitHub runneru. Pokud je blokována firewallem/VPN, preflight bezpečně
  skončí chybou.
- Token vlož vždy **pouze** do repozitářového GitHub Actions secretu
  `T58_WATCHLIST_ADMIN_TOKEN` (Settings → Secrets and variables → Actions).
  Interní diagnostika je fail-closed i při starém open režimu watchlistu.
  Nepiš token do skriptu, parametrů příkazu, historie shellu, commitu ani issue.
- Nasazený commit musí obsahovat sloučené PR #885
  (`e9a9b8354fe1c433b4a3baf406574b9cc3d6f207`).
- V běžící aplikaci musí už být aktivní volitelná diagnostika
  `AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED=true`. Test ji
  **sám nezapíná** a bez ní se záměrně nespustí. Případná změna vyžaduje
  samostatně schválený release; žádný automatický restart.

**Spouštěný sběrný příkaz**

Workflow používá následující čtecí sběrač a existující analytický skript:

```sh
T57_SECONDS=3600 T57_INTERVAL_SECONDS=60 T57_WARMUP_SECONDS=600 \\
  T57_EXPECTED_COMMIT=<overeny_produkci_commit> \\
  node scripts/t57-production-soak.mjs
```

## Co se změří

Používá se stejný `scripts/t57-production-soak.mjs` a analyzátor jako při
T57, ale nastavení je 3 600 sekund, interval 60 sekund a warmup 600 sekund.
Preflight ověří dostupnost diagnostiky a povolené forenzní metriky, aktuální
commit se uzamkne pro celý běh. Změna procesu/commitu je samostatný segment,
výpadky vzorků se nezamlčují.

## Výsledky a historie

- [GitHub Actions](https://github.com/Boym323/AirRadar/actions/workflows/t58-production-soak.yml)
   ukáže průběh a závěrečné porovnání s T57.
- Každý běh poskytne artefakt s `soak.summary.json`,
   `soak.summary.md` a `comparison.md`; GitHub jej uchovává 90 dnů.
- Po vytvoření kompletního reportu se anonymizovaný výstup uloží trvale do
   samostatné větve
   [`audit/t58-history`](https://github.com/Boym323/AirRadar/tree/audit/t58-history/reports/t58).
   V adresáři `reports/t58/` vznikne `INDEX.md` s odkazy na jednotlivé
   měření. Každý pokus má vlastní složku (datum, GitHub run ID, attempt).

**Do GitHubu se neukládá syrový NDJSON deník, přístupové údaje ani identita
či souřadnice letadel.** Sběrová úloha má oprávnění jen číst; samostatná
archivační úloha může zapisovat do Git, ale nemá token k administraci AirRadaru.

Pokud administrátor zakázal zápis GitHub Actions do repozitáře nebo chrání
archivní větev, report zůstane v artefaktu běhu a archivace viditelně selže.

## Jak interpretovat T58 proti T57

Referenční produkční T57 měřil commit `ca25f52b`, verzi `1.0.454`,
61/61 vzorků, CPU P50/P95 41,782/59,258 %, Event Outcome 439,8 s
atributovaného CPU za hodinu a nejdelší zdržení event loopu 5,662 s.

Srovnání používá CPU na jedno volání, P95/P99, maximální zdržení,
ATC cache, RSS a počet letadel/čekajících predikcí. Zohledňuje, že jde o
**pozorovací porovnání různých provozních hodin**, nikoliv identickou zátěž.
`PASS_WITH_LIMITATIONS` znamená dostatečnou úplnost dat, nikoliv záruku
zrychlení. Automatické pravidelné spouštění není součástí tohoto řešení.

**Referenční metriky T57**

| Ukazatel | T57 |
| --- | ---: |
| CPU P50 / P95 | 41,782 % / 59,258 % |
| Event-loop p99 P95 minutových oken | 396,624 ms |
| Nejdelší blokace event loopu | 5 662,310 ms |
| `twin.eventOutcome.local` | 439 837,391 ms CPU / 842 volání |
| RSS P50 | 939,445 MiB |
| ATC truth cache hit rate | 36,5 % |
| Lokální letadla P50 | 78 |
| Čekající predikce P50 | 15 |
